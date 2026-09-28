from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user_uuid
from ..database import get_db
from ..models import Author, Edition, EditionsWork, Work, WorksAuthor

router = APIRouter(prefix="/works", tags=["works"])


@router.get("/{work_id}")
def get_work(
    work_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    work = db.query(Work).filter_by(id=work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    authors = (
        db.query(Author, WorksAuthor.role)
        .join(WorksAuthor, WorksAuthor.author_id == Author.id)
        .filter(WorksAuthor.work_id == work_id)
        .all()
    )
    editions = (
        db.query(Edition)
        .join(EditionsWork, EditionsWork.edition_id == Edition.id)
        .filter(EditionsWork.work_id == work_id)
        .order_by(Edition.publishing_year, Edition.id)
        .all()
    )
    return {
        "id": work.id,
        "original_title": work.original_title,
        "original_subtitle": work.original_subtitle,
        "date": {
            "year": work.publishing_year,
            "era": work.publishing_era,
            "type": "publication",
        } if work.publishing_year else None,
        "authors": [
            {
                "id": author.id,
                "display_name": f"{author.given_name} {author.family_name}".strip(),
                "role": role,
            }
            for author, role in authors
        ],
        "related_editions": [
            {
                "local_edition_id": edition.id,
                "title": edition.title,
                "subtitle": edition.subtitle,
                "year": edition.publishing_year,
                "isbn": edition.isbn13 or edition.isbn10,
                "covers": edition.covers or [],
                "source": "postgresql",
                "record_type": "edition",
            }
            for edition in editions
        ],
        "related_editions_count": len(editions),
    }
