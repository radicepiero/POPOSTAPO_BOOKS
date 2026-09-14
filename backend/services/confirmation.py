from typing import Optional
from sqlalchemy.orm import Session
from ..models import Author, AuthorRole, Publisher, Work, Edition, Copy, CopyEnrichmentJob, WorksAuthor, EditionsAuthor, EditionsWork


# ---------------------------------------------------------------------------
# ISBN-10 / ISBN-13 conversion
# ---------------------------------------------------------------------------

def isbn13_to_isbn10(isbn13: str) -> Optional[str]:
    """Convert a 978-prefixed ISBN-13 to ISBN-10. Returns None for 979 prefix."""
    clean = isbn13.replace("-", "")
    if len(clean) != 13 or not clean.startswith("978"):
        return None
    body = clean[3:12]  # 9 digits without check
    total = sum(int(d) * (i + 1) for i, d in enumerate(body))
    remainder = total % 11
    check = "X" if remainder == 10 else str(remainder)
    return body + check


def isbn10_to_isbn13(isbn10: str) -> Optional[str]:
    """Convert an ISBN-10 to ISBN-13 (978 prefix)."""
    clean = isbn10.replace("-", "")
    if len(clean) != 10:
        return None
    body = "978" + clean[:9]
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(body))
    check = (10 - (total % 10)) % 10
    return body + str(check)


def normalize_isbn_pair(isbn: Optional[str] = None,
                        isbn10: Optional[str] = None,
                        isbn13: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
    """Return (isbn13, isbn10) computing the missing one when possible."""
    # Resolve from generic isbn if specific ones are missing
    if isbn:
        clean = isbn.replace("-", "")
        if len(clean) == 13 and not isbn13:
            isbn13 = clean
        elif len(clean) == 10 and not isbn10:
            isbn10 = clean

    # Compute missing counterpart
    if isbn13 and not isbn10:
        isbn10 = isbn13_to_isbn10(isbn13)
    elif isbn10 and not isbn13:
        isbn13 = isbn10_to_isbn13(isbn10)

    return isbn13, isbn10


def ensure_author_role(role: str, name_ita: str, db: Session) -> None:
    existing = db.query(AuthorRole).filter_by(role=role).first()
    if not existing:
        db.add(AuthorRole(role=role, name_ita=name_ita))
        db.flush()


def split_name(full_name: str):
    parts = full_name.strip().split()
    if len(parts) == 1:
        return "", parts[0]
    return " ".join(parts[:-1]), parts[-1]


def normalize_source(source: str) -> str:
    return {"openai_vision": "openai"}.get(source, source)


def find_or_create_author(full_name: str, source: str, db: Session) -> Author:
    given, family = split_name(full_name)
    author = db.query(Author).filter(
        Author.given_name == given,
        Author.family_name == family,
    ).first()
    if author:
        return author
    author = Author(
        given_name=given,
        family_name=family,
        status="proposed",
        source=source,
    )
    db.add(author)
    db.flush()
    return author


def find_or_create_publisher(name: Optional[str], source: str, db: Session) -> Optional[Publisher]:
    if not name:
        return None
    publisher = db.query(Publisher).filter(Publisher.name == name).first()
    if publisher:
        return publisher
    publisher = Publisher(name=name, status="proposed", source=source)
    db.add(publisher)
    db.flush()
    return publisher


def find_or_create_work(original_title: Optional[str], year: Optional[int], authors: list[str], source: str, db: Session) -> Work:
    title = original_title or "Titolo sconosciuto"
    work = db.query(Work).filter(Work.original_title == title).first()
    if work:
        return work
    work = Work(
        original_title=title,
        publishing_year=year,
        status="proposed",
        source=source,
    )
    db.add(work)
    db.flush()
    for author_name in authors:
        author = find_or_create_author(author_name, source, db)
        db.add(WorksAuthor(work_id=work.id, author_id=author.id, role="author"))
    return work


def _fill_missing(edition: Edition, **kwargs) -> bool:
    """Set attributes on edition only where the current value is None/empty.
    Returns True if anything was changed."""
    changed = False
    for attr, new_value in kwargs.items():
        if new_value is None:
            continue
        current = getattr(edition, attr, None)
        if current is None or (isinstance(current, list) and len(current) == 0):
            setattr(edition, attr, new_value)
            changed = True
    if changed and edition.source_data and kwargs.get("source_data"):
        merged = {**edition.source_data, **kwargs["source_data"]}
        edition.source_data = merged
    return changed



def _editions_match(edition: Edition, title: str, subtitle: Optional[str],
                     year: Optional[int], pages: Optional[int],
                     publisher_id: Optional[int]) -> bool:
    """Check whether an existing edition without ISBN has no conflicting data
    with the incoming candidate. Fields that are None on either side are
    considered non-conflicting (they can be filled in)."""
    checks = [
        (edition.title, title),
        (edition.subtitle, subtitle),
        (edition.publishing_year, year),
        (edition.pages, pages),
        (edition.publisher_id, publisher_id),
    ]
    for existing_val, new_val in checks:
        if existing_val is not None and new_val is not None:
            if isinstance(existing_val, str) and isinstance(new_val, str):
                if existing_val.strip().lower() != new_val.strip().lower():
                    return False
            elif existing_val != new_val:
                return False
    return True


def link_edition_to_work(edition_id: int, work_id: int, db: Session, position: int = 0) -> None:
    """Create an editions_works link if it does not already exist."""
    existing = db.query(EditionsWork).filter_by(edition_id=edition_id, work_id=work_id).first()
    if not existing:
        db.add(EditionsWork(edition_id=edition_id, work_id=work_id, position=position))
        db.flush()


def find_or_create_edition(
    title: str,
    subtitle: Optional[str],
    isbn: Optional[str],
    year: Optional[int],
    publisher_id: Optional[int],
    pages: Optional[int],
    source: str,
    db: Session,
    authors: Optional[list[str]] = None,
    covers: Optional[list[str]] = None,
    source_data: Optional[dict] = None,
    isbn10: Optional[str] = None,
    isbn13: Optional[str] = None,
) -> Edition:
    resolved_isbn13, resolved_isbn10 = normalize_isbn_pair(isbn, isbn10, isbn13)

    # --- 1. Search by ISBN (both representations) ---
    edition = None
    if resolved_isbn13:
        edition = db.query(Edition).filter(Edition.isbn13 == resolved_isbn13).first()
    if not edition and resolved_isbn10:
        edition = db.query(Edition).filter(Edition.isbn10 == resolved_isbn10).first()

    if edition:
        _fill_missing(
            edition,
            subtitle=subtitle,
            publishing_year=year,
            publisher_id=publisher_id,
            pages=pages,
            authors=authors,
            covers=covers,
            source_data=source_data,
            isbn13=resolved_isbn13,
            isbn10=resolved_isbn10,
        )
        db.flush()
        return edition

    # --- 2. No ISBN: look for matching edition by title ---
    if not resolved_isbn13 and not resolved_isbn10:
        candidates = db.query(Edition).filter(
            Edition.isbn13.is_(None),
            Edition.isbn10.is_(None),
            Edition.title.ilike(title.strip()),
        ).all()
        for candidate in candidates:
            if _editions_match(candidate, title, subtitle, year, pages, publisher_id):
                _fill_missing(
                    candidate,
                    subtitle=subtitle,
                    publishing_year=year,
                    publisher_id=publisher_id,
                    pages=pages,
                    authors=authors,
                    covers=covers,
                    source_data=source_data,
                )
                db.flush()
                return candidate

    # --- 3. No match found: create new ---
    edition = Edition(
        title=title,
        subtitle=subtitle,
        isbn13=resolved_isbn13,
        isbn10=resolved_isbn10,
        publishing_year=year,
        publisher_id=publisher_id,
        pages=pages,
        authors=authors,
        covers=covers,
        source_data=source_data,
        status="proposed",
        source=source,
    )
    db.add(edition)
    db.flush()
    return edition


def confirm_edition_from_candidate(candidate: dict, db: Session) -> Edition:
    title = candidate.get("title")
    if not title:
        raise ValueError("Edition title missing")
    source = normalize_source(candidate.get("source") or "manual")
    publisher_name = candidate.get("publisher")
    publisher = find_or_create_publisher(publisher_name, source, db)
    isbn = candidate.get("isbn")
    source_data = {k: v for k, v in candidate.items() if v is not None}
    edition = find_or_create_edition(
        title,
        candidate.get("subtitle"),
        isbn,
        candidate.get("year"),
        publisher.id if publisher else None,
        candidate.get("pages"),
        source,
        db,
        authors=candidate.get("authors"),
        covers=candidate.get("covers"),
        source_data=source_data,
        isbn10=candidate.get("isbn10"),
        isbn13=candidate.get("isbn13"),
    )
    db.commit()
    db.refresh(edition)
    return edition


def confirm_edition_from_job(
    job_id: str,
    proposal_index: int = 0,
    manual_data: Optional[dict] = None,
    db: Session = None,
) -> Edition:
    job = db.query(CopyEnrichmentJob).filter(CopyEnrichmentJob.id == job_id).first()
    if not job or not job.result:
        raise ValueError("Job not found or incomplete")
    candidates = job.result.get("candidates", [])
    if candidates:
        if proposal_index < 0 or proposal_index >= len(candidates):
            raise ValueError("Invalid proposal index")
        edition_data = {**candidates[proposal_index]}
    else:
        edition_data = {**(job.result.get("proposed_edition") or {})}
    if manual_data:
        edition_data.update({key: value for key, value in manual_data.items() if value is not None})
    local_edition_id = edition_data.get("local_edition_id")
    if local_edition_id:
        edition = db.query(Edition).filter(Edition.id == local_edition_id).first()
        if not edition:
            raise ValueError("Local edition not found")
        return edition
    title = edition_data.get("title")
    if not title:
        raise ValueError("Edition title missing")
    source = normalize_source(edition_data.get("source") or "manual")
    publishers = edition_data.get("publishers") or []
    publisher_name = edition_data.get("publisher") or (publishers[0] if publishers else None)
    publisher = find_or_create_publisher(publisher_name, source, db)
    isbn = edition_data.get("isbn")
    source_data = {k: v for k, v in edition_data.items() if v is not None}
    edition = find_or_create_edition(
        title,
        edition_data.get("subtitle"),
        isbn,
        edition_data.get("year"),
        publisher.id if publisher else None,
        edition_data.get("pages"),
        source,
        db,
        authors=edition_data.get("authors"),
        covers=edition_data.get("covers"),
        source_data=source_data,
    )
    db.commit()
    db.refresh(edition)
    return edition


def confirm_copy_from_job(
    copy_id: int,
    job_id: Optional[str] = None,
    proposal_index: int = 0,
    manual_data: Optional[dict] = None,
    db: Session = None,
) -> Copy:
    copy = db.query(Copy).filter(Copy.id == copy_id).first()
    if not copy:
        raise ValueError("Copy not found")

    edition_data = {}
    work_data = {}
    if job_id:
        job = db.query(CopyEnrichmentJob).filter(CopyEnrichmentJob.id == job_id).first()
        if not job or not job.result:
            raise ValueError("Job not found or incomplete")
        candidates = job.result.get("candidates", [])
        if candidates:
            if proposal_index < 0 or proposal_index >= len(candidates):
                raise ValueError("Invalid proposal index")
            edition_data = {**candidates[proposal_index]}
            work_data = {
                "original_title": edition_data.get("work_title") or edition_data.get("title"),
                "authors": edition_data.get("authors"),
            }
        else:
            # Backward compatibility with old single-proposal results
            edition_data = {**(job.result.get("proposed_edition") or {})}
            work_data = {**(job.result.get("proposed_work") or {})}

    source = normalize_source(edition_data.get("source") or "manual")
    if manual_data:
        edition_data.update({key: value for key, value in manual_data.items() if value is not None})
        work_data.update({
            "original_title": edition_data.get("work_title") or edition_data.get("title"),
            "authors": edition_data.get("authors"),
        })
    if not edition_data:
        raise ValueError("Edition metadata missing")

    local_edition_id = edition_data.get("local_edition_id")
    if local_edition_id:
        edition = db.query(Edition).filter(Edition.id == local_edition_id).first()
        if not edition:
            raise ValueError("Local edition not found")
        copy.edition_id = edition.id
        copy.status = "approved"
        db.commit()
        db.refresh(copy)
        return copy

    authors = edition_data.get("authors") or work_data.get("authors") or []

    ensure_author_role("author", "autore", db)

    original_title = work_data.get("original_title") or edition_data.get("title")
    year = edition_data.get("year")

    work = find_or_create_work(original_title, year, authors, source, db)
    publishers = edition_data.get("publishers") or []
    publisher_name = edition_data.get("publisher") or (publishers[0] if publishers else None)
    publisher = find_or_create_publisher(publisher_name, source, db)
    source_data = {k: v for k, v in edition_data.items() if v is not None}
    edition = find_or_create_edition(
        edition_data.get("title") or original_title or "Edizione sconosciuta",
        edition_data.get("subtitle"),
        edition_data.get("isbn"),
        year,
        publisher.id if publisher else None,
        edition_data.get("pages"),
        source,
        db,
        authors=authors,
        covers=edition_data.get("covers"),
        source_data=source_data,
    )
    # Link edition to work via many-to-many
    link_edition_to_work(edition.id, work.id, db)

    for author_name in authors:
        author = find_or_create_author(author_name, source, db)
        existing = db.query(EditionsAuthor).filter_by(
            edition_id=edition.id,
            author_id=author.id,
            role="author",
        ).first()
        if not existing:
            db.add(EditionsAuthor(edition_id=edition.id, author_id=author.id, role="author"))

    copy.edition_id = edition.id
    copy.status = "approved"
    db.commit()
    db.refresh(copy)
    return copy
