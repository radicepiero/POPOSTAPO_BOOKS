import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional
import requests
from sqlalchemy import and_, func, or_, select, text, literal_column
from ..database import SessionLocal
from ..models import Author, CopyEnrichmentJob, Edition, EditionsAuthor, EditionsWork, Language, Publisher, Work, WorksAuthor
from ..config import settings
from ..services.ocr import extract_metadata_from_image


OPENLIBRARY_ISBN_URL = "https://openlibrary.org/isbn/{isbn}.json"
OPENLIBRARY_AUTHOR_URL = "https://openlibrary.org{key}.json"
OPENLIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"
GOOGLE_BOOKS_ISBN_URL = "https://www.googleapis.com/books/v1/volumes"
GOOGLE_BOOKS_SEARCH_URL = "https://www.googleapis.com/books/v1/volumes"

logger = logging.getLogger("uvicorn.error")


def _log_source_response(source: str, operation: str, data: dict) -> None:
    logger.info("BIBLIOGRAPHIC_RESPONSE source=%s operation=%s\n%s", source, operation, json.dumps(data, ensure_ascii=False, indent=2))


def extract_year(publish_date: str) -> int | None:
    if not publish_date:
        return None
    match = re.search(r"\b(\d{4})\b", publish_date)
    return int(match.group(1)) if match else None


def fetch_openlibrary_author_name(key: str) -> str:
    try:
        resp = requests.get(OPENLIBRARY_AUTHOR_URL.format(key=key), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        _log_source_response("open_library", "author", data)
        return data.get("name") or key
    except Exception:
        return key


def _openlibrary_record_to_dict(data: dict, isbn: Optional[str] = None) -> dict:
    authors = []
    for author in data.get("authors", []):
        name = author.get("name")
        if not name and "key" in author:
            name = fetch_openlibrary_author_name(author["key"])
        if name:
            authors.append(name)

    publishers = [
        publisher.get("name") if isinstance(publisher, dict) else publisher
        for publisher in data.get("publishers", [])
    ]
    languages = [lang["key"].rsplit("/", 1)[-1] for lang in data.get("languages", []) if "key" in lang]
    isbn13 = data.get("isbn_13") or []
    isbn10 = data.get("isbn_10") or []
    resolved_isbn = isbn or (isbn13[0] if isbn13 else None) or (isbn10[0] if isbn10 else None)

    return {
        "source": "open_library",
        "external_id": data.get("key"),
        "record_type": "edition",
        "title": data.get("title"),
        "subtitle": data.get("subtitle"),
        "publishers": publishers,
        "publish_date": data.get("publish_date"),
        "year": extract_year(data.get("publish_date")),
        "pages": data.get("number_of_pages"),
        "authors": authors,
        "languages": languages,
        "covers": [f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" for cover_id in data.get("covers", [])],
        "isbn": resolved_isbn,
        "identifiers": {"isbn_13": isbn13, "isbn_10": isbn10},
        "edition_name": data.get("edition_name") or [],
    }


def _parse_google_volume(item: dict) -> dict:
    volume_info = item.get("volumeInfo", {})
    identifiers = volume_info.get("industryIdentifiers", [])
    isbn10 = isbn13 = None
    for ident in identifiers:
        if ident.get("type") == "ISBN_13":
            isbn13 = ident.get("identifier")
        elif ident.get("type") == "ISBN_10":
            isbn10 = ident.get("identifier")
    resolved_isbn = isbn13 or isbn10

    authors = volume_info.get("authors") or []
    published = volume_info.get("publishedDate")
    thumbnail = volume_info.get("imageLinks", {}).get("thumbnail")
    if thumbnail:
        thumbnail = thumbnail.replace("http://", "https://", 1)
    return {
        "source": "google_books",
        "external_id": item.get("id"),
        "record_type": "volume",
        "title": volume_info.get("title"),
        "subtitle": volume_info.get("subtitle"),
        "publishers": [volume_info.get("publisher")] if volume_info.get("publisher") else [],
        "publish_date": published,
        "year": extract_year(published),
        "pages": volume_info.get("pageCount"),
        "authors": authors,
        "languages": [volume_info.get("language")] if volume_info.get("language") else [],
        "covers": [thumbnail] if thumbnail else [],
        "isbn": resolved_isbn,
        "identifiers": {ident.get("type"): ident.get("identifier") for ident in identifiers if ident.get("type")},
    }


def _local_edition_to_dict(edition: Edition, db) -> dict:
    publisher = db.query(Publisher).filter(Publisher.id == edition.publisher_id).first() if edition.publisher_id else None
    language = db.query(Language).filter(Language.id == edition.language_id).first() if edition.language_id else None
    # Find linked work(s) via editions_works
    edition_work = db.query(EditionsWork).filter(EditionsWork.edition_id == edition.id).first()
    work_id = edition_work.work_id if edition_work else None
    work = db.query(Work).filter(Work.id == work_id).first() if work_id else None
    work_authors = (
        db.query(Author, WorksAuthor.role)
        .join(WorksAuthor, WorksAuthor.author_id == Author.id)
        .filter(WorksAuthor.work_id == work_id)
        .all()
    ) if work_id else []
    contributors = (
        db.query(Author, EditionsAuthor.role)
        .join(EditionsAuthor, EditionsAuthor.author_id == Author.id)
        .filter(EditionsAuthor.edition_id == edition.id)
        .all()
    )
    source_data = edition.source_data or {}

    # Authors: raw column first, then source_data, then relational work authors
    authors = edition.authors or []
    if not authors:
        authors = source_data.get("authors") or []
    if not authors and work_id:
        authors = [f"{author.given_name} {author.family_name}".strip() for author, role in work_authors if role in ("author", "co_author")]

    # Publisher
    publisher_name = publisher.name if publisher else None
    if not publisher_name:
        publisher_name = source_data.get("publisher") or (source_data.get("publishers") or [None])[0]
    publishers = [publisher_name] if publisher_name else []

    # Language
    language_code = language.code if language else None
    if not language_code:
        language_code = source_data.get("language")
    languages = [language_code] if language_code else []

    # Covers / thumbnail
    covers = edition.covers or []
    if not covers:
        covers = source_data.get("covers") or []
    thumbnail = covers[0] if covers else source_data.get("thumbnail")

    return {
        "source": "postgresql",
        "external_id": str(edition.id),
        "record_type": "edition",
        "local_edition_id": edition.id,
        "title": edition.title,
        "subtitle": edition.subtitle,
        "publishers": publishers,
        "publisher": publisher_name,
        "publish_date": str(edition.publishing_year) if edition.publishing_year else None,
        "year": edition.publishing_year,
        "pages": edition.pages,
        "authors": authors,
        "contributors": [
            {"name": f"{author.given_name} {author.family_name}".strip(), "role": role}
            for author, role in contributors
        ],
        "language": language_code,
        "languages": languages,
        "covers": covers,
        "thumbnail": thumbnail,
        "isbn": edition.isbn13 or edition.isbn10,
        "average_rating": source_data.get("average_rating"),
        "ratings_count": source_data.get("ratings_count"),
        "preview_url": source_data.get("preview_url"),
        "info_url": source_data.get("info_url"),
        "dimensions": source_data.get("dimensions"),
        "weight": source_data.get("weight"),
        "print_type": source_data.get("print_type"),
        "physical_format": source_data.get("physical_format"),
        "edition_name": source_data.get("edition_name"),
        "series": source_data.get("series"),
        "publish_places": source_data.get("publish_places"),
        "ebook_access": source_data.get("ebook_access"),
        "has_fulltext": source_data.get("has_fulltext"),
        "other_identifiers": source_data.get("other_identifiers"),
    }


def lookup_local_editions_advanced(isbn: str = "", title: Optional[str] = None, author: Optional[str] = None) -> dict:
    """Field-specific search: each non-empty field adds an AND filter."""
    from ..models import EditionsWork, WorksAuthor, Author as AuthorModel
    db = SessionLocal()
    try:
        normalized_isbn = re.sub(r"[^0-9X]", "", isbn.upper()) if isbn else ""
        filters = []

        if normalized_isbn:
            filters.append(or_(Edition.isbn13 == normalized_isbn, Edition.isbn10 == normalized_isbn))

        if title:
            # Each word must appear in title or subtitle
            for word in title.strip().split():
                w = f"%{word}%"
                filters.append(or_(Edition.title.ilike(w), Edition.subtitle.ilike(w)))

        if author:
            # Author names via relational tables (works_authors + editions_authors)
            author_subq = (
                select(func.string_agg(
                    AuthorModel.given_name + literal_column("' '") + AuthorModel.family_name,
                    literal_column("' '")
                ))
                .select_from(EditionsWork.__table__
                    .join(WorksAuthor.__table__, WorksAuthor.work_id == EditionsWork.work_id)
                    .join(AuthorModel.__table__, AuthorModel.id == WorksAuthor.author_id))
                .where(EditionsWork.edition_id == Edition.id)
                .correlate(Edition)
                .scalar_subquery()
            )
            hybrid_authors = func.array_to_string(Edition.authors, ' ')
            for word in author.strip().split():
                w = f"%{word}%"
                filters.append(or_(author_subq.ilike(w), hybrid_authors.ilike(w)))

        if not filters:
            return {"found": False, "source": "postgresql", "reason": "No search criteria provided"}

        query = db.query(Edition).filter(and_(*filters))

        # Rank by search_vector if available, otherwise by id
        if title or author:
            terms = " ".join(filter(None, [title, author]))
            tsquery = func.plainto_tsquery(literal_column("'simple'"), terms.strip())
            rank = func.ts_rank(func.coalesce(Edition.search_vector, func.to_tsvector(literal_column("'simple'"), literal_column("''"))), tsquery)
            editions = query.order_by(rank.desc()).limit(20).all()
        else:
            editions = query.order_by(Edition.id).limit(20).all()

        if not editions:
            return {"found": False, "source": "postgresql", "reason": "No matching edition in local database"}
        return {
            "found": True,
            "source": "postgresql",
            "candidates": [_local_edition_to_dict(edition, db) for edition in editions],
        }
    finally:
        db.close()


def lookup_local_editions(isbn: str = "", title: Optional[str] = None, author: Optional[str] = None) -> dict:
    db = SessionLocal()
    try:
        normalized_isbn = re.sub(r"[^0-9X]", "", isbn.upper()) if isbn else ""

        if normalized_isbn:
            # ISBN: exact match
            query = db.query(Edition).filter(
                or_(Edition.isbn13 == normalized_isbn, Edition.isbn10 == normalized_isbn)
            )
            editions = query.order_by(Edition.id).limit(20).all()
        elif title or author:
            # Full-text search on stored search_vector (populated by trigger)
            search_terms = " ".join(filter(None, [title, author]))
            tsquery = func.plainto_tsquery(literal_column("'simple'"), search_terms.strip())
            rank = func.ts_rank(Edition.search_vector, tsquery)

            query = db.query(Edition).filter(
                Edition.search_vector.isnot(None),
                Edition.search_vector.op("@@")(tsquery),
            )
            editions = query.order_by(rank.desc()).limit(20).all()

            # Fallback: ILIKE on title + relational author names
            if not editions:
                pattern = f"%{search_terms.strip()}%"
                # Build subquery for author names via editions_works → works_authors → authors
                from ..models import EditionsWork, WorksAuthor, Author as AuthorModel
                author_subq = (
                    select(func.string_agg(
                        AuthorModel.given_name + literal_column("' '") + AuthorModel.family_name,
                        literal_column("' '")
                    ))
                    .select_from(EditionsWork.__table__
                        .join(WorksAuthor.__table__, WorksAuthor.work_id == EditionsWork.work_id)
                        .join(AuthorModel.__table__, AuthorModel.id == WorksAuthor.author_id))
                    .where(EditionsWork.edition_id == Edition.id)
                    .correlate(Edition)
                    .scalar_subquery()
                )
                fallback_query = db.query(Edition).filter(
                    or_(
                        Edition.title.ilike(pattern),
                        func.array_to_string(Edition.authors, ' ').ilike(pattern),
                        author_subq.ilike(pattern),
                    )
                )
                editions = fallback_query.order_by(Edition.id).limit(20).all()
        else:
            editions = []

        if not editions:
            return {"found": False, "source": "postgresql", "reason": "No matching edition in local database"}
        return {
            "found": True,
            "source": "postgresql",
            "candidates": [_local_edition_to_dict(edition, db) for edition in editions],
        }
    finally:
        db.close()


def lookup_openlibrary_isbn(isbn: str) -> dict:
    try:
        resp = requests.get(OPENLIBRARY_ISBN_URL.format(isbn=isbn), timeout=15)
        if resp.status_code == 404:
            return {"found": False, "source": "open_library", "reason": "ISBN not found in Open Library"}
        resp.raise_for_status()
        data = resp.json()
        _log_source_response("open_library", "isbn", data)
    except requests.RequestException as exc:
        return {"found": False, "source": "open_library", "reason": str(exc)}

    return {"found": True, "source": "open_library", "candidates": [_openlibrary_record_to_dict(data, isbn)]}


def _openlibrary_search_edition_to_dict(edition: dict, work: dict) -> dict:
    isbns = edition.get("isbn") or []
    isbn = next((value for value in isbns if len(value.replace("-", "")) == 13), isbns[0] if isbns else None)
    publish_date = edition.get("publish_date")
    cover_id = edition.get("cover_i")
    return {
        "source": "open_library",
        "external_id": edition.get("key"),
        "record_type": "edition",
        "title": edition.get("title") or work.get("title"),
        "subtitle": edition.get("subtitle"),
        "publishers": edition.get("publisher") or [],
        "publish_date": publish_date,
        "year": extract_year(publish_date),
        "pages": edition.get("number_of_pages"),
        "authors": edition.get("author_name") or work.get("author_name") or [],
        "languages": edition.get("language") or [],
        "covers": [f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"] if cover_id else [],
        "isbn": isbn,
        "identifiers": {"isbn": isbns},
        "edition_name": edition.get("edition_name") or [],
    }


def search_openlibrary(title: str, author: Optional[str] = None) -> dict:
    q = title
    if author:
        q += f" author:{author}"
    try:
        resp = requests.get(
            OPENLIBRARY_SEARCH_URL,
            params={"q": q, "fields": "key,title,author_name,editions", "limit": 10},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        _log_source_response("open_library", "search", data)
    except requests.RequestException as exc:
        return {"found": False, "source": "open_library", "reason": str(exc)}

    docs = data.get("docs", [])
    if not docs:
        return {"found": False, "source": "open_library", "reason": "No results for title/author"}

    candidates = [
        _openlibrary_search_edition_to_dict(edition, work)
        for work in docs
        for edition in (work.get("editions", {}).get("docs") or [])
    ]
    if not candidates:
        return {"found": False, "source": "open_library", "reason": "No edition records for title/author"}
    return {"found": True, "source": "open_library", "candidates": candidates[:10]}


def lookup_google_books_isbn(isbn: str) -> dict:
    params = {"q": f"isbn:{isbn}"}
    if settings.google_books_api_key:
        params["key"] = settings.google_books_api_key
    try:
        resp = requests.get(GOOGLE_BOOKS_ISBN_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        _log_source_response("google_books", "isbn", data)
    except requests.RequestException as exc:
        return {"found": False, "source": "google_books", "reason": str(exc)}

    items = data.get("items", [])
    if not items:
        return {"found": False, "source": "google_books", "reason": "ISBN not found in Google Books"}

    return {"found": True, "source": "google_books", "candidates": [_parse_google_volume(item) for item in items[:5]]}


def search_google_books(title: str, author: Optional[str] = None) -> dict:
    q = f"intitle:{title}"
    if author:
        q += f" inauthor:{author}"
    params = {"q": q, "maxResults": 10}
    if settings.google_books_api_key:
        params["key"] = settings.google_books_api_key
    try:
        resp = requests.get(GOOGLE_BOOKS_SEARCH_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        _log_source_response("google_books", "search", data)
    except requests.RequestException as exc:
        return {"found": False, "source": "google_books", "reason": str(exc)}

    items = data.get("items", [])
    if not items:
        return {"found": False, "source": "google_books", "reason": "No results for title/author"}

    return {"found": True, "source": "google_books", "candidates": [_parse_google_volume(item) for item in items[:5]]}


def _collect_candidates(results: list[dict]) -> dict:
    candidates = []
    sources = []
    reason = None
    for result in results:
        if result.get("found"):
            candidates.extend(result.get("candidates", []))
            sources.append(result.get("source"))
        elif not reason:
            reason = result.get("reason")

    if candidates:
        return {
            "found": True,
            "candidates": candidates,
            "sources": sources,
        }

    return {
        "found": False,
        "source": "open_library",
        "reason": reason or "No bibliographic source found",
    }


def lookup_isbn(isbn: str, title: Optional[str] = None, author: Optional[str] = None) -> dict:
    try:
        local_lookup = lookup_local_editions(isbn, title, author)
        if local_lookup["found"]:
            return local_lookup
    except Exception:
        logger.exception("LOCAL_BIBLIOGRAPHIC_LOOKUP_FAILED")

    reasons: list[str] = []

    # Lookup by ISBN in parallel if isbn is provided
    if isbn:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(lookup_openlibrary_isbn, isbn): "open_library",
                executor.submit(lookup_google_books_isbn, isbn): "google_books",
            }
            results = []
            for future in as_completed(futures, timeout=20):
                try:
                    results.append(future.result())
                except Exception as exc:
                    results.append({"found": False, "reason": str(exc), "source": futures[future]})
        isbn_lookup = _collect_candidates(results)
        if isbn_lookup["found"]:
            return isbn_lookup
        if isbn_lookup.get("reason"):
            reasons.append(isbn_lookup["reason"])

    # Search by title/author in parallel if provided
    if title or author:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(search_openlibrary, title, author): "open_library",
                executor.submit(search_google_books, title, author): "google_books",
            }
            search_results = []
            for future in as_completed(futures, timeout=20):
                try:
                    search_results.append(future.result())
                except Exception as exc:
                    search_results.append({"found": False, "reason": str(exc), "source": futures[future]})
        search_lookup = _collect_candidates(search_results)
        if search_lookup["found"]:
            return search_lookup
        if search_lookup.get("reason"):
            reasons.append(search_lookup["reason"])

    # Nothing found
    return {
        "found": False,
        "source": "open_library",
        "reason": "; ".join(reasons) if reasons else "No bibliographic source found",
    }


def process_enrichment_job(job_id: str, title: Optional[str] = None, author: Optional[str] = None):
    db = SessionLocal()
    try:
        job = db.query(CopyEnrichmentJob).filter_by(id=job_id).first()
        if not job:
            return

        # If an image is provided, try OCR to extract ISBN/title
        ocr_data: dict = {}
        if job.image_url:
            ocr_data = extract_metadata_from_image(job.image_url)

        isbn = job.isbn or ocr_data.get("isbn")
        ocr_title = title or ocr_data.get("title")
        ocr_author = author
        ocr_year = ocr_data.get("year")

        if not isbn and not ocr_title and not ocr_author:
            # Last resort: use the whole OCR text as query
            raw_text = ocr_data.get("text", "").strip()
            if raw_text:
                # Keep only words and spaces
                clean = re.sub(r"[^\w\s]", " ", raw_text)
                clean = re.sub(r"\s+", " ", clean).strip()
                ocr_title = clean[:250]
            else:
                job.status = "failed"
                job.result = {"reason": "ISBN or title/author missing; OCR could not extract usable text"}
                db.commit()
                return

        lookup = lookup_isbn(isbn or "", title=ocr_title, author=ocr_author)

        if lookup["found"]:
            job.result = {
                "candidates": lookup.get("candidates", []),
                "raw": {
                    **lookup,
                    "ocr": ocr_data,
                },
            }
            job.status = "completed"
        else:
            job.result = {**lookup, "ocr": ocr_data}
            job.status = "failed"

        job.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
