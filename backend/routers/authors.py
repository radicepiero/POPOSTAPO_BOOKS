import uuid as uuid_module
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user_uuid
from ..database import get_db
from ..models import Author, Copy, Edition, EditionsWork, Membre, Reading, Work, WorksAuthor


router = APIRouter(prefix="/authors", tags=["authors"])


def _author_name(author: Author) -> str:
    return " ".join(filter(None, [author.given_name, author.family_name])).strip() or f"Autore #{author.id}"


def _format_date_parts(year: int | None, month: int | None, day: int | None) -> str | None:
    if not year:
        return None
    if month and day:
        return f"{year:04d}-{month:02d}-{day:02d}"
    return str(year)


@router.get("/search")
def search_authors(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    term = q.strip().lower()
    if not term:
        raise HTTPException(status_code=400, detail="Query required")
    like = f"%{term}%"
    full_name = func.concat_ws(" ", Author.given_name, Author.family_name)
    authors = (
        db.query(Author)
        .filter(
            func.lower(full_name).ilike(like)
            | func.lower(Author.given_name).ilike(like)
            | func.lower(Author.family_name).ilike(like)
        )
        .order_by(full_name)
        .limit(20)
        .all()
    )

    normalized_names = {_author_name(a).lower() for a in authors}
    results = [
        {"author_id": a.id, "name": _author_name(a), "source": "author"}
        for a in authors
    ]

    # Also search authors still stored inside editions.authors (not normalized)
    seen = set(normalized_names)
    editions = db.query(Edition).filter(Edition.authors.isnot(None)).all()
    for edition in editions:
        for name in edition.authors or []:
            if term in name.lower() and name.lower() not in seen:
                results.append(
                    {
                        "edition_id": edition.id,
                        "edition_title": edition.title,
                        "name": name,
                        "source": "edition",
                    }
                )
                seen.add(name.lower())

    return {"items": results}


@router.get("/latest/reading")
def latest_reading_author(
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    owner = uuid_module.UUID(owner_uuid)
    membre = db.query(Membre).filter_by(uuid=owner).first()
    owner_filter = {"owner_uuid": owner}
    if membre:
        owner_filter = {"owner_membre_id": membre.id}

    latest_reading = (
        db.query(Reading)
        .filter_by(**owner_filter)
        .order_by(Reading.id.desc())
        .first()
    )
    if not latest_reading:
        raise HTTPException(status_code=404, detail="No readings found")

    edition_link = (
        db.query(EditionsWork)
        .filter_by(edition_id=latest_reading.edition_id)
        .first()
    )
    if not edition_link:
        raise HTTPException(status_code=404, detail="No work linked to reading edition")

    author = (
        db.query(Author)
        .join(WorksAuthor, WorksAuthor.author_id == Author.id)
        .filter(WorksAuthor.work_id == edition_link.work_id)
        .order_by(Author.id)
        .first()
    )
    if not author:
        raise HTTPException(status_code=404, detail="No author found")

    return {"author_id": author.id, "name": _author_name(author)}


@router.get("/{author_id}")
def get_author(
    author_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    author = db.query(Author).filter_by(id=author_id).first()
    if not author:
        raise HTTPException(status_code=404, detail="Author not found")

    owner = uuid_module.UUID(owner_uuid)
    membre = db.query(Membre).filter_by(uuid=owner).first()
    readings_owner_filter = {"owner_uuid": owner}
    if membre:
        readings_owner_filter = {"owner_membre_id": membre.id}
    copies_owner_filter = {"owner_uuid": owner}

    works = (
        db.query(Work)
        .join(WorksAuthor, WorksAuthor.work_id == Work.id)
        .filter(WorksAuthor.author_id == author_id)
        .order_by(Work.original_title)
        .all()
    )

    work_ids = [w.id for w in works]
    edition_links = (
        db.query(EditionsWork)
        .filter(EditionsWork.work_id.in_(work_ids))
        .all()
    )
    edition_ids = [link.edition_id for link in edition_links]
    editions = {e.id: e for e in db.query(Edition).filter(Edition.id.in_(edition_ids)).all()}

    readings = {
        r.edition_id: r
        for r in db.query(Reading)
        .filter(Reading.edition_id.in_(edition_ids))
        .filter_by(**readings_owner_filter)
        .order_by(Reading.id.desc())
        .all()
    }
    copies = {
        c.edition_id: c
        for c in db.query(Copy)
        .filter(Copy.edition_id.in_(edition_ids))
        .filter_by(**copies_owner_filter)
        .order_by(Copy.id.desc())
        .all()
    }

    works_data = []
    for work in works:
        work_edition_links = [link for link in edition_links if link.work_id == work.id]
        editions_data = []
        for link in work_edition_links:
            edition = editions.get(link.edition_id)
            if not edition:
                continue
            reading = readings.get(edition.id)
            copy = copies.get(edition.id)
            editions_data.append({
                "edition_id": edition.id,
                "title": edition.title,
                "subtitle": edition.subtitle,
                "cover": edition.covers[0] if edition.covers else None,
                "reading_status": reading.status if reading else None,
                "reading_id": reading.id if reading else None,
                "has_copy": copy is not None,
                "copy_id": copy.id if copy else None,
            })
        works_data.append({
            "work_id": work.id,
            "title": work.original_title,
            "subtitle": work.original_subtitle,
            "publishing_year": work.publishing_year,
            "publishing_era": work.publishing_era,
            "editions": sorted(editions_data, key=lambda e: e["title"] or ""),
        })

    return {
        "author_id": author.id,
        "name": _author_name(author),
        "given_name": author.given_name,
        "family_name": author.family_name,
        "birth_date": _format_date_parts(author.birth_year, author.birth_month, author.birth_day),
        "death_date": _format_date_parts(author.death_year, author.death_month, author.death_day),
        "works": works_data,
    }
