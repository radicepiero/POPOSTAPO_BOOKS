import logging
import pathlib
import uuid as uuid_module
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import requests

from ..auth import get_current_user_uuid
from ..config import settings
from ..database import get_db
from ..models import Copy, CopyEnrichmentJob, Edition, Membre, Reading
from ..schemas import CandidateConfirm, CopyConfirm, CopyDraftCreate, EditionActionCreate, EditionConfirmResponse, EditionSearchResponse, EnrichmentJobResponse, ReadingCreate
from ..services.confirmation import confirm_edition_from_candidate, confirm_edition_from_job
from ..services.enrichment import (
    GOOGLE_BOOKS_SEARCH_URL,
    OPENLIBRARY_SEARCH_URL,
    _local_edition_to_dict,
    lookup_local_editions,
    lookup_local_editions_advanced,
    process_enrichment_job,
)
from ..services.openai_vision import analyze_cover


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/editions", tags=["editions"])
UPLOAD_DIR = pathlib.Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def create_job(background_tasks: BackgroundTasks, owner_uuid: str, isbn: Optional[str], title: Optional[str], author: Optional[str], image_url: Optional[str], db: Session):
    job = CopyEnrichmentJob(owner_uuid=uuid_module.UUID(owner_uuid), image_url=image_url, isbn=isbn, status="pending")
    db.add(job)
    db.commit()
    db.refresh(job)
    background_tasks.add_task(process_enrichment_job, str(job.id), title=title, author=author)
    return {"job_id": job.id, "status": job.status}


@router.post("/search", response_model=EditionSearchResponse, status_code=201)
def search_edition(data: CopyDraftCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    return create_job(background_tasks, owner_uuid, data.isbn, data.title, data.author, None, db)


@router.post("/search/upload", response_model=EditionSearchResponse, status_code=201)
def search_edition_upload(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    isbn: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    extension = pathlib.Path(image.filename or "").suffix or ".jpg"
    file_path = UPLOAD_DIR / f"{uuid_module.uuid4().hex}{extension}"
    with file_path.open("wb") as target:
        target.write(image.file.read())
    return create_job(background_tasks, owner_uuid, isbn, title, author, f"/uploads/{file_path.name}", db)


@router.post("/search/cover")
def search_cover(
    image: UploadFile = File(...),
    back_image: Optional[UploadFile] = File(None),
    copyright_page: Optional[UploadFile] = File(None),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    """Analyze available book images using OpenAI Vision and return extracted metadata."""
    uploaded = {"front cover": image, "back cover": back_image, "copyright or title page": copyright_page}
    image_paths = {}
    image_urls = {}
    for role, upload in uploaded.items():
        if upload is None:
            continue
        extension = pathlib.Path(upload.filename or "").suffix or ".jpg"
        file_path = UPLOAD_DIR / f"{uuid_module.uuid4().hex}{extension}"
        with file_path.open("wb") as target:
            target.write(upload.file.read())
        image_paths[role] = str(file_path)
        image_urls[role] = f"/uploads/{file_path.name}"

    result = analyze_cover(image_paths)

    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])

    # Build a candidate-like response
    return {
        "source": "openai_vision",
        "title": result.get("title"),
        "subtitle": result.get("subtitle"),
        "authors": result.get("authors") or [],
        "contributors": result.get("contributors") or [],
        "original_title": result.get("original_title"),
        "publisher": result.get("publisher"),
        "year": result.get("year"),
        "isbn": result.get("isbn"),
        "language": result.get("language"),
        "series": result.get("series"),
        "pages": result.get("pages"),
        "covers": list(image_urls.values()),
        "images": image_urls,
    }


@router.get("/search/local")
def search_local(
    db: Session = Depends(get_db),
    isbn: Optional[str] = None,
    title: Optional[str] = None,
    author: Optional[str] = None,
    owner_uuid: str = Depends(get_current_user_uuid),
):
    return lookup_local_editions(isbn or "", title, author)


@router.get("/search/local/advanced")
def search_local_advanced(
    db: Session = Depends(get_db),
    isbn: Optional[str] = None,
    title: Optional[str] = None,
    author: Optional[str] = None,
    owner_uuid: str = Depends(get_current_user_uuid),
):
    return lookup_local_editions_advanced(isbn or "", title, author)


@router.get("/search/openlibrary")
def search_openlibrary_proxy(
    isbn: Optional[str] = None,
    title: Optional[str] = None,
    author: Optional[str] = None,
):
    if not isbn and not title and not author:
        raise HTTPException(status_code=400, detail="isbn, title or author required")
    if isbn:
        q = isbn
    else:
        q = title or ""
        if author:
            q += f" author:{author}"
    try:
        resp = requests.get(
            OPENLIBRARY_SEARCH_URL,
            params={"q": q, "fields": "key,title,author_name,editions", "limit": 10},
            timeout=8,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/search/google")
def search_google_proxy(
    isbn: Optional[str] = None,
    title: Optional[str] = None,
    author: Optional[str] = None,
):
    if not isbn and not title and not author:
        raise HTTPException(status_code=400, detail="isbn, title or author required")
    if isbn:
        q = f"isbn:{isbn}"
    else:
        q = f"intitle:{title}" if title else ""
        if author:
            q += f" inauthor:{author}"
    params = {"q": q.strip(), "maxResults": 10}
    if settings.google_books_api_key:
        params["key"] = settings.google_books_api_key
    try:
        resp = requests.get(GOOGLE_BOOKS_SEARCH_URL, params=params, timeout=8)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/confirm-candidate", response_model=EditionConfirmResponse)
def confirm_candidate(
    data: CandidateConfirm,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    try:
        edition = confirm_edition_from_candidate(data.model_dump(exclude_none=True), db)
        return {"edition_id": edition.id, "status": edition.status}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Unable to confirm edition candidate")
        raise HTTPException(status_code=500, detail="Impossibile salvare l'edizione: dati non compatibili con il catalogo.") from exc


@router.get("/enrichment/{job_id}", response_model=EnrichmentJobResponse)
def get_enrichment(job_id: UUID, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    job = db.query(CopyEnrichmentJob).filter_by(id=job_id, owner_uuid=uuid_module.UUID(owner_uuid)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/confirm", response_model=EditionConfirmResponse)
def confirm_edition(data: CopyConfirm, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    if not data.job_id:
        raise HTTPException(status_code=400, detail="Job id missing")
    job = db.query(CopyEnrichmentJob).filter_by(id=data.job_id, owner_uuid=uuid_module.UUID(owner_uuid)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    manual_data = {
        "work_title": data.work_title,
        "title": data.title,
        "subtitle": data.subtitle,
        "authors": data.authors,
        "publisher": data.publisher,
        "year": data.year,
        "isbn": data.isbn,
        "pages": data.pages,
    }
    try:
        edition = confirm_edition_from_job(str(data.job_id), data.proposal_index or 0, manual_data, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"edition_id": edition.id, "status": edition.status}


@router.get("/{edition_id}")
def get_edition(edition_id: int, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    edition = db.query(Edition).filter_by(id=edition_id).first()
    if not edition:
        raise HTTPException(status_code=404, detail="Edition not found")
    return _local_edition_to_dict(edition, db)


@router.post("/{edition_id}/copies", status_code=201)
def add_copy(edition_id: int, data: EditionActionCreate, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    if not db.query(Edition).filter_by(id=edition_id).first():
        raise HTTPException(status_code=404, detail="Edition not found")
    copy = Copy(owner_uuid=uuid_module.UUID(owner_uuid), edition_id=edition_id, acquisition_date=data.acquisition_date, price=data.price, condition_note=data.condition_note, status="approved", source="manual")
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return {"copy_id": copy.id, "edition_id": edition_id, "status": copy.status}


@router.post("/{edition_id}/readings", status_code=201)
def add_reading(edition_id: int, data: ReadingCreate, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    owner = uuid_module.UUID(owner_uuid)
    if not db.query(Edition).filter_by(id=edition_id).first():
        raise HTTPException(status_code=404, detail="Edition not found")
    if data.copy_id:
        copy = db.query(Copy).filter_by(id=data.copy_id, owner_uuid=owner, edition_id=edition_id).first()
        if not copy:
            raise HTTPException(status_code=400, detail="Copy does not belong to this user and edition")
    membre = db.query(Membre).filter_by(uuid=owner).first()
    status = "finished" if data.finished else data.status
    if status == "wishlist":
        owner_filter = Reading.owner_uuid == owner
        if membre:
            owner_filter = owner_filter | (Reading.owner_membre_id == membre.id)
        existing = db.query(Reading).filter(Reading.edition_id == edition_id, Reading.status == "wishlist").filter(owner_filter).first()
        if existing:
            return {"reading_id": existing.id, "edition_id": edition_id, "status": "wishlist"}
    reading = Reading(owner_uuid=owner, owner_membre_id=membre.id if membre else None, edition_id=edition_id, copy_id=data.copy_id, start_date=data.start_date, end_date=data.end_date, current_page=data.current_page, finished=status == "finished", status=status, rating=data.rating)
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return {"reading_id": reading.id, "edition_id": edition_id, "status": "created"}
