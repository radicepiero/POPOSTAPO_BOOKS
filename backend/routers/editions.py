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
from ..models import (
    Bookmark,
    Borrow,
    Copy,
    CopyEnrichmentJob,
    Edition,
    EditionContent,
    EditionEdition,
    EditionMeasurement,
    EditionVariant,
    EditionsAuthor,
    EditionsLink,
    EditionsTag,
    EditionsWork,
    Extract,
    ExtractLink,
    Membre,
    Reading,
    SharingMembreEdition,
    Transaction,
    WishlistItem,
    Work,
    WorksAuthor,
)
from ..schemas import (
    CandidateConfirm,
    CopyConfirm,
    CopyDraftCreate,
    EditionActionCreate,
    EditionConfirmResponse,
    EditionSearchResponse,
    EditionUpdate,
    EnrichmentJobResponse,
    ReadingCreate,
)
from ..services.confirmation import (
    confirm_edition_from_candidate,
    confirm_edition_from_job,
    find_or_create_publisher,
    normalize_isbn_pair,
)
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
    copyright_pages: Optional[list[UploadFile]] = File(None),
    spine_image: Optional[UploadFile] = File(None),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    """Analyze available book images using OpenAI Vision and return extracted metadata."""
    uploaded: dict[str, object] = {"front cover": image, "back cover": back_image, "spine": spine_image}
    if copyright_pages:
        for index, cp in enumerate(copyright_pages):
            uploaded[f"copyright or title page {index + 1}"] = cp

    image_paths: dict[str, str] = {}
    image_urls: dict[str, str] = {}
    for role, upload in uploaded.items():
        if upload is None:
            continue
        if isinstance(upload, list):
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
    return lookup_local_editions(isbn or "", title, author, owner_uuid)


@router.get("/search/local/advanced")
def search_local_advanced(
    db: Session = Depends(get_db),
    isbn: Optional[str] = None,
    title: Optional[str] = None,
    author: Optional[str] = None,
    owner_uuid: str = Depends(get_current_user_uuid),
):
    return lookup_local_editions_advanced(isbn or "", title, author, owner_uuid)


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
        _ensure_edition_creator(db, edition.id, owner_uuid)
        db.commit()
        db.refresh(edition)
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
        "contributors": [c.model_dump() for c in data.contributors] if data.contributors else None,
        "publisher": data.publisher,
        "year": data.year,
        "isbn": data.isbn,
        "pages": data.pages,
    }
    try:
        edition = confirm_edition_from_job(str(data.job_id), data.proposal_index or 0, manual_data, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    _ensure_edition_creator(db, edition.id, owner_uuid)
    db.commit()
    db.refresh(edition)
    return {"edition_id": edition.id, "status": edition.status}


@router.get("/{edition_id}")
def get_edition(edition_id: int, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    edition = db.query(Edition).filter_by(id=edition_id).first()
    if not edition:
        raise HTTPException(status_code=404, detail="Edition not found")
    result = _local_edition_to_dict(edition, db, owner_uuid)
    result["permissions"] = _edition_ownership(db, edition_id, owner_uuid)
    return result


def _resolve_edition_variant(db: Session, edition_id: int, variant_id: Optional[int]) -> EditionVariant:
    if variant_id is not None:
        variant = db.query(EditionVariant).filter_by(id=variant_id, edition_id=edition_id).first()
        if not variant:
            raise HTTPException(status_code=400, detail="Variant does not belong to this edition")
        return variant
    variant = db.query(EditionVariant).filter_by(edition_id=edition_id, is_default=True).first()
    if not variant:
        raise HTTPException(status_code=409, detail="L'edizione non ha una variante disponibile")
    return variant


@router.post("/{edition_id}/copies", status_code=201)
def add_copy(edition_id: int, data: EditionActionCreate, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    if not db.query(Edition).filter_by(id=edition_id).first():
        raise HTTPException(status_code=404, detail="Edition not found")
    variant = _resolve_edition_variant(db, edition_id, data.edition_variant_id)
    copy = Copy(
        owner_uuid=uuid_module.UUID(owner_uuid),
        edition_id=edition_id,
        edition_variant_id=variant.id,
        acquisition_date=data.acquisition_date,
        acquisition_type_id=data.acquisition_type_id,
        acquisition_friend_id=data.acquisition_friend_id,
        shelf_id=data.shelf_id,
        currency=data.currency,
        price=data.price,
        condition_note=data.condition_note,
        status="approved",
        source="manual",
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return {"copy_id": copy.id, "edition_id": edition_id, "status": copy.status}


@router.post("/{edition_id}/readings", status_code=201)
def add_reading(edition_id: int, data: ReadingCreate, db: Session = Depends(get_db), owner_uuid: str = Depends(get_current_user_uuid)):
    owner = uuid_module.UUID(owner_uuid)
    edition = db.query(Edition).filter_by(id=edition_id).first()
    if not edition:
        raise HTTPException(status_code=404, detail="Edition not found")
    membre = db.query(Membre).filter_by(uuid=owner).first()
    status = "finished" if data.finished else data.status

    if status == "wishlist":
        edition_work = db.query(EditionsWork).filter_by(edition_id=edition_id).first()
        existing = db.query(WishlistItem).filter_by(
            owner_uuid=owner,
            work_id=edition_work.work_id if edition_work else None,
            title=edition.title,
            status="active",
        ).first()
        if existing:
            return {"wishlist_item_id": existing.id, "edition_id": edition_id, "status": "wishlist"}
        item = WishlistItem(
            owner_uuid=owner,
            work_id=edition_work.work_id if edition_work else None,
            title=edition.title,
            author=", ".join(edition.authors or []) or None,
            status="active",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return {"wishlist_item_id": item.id, "edition_id": edition_id, "status": "wishlist"}

    copy = None
    if data.copy_id:
        copy = db.query(Copy).filter_by(id=data.copy_id, owner_uuid=owner, edition_id=edition_id).first()
        if not copy:
            raise HTTPException(status_code=400, detail="Copy does not belong to this user and edition")
        if data.edition_variant_id is not None and copy.edition_variant_id != data.edition_variant_id:
            raise HTTPException(status_code=400, detail="Variant does not match the selected copy")
    variant = (
        db.query(EditionVariant).filter_by(id=copy.edition_variant_id).first()
        if copy and copy.edition_variant_id
        else _resolve_edition_variant(db, edition_id, data.edition_variant_id)
    )
    reading = Reading(owner_uuid=owner, owner_membre_id=membre.id if membre else None, edition_id=edition_id, edition_variant_id=variant.id, copy_id=data.copy_id, start_date=data.start_date, end_date=data.end_date, current_page=data.current_page, finished=status == "finished", status=status, rating=data.rating)
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return {"reading_id": reading.id, "edition_id": edition_id, "status": "created"}


def _ensure_edition_creator(db: Session, edition_id: int, owner_uuid: str) -> None:
    membre = db.query(Membre).filter_by(uuid=uuid_module.UUID(owner_uuid)).first()
    if not membre:
        return
    existing = (
        db.query(SharingMembreEdition)
        .filter_by(edition_id=edition_id, membre_id=membre.id)
        .first()
    )
    if not existing:
        db.add(SharingMembreEdition(edition_id=edition_id, membre_id=membre.id))


def _edition_ownership(
    db: Session, edition_id: int, owner_uuid: str
) -> dict:
    owner = uuid_module.UUID(owner_uuid)
    membre = db.query(Membre).filter_by(uuid=owner).first()
    is_admin = bool(membre and membre.is_admin)
    creator = None
    if membre:
        creator = (
            db.query(SharingMembreEdition)
            .filter_by(edition_id=edition_id, membre_id=membre.id)
            .first()
        )
    is_creator = creator is not None

    copies = db.query(Copy).filter_by(edition_id=edition_id).all()
    readings = db.query(Reading).filter_by(edition_id=edition_id).all()

    own_copies = 0
    other_copies = 0
    for copy in copies:
        if copy.owner_uuid == owner:
            own_copies += 1
        else:
            other_copies += 1

    own_readings = 0
    other_readings = 0
    for reading in readings:
        is_own = reading.owner_uuid == owner or (
            membre and reading.owner_membre_id == membre.id
        )
        if is_own:
            own_readings += 1
        else:
            other_readings += 1

    can_edit = is_admin or (is_creator and other_copies == 0 and other_readings == 0)
    can_delete = can_edit
    needs_confirm = own_copies + own_readings > 0 or (is_admin and (other_copies + other_readings > 0))

    return {
        "is_admin": is_admin,
        "is_creator": is_creator,
        "can_edit": can_edit,
        "can_delete": can_delete,
        "needs_confirm": needs_confirm,
        "own_copies": own_copies,
        "own_readings": own_readings,
        "other_copies": other_copies,
        "other_readings": other_readings,
    }


@router.patch("/{edition_id}", response_model=EditionConfirmResponse)
def update_edition(
    edition_id: int,
    data: EditionUpdate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    edition = db.query(Edition).filter_by(id=edition_id).first()
    if not edition:
        raise HTTPException(status_code=404, detail="Edition not found")

    perms = _edition_ownership(db, edition_id, owner_uuid)
    if not perms["can_edit"]:
        raise HTTPException(status_code=403, detail="Non hai i permessi per modificare questa edizione")

    if data.title is not None:
        edition.title = data.title
    if data.subtitle is not None:
        edition.subtitle = data.subtitle
    if data.authors is not None:
        edition.authors = data.authors
    if data.publisher is not None:
        publisher = find_or_create_publisher(data.publisher, "manual", db) if data.publisher.strip() else None
        edition.publisher_id = publisher.id if publisher else None
    if data.year is not None:
        edition.publishing_year = data.year
    if data.isbn is not None:
        isbn13, isbn10 = normalize_isbn_pair(data.isbn)
        edition.isbn13 = isbn13
        edition.isbn10 = isbn10
    if data.pages is not None:
        edition.pages = data.pages
    if data.covers is not None:
        edition.covers = [cover.strip() for cover in data.covers if cover.strip()] or None

    db.commit()
    db.refresh(edition)
    return {"edition_id": edition.id, "status": edition.status}


@router.post("/{edition_id}/covers", status_code=201)
def upload_edition_cover(
    edition_id: int,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    edition = db.query(Edition).filter_by(id=edition_id).first()
    if not edition:
        raise HTTPException(status_code=404, detail="Edition not found")
    if not _edition_ownership(db, edition_id, owner_uuid)["can_edit"]:
        raise HTTPException(status_code=403, detail="Non hai i permessi per modificare questa edizione")
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Il file deve essere un'immagine")

    extension = pathlib.Path(image.filename or "").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=415, detail="Formato immagine non supportato")
    content = image.file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="L'immagine non può superare 10 MB")

    file_path = UPLOAD_DIR / f"{uuid_module.uuid4().hex}{extension}"
    with file_path.open("wb") as target:
        target.write(content)
    return {"url": f"/uploads/{file_path.name}"}


@router.delete("/{edition_id}")
def delete_edition(
    edition_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    edition = db.query(Edition).filter_by(id=edition_id).first()
    if not edition:
        raise HTTPException(status_code=404, detail="Edition not found")

    perms = _edition_ownership(db, edition_id, owner_uuid)
    if not perms["can_delete"]:
        raise HTTPException(status_code=403, detail="Non hai i permessi per cancellare questa edizione")

    if not force and perms["needs_confirm"]:
        raise HTTPException(
            status_code=409,
            detail={
                "confirm_required": True,
                "message": "L'eliminazione cancellerà anche le copie e le letture collegate.",
                "own_copies": perms["own_copies"],
                "own_readings": perms["own_readings"],
                "other_copies": perms["other_copies"],
                "other_readings": perms["other_readings"],
            },
        )

    # Delete children first
    reading_ids = [r.id for r in db.query(Reading).filter_by(edition_id=edition_id).all()]
    if reading_ids:
        db.query(Bookmark).filter(Bookmark.reading_id.in_(reading_ids)).delete(synchronize_session=False)
        db.query(Reading).filter(Reading.id.in_(reading_ids)).delete(synchronize_session=False)

    extract_ids = [e.id for e in db.query(Extract).filter_by(edition_id=edition_id).all()]
    if extract_ids:
        db.query(ExtractLink).filter(
            (ExtractLink.extract_a_id.in_(extract_ids)) | (ExtractLink.extract_b_id.in_(extract_ids))
        ).delete(synchronize_session=False)
        db.query(Extract).filter(Extract.id.in_(extract_ids)).delete(synchronize_session=False)

    copy_ids = [c.id for c in db.query(Copy).filter_by(edition_id=edition_id).all()]
    if copy_ids:
        db.query(CopyEnrichmentJob).filter(CopyEnrichmentJob.copy_id.in_(copy_ids)).delete(synchronize_session=False)
        transaction_ids = [t.id for t in db.query(Transaction).filter(Transaction.copy_id.in_(copy_ids)).all()]
        if transaction_ids:
            db.query(Borrow).filter(Borrow.transaction_id.in_(transaction_ids)).delete(synchronize_session=False)
            db.query(Transaction).filter(Transaction.id.in_(transaction_ids)).delete(synchronize_session=False)
        db.query(Copy).filter(Copy.id.in_(copy_ids)).delete(synchronize_session=False)

    db.query(EditionContent).filter_by(edition_id=edition_id).delete(synchronize_session=False)
    db.query(EditionMeasurement).filter_by(edition_id=edition_id).delete(synchronize_session=False)
    db.query(EditionEdition).filter(
        (EditionEdition.parent_edition_id == edition_id) | (EditionEdition.child_edition_id == edition_id)
    ).delete(synchronize_session=False)
    db.query(EditionsWork).filter_by(edition_id=edition_id).delete(synchronize_session=False)
    db.query(EditionsAuthor).filter_by(edition_id=edition_id).delete(synchronize_session=False)
    db.query(EditionsTag).filter_by(edition_id=edition_id).delete(synchronize_session=False)
    db.query(EditionsLink).filter_by(edition_id=edition_id).delete(synchronize_session=False)
    db.query(SharingMembreEdition).filter_by(edition_id=edition_id).delete(synchronize_session=False)

    db.delete(edition)
    db.commit()
    return {"edition_id": edition_id, "status": "deleted"}
