import pathlib
from typing import Optional
from uuid import UUID
import uuid as uuid_module
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, File, Form, UploadFile
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user_uuid
from ..models import AcquisitionType, Author, Copy, CopyEnrichmentJob, Edition, EditionsWork, Friend, Library, Membre, Publisher, Reading, Shelf, Work, WorksAuthor
from ..schemas import CopyDraftCreate, CopyDraftResponse, EnrichmentJobResponse, CopyConfirm, CopyConfirmResponse, CopyListItem, CopyUpdate
from ..services.enrichment import process_enrichment_job
from ..services.confirmation import confirm_copy_from_job
from ..services.barcode import decode_barcode_image


router = APIRouter(prefix="/copies", tags=["copies"])

UPLOAD_DIR = pathlib.Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/draft", response_model=CopyDraftResponse, status_code=201)
def create_copy_draft(
    data: CopyDraftCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    copy = Copy(
        owner_uuid=uuid_module.UUID(owner_uuid),
        shelf_id=data.shelf_id,
        status="draft",
    )
    db.add(copy)
    db.flush()

    job = CopyEnrichmentJob(
        copy_id=copy.id,
        owner_uuid=uuid_module.UUID(owner_uuid),
        image_url=data.image_url,
        isbn=data.isbn,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(copy)
    db.refresh(job)

    background_tasks.add_task(
        process_enrichment_job,
        str(job.id),
        title=data.title,
        author=data.author,
    )

    return {"copy_id": copy.id, "job_id": job.id, "status": "draft"}


@router.post("/draft/upload", response_model=CopyDraftResponse, status_code=201)
def create_copy_draft_upload(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    isbn: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    ext = pathlib.Path(image.filename).suffix or ".jpg"
    file_id = uuid_module.uuid4().hex
    file_path = UPLOAD_DIR / f"{file_id}{ext}"
    with file_path.open("wb") as f:
        f.write(image.file.read())
    image_url = f"/uploads/{file_path.name}"

    copy = Copy(
        owner_uuid=uuid_module.UUID(owner_uuid),
        status="draft",
    )
    db.add(copy)
    db.flush()

    job = CopyEnrichmentJob(
        copy_id=copy.id,
        owner_uuid=uuid_module.UUID(owner_uuid),
        image_url=image_url,
        isbn=isbn,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(copy)
    db.refresh(job)

    background_tasks.add_task(
        process_enrichment_job,
        str(job.id),
        title=title,
        author=author,
    )

    return {"copy_id": copy.id, "job_id": job.id, "status": "draft"}


@router.post("/barcode/decode")
def decode_barcode(
    image: UploadFile = File(...),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Il file deve essere un'immagine")
    try:
        barcodes = decode_barcode_image(image.file.read())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not barcodes:
        raise HTTPException(status_code=422, detail="Nessun codice a barre riconosciuto nel fotogramma")
    return {"barcodes": barcodes}


@router.get("/enrichment/{job_id}", response_model=EnrichmentJobResponse)
def get_enrichment(
    job_id: UUID,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    job = db.query(CopyEnrichmentJob).filter_by(id=job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{copy_id}/confirm", response_model=CopyConfirmResponse)
def confirm_copy(
    copy_id: int,
    data: CopyConfirm,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    copy = db.query(Copy).filter_by(id=copy_id, owner_uuid=uuid_module.UUID(owner_uuid)).first()
    if not copy:
        raise HTTPException(status_code=404, detail="Copy not found")
    try:
        manual_data = None
        if data.work_title or data.title or data.subtitle or data.authors or data.publisher or data.year or data.isbn or data.pages:
            manual_data = {
                "work_title": data.work_title,
                "title": data.title,
                "subtitle": data.subtitle,
                "authors": data.authors or [],
                "publisher": data.publisher,
                "year": data.year,
                "isbn": data.isbn,
                "pages": data.pages,
            }
        confirmed = confirm_copy_from_job(
            copy.id,
            job_id=str(data.job_id) if data.job_id else None,
            proposal_index=data.proposal_index or 0,
            manual_data=manual_data,
            db=db,
        )
        confirmed.acquisition_date = data.acquisition_date
        confirmed.price = data.price
        confirmed.condition_note = data.condition_note
        db.commit()
        db.refresh(confirmed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "copy_id": confirmed.id,
        "edition_id": confirmed.edition_id,
        "status": confirmed.status,
    }


@router.get("/acquisition-types", response_model=list[dict])
def list_acquisition_types(
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    return [
        {"id": t.id, "name": t.name, "name_ita": t.name_ita, "direction": t.direction}
        for t in db.query(AcquisitionType).order_by(AcquisitionType.id).all()
    ]


@router.get("/libraries", response_model=list[dict])
def list_libraries(
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    libraries = db.query(Library).filter_by(owner_uuid=uuid_module.UUID(owner_uuid)).order_by(Library.sort_order, Library.name).all()
    result = []
    for library in libraries:
        shelves = db.query(Shelf).filter_by(library_id=library.id).order_by(Shelf.sort_order, Shelf.name).all()
        result.append({
            "id": library.id,
            "name": library.name,
            "location": library.location,
            "shelves": [{"id": s.id, "name": s.name, "location": s.location} for s in shelves],
        })
    return result


@router.get("/friends", response_model=list[dict])
def list_friends(
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    owner_id = uuid_module.UUID(owner_uuid)
    membre = db.query(Membre).filter_by(uuid=owner_id).first()
    if not membre:
        return []
    friends = db.query(Friend).filter_by(owner_id=membre.id).order_by(Friend.name, Friend.surname).all()
    return [
        {
            "id": f.id,
            "name": " ".join(filter(None, [f.name, f.surname])).strip() or f.pseudo or f.email or f"Friend #{f.id}",
        }
        for f in friends
    ]


@router.get("", response_model=list[CopyListItem])
def list_copies(
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    copies = db.query(Copy).filter_by(owner_uuid=uuid_module.UUID(owner_uuid)).order_by(Copy.id.desc()).all()
    results = []
    for copy in copies:
        edition = db.query(Edition).filter_by(id=copy.edition_id).first()
        if not edition:
            results.append({
                "copy_id": copy.id,
                "edition_id": None,
                "status": copy.status,
                "title": None,
                "author": None,
                "covers": None,
                "publisher": None,
                "pages": None,
                "acquisition_date": None,
                "acquisition_type_name": None,
                "shelf_name": None,
                "library_name": None,
                "condition_note": copy.condition_note,
                "acquisition_friend_id": None,
                "friend_name": None,
                "reading_status": None,
                "reading_id": None,
            })
            continue
        # Find first linked work via editions_works
        edition_work = db.query(EditionsWork).filter_by(edition_id=edition.id).first()
        work = db.query(Work).filter_by(id=edition_work.work_id).first() if edition_work else None
        author = (
            db.query(Author)
            .join(WorksAuthor, WorksAuthor.author_id == Author.id)
            .filter(WorksAuthor.work_id == work.id)
            .first()
        ) if work else None
        # Fallback to raw authors on edition
        author_name = None
        if author:
            author_name = f"{author.given_name} {author.family_name}".strip()
        elif edition.authors:
            author_name = edition.authors[0]
        publisher = db.query(Publisher).filter_by(id=edition.publisher_id).first() if edition.publisher_id else None
        shelf = db.query(Shelf).filter_by(id=copy.shelf_id).first() if copy.shelf_id else None
        library = db.query(Library).filter_by(id=shelf.library_id).first() if shelf else None
        acq_type = db.query(AcquisitionType).filter_by(id=copy.acquisition_type_id).first() if copy.acquisition_type_id else None
        friend = db.query(Friend).filter_by(id=copy.acquisition_friend_id).first() if copy.acquisition_friend_id else None
        reading = (
            db.query(Reading)
            .filter_by(copy_id=copy.id, owner_uuid=uuid_module.UUID(owner_uuid))
            .order_by(Reading.id.desc())
            .first()
        )
        results.append({
            "copy_id": copy.id,
            "edition_id": edition.id,
            "status": copy.status,
            "title": edition.title,
            "author": author_name,
            "covers": edition.covers,
            "publisher": publisher.name if publisher else None,
            "pages": edition.pages,
            "acquisition_date": copy.acquisition_date,
            "acquisition_type_name": acq_type.name_ita or acq_type.name if acq_type else None,
            "shelf_name": shelf.name if shelf else None,
            "library_name": library.name if library else None,
            "condition_note": copy.condition_note,
            "acquisition_friend_id": copy.acquisition_friend_id,
            "friend_name": " ".join(filter(None, [friend.name, friend.surname])).strip() or friend.pseudo or friend.email if friend else None,
            "reading_status": reading.status if reading else None,
            "reading_id": reading.id if reading else None,
        })
    return results


def _copy_to_list_item(copy: Copy, db: Session) -> dict:
    edition = db.query(Edition).filter_by(id=copy.edition_id).first() if copy.edition_id else None
    if not edition:
        return {
            "copy_id": copy.id,
            "edition_id": None,
            "status": copy.status,
            "title": None,
            "author": None,
            "covers": None,
            "publisher": None,
            "pages": None,
            "acquisition_date": copy.acquisition_date,
            "acquisition_type_name": None,
            "shelf_name": None,
            "library_name": None,
            "condition_note": copy.condition_note,
            "reading_status": None,
            "reading_id": None,
        }
    edition_work = db.query(EditionsWork).filter_by(edition_id=edition.id).first()
    work = db.query(Work).filter_by(id=edition_work.work_id).first() if edition_work else None
    author = (
        db.query(Author)
        .join(WorksAuthor, WorksAuthor.author_id == Author.id)
        .filter(WorksAuthor.work_id == work.id)
        .first()
    ) if work else None
    author_name = None
    if author:
        author_name = f"{author.given_name} {author.family_name}".strip()
    elif edition.authors:
        author_name = edition.authors[0]
    publisher = db.query(Publisher).filter_by(id=edition.publisher_id).first() if edition.publisher_id else None
    shelf = db.query(Shelf).filter_by(id=copy.shelf_id).first() if copy.shelf_id else None
    library = db.query(Library).filter_by(id=shelf.library_id).first() if shelf else None
    acq_type = db.query(AcquisitionType).filter_by(id=copy.acquisition_type_id).first() if copy.acquisition_type_id else None
    friend = db.query(Friend).filter_by(id=copy.acquisition_friend_id).first() if copy.acquisition_friend_id else None
    reading = (
        db.query(Reading)
        .filter_by(copy_id=copy.id, owner_uuid=copy.owner_uuid)
        .order_by(Reading.id.desc())
        .first()
    )
    return {
        "copy_id": copy.id,
        "edition_id": edition.id,
        "status": copy.status,
        "title": edition.title,
        "author": author_name,
        "covers": edition.covers,
        "publisher": publisher.name if publisher else None,
        "pages": edition.pages,
        "acquisition_date": copy.acquisition_date,
        "acquisition_type_name": (acq_type.name_ita or acq_type.name) if acq_type else None,
        "shelf_name": shelf.name if shelf else None,
        "library_name": library.name if library else None,
        "condition_note": copy.condition_note,
        "acquisition_friend_id": copy.acquisition_friend_id,
        "friend_name": " ".join(filter(None, [friend.name, friend.surname])).strip() or friend.pseudo or friend.email if friend else None,
        "reading_status": reading.status if reading else None,
        "reading_id": reading.id if reading else None,
    }


@router.patch("/{copy_id}", response_model=CopyListItem)
def update_copy(
    copy_id: int,
    data: CopyUpdate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    copy = db.query(Copy).filter_by(id=copy_id, owner_uuid=uuid_module.UUID(owner_uuid)).first()
    if not copy:
        raise HTTPException(status_code=404, detail="Copy not found")
    for field in ["acquisition_date", "acquisition_type_id", "acquisition_friend_id", "shelf_id", "currency", "price", "condition_note", "status"]:
        value = getattr(data, field)
        if value is not None:
            setattr(copy, field, value)
    db.commit()
    db.refresh(copy)
    return _copy_to_list_item(copy, db)


@router.delete("/{copy_id}", status_code=204)
def delete_copy(
    copy_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    copy = db.query(Copy).filter_by(id=copy_id, owner_uuid=uuid_module.UUID(owner_uuid)).first()
    if not copy:
        raise HTTPException(status_code=404, detail="Copy not found")
    db.delete(copy)
    db.commit()
    return


@router.post("/{copy_id}/start-reading", status_code=201)
def start_copy_reading(
    copy_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    owner = uuid_module.UUID(owner_uuid)
    copy = db.query(Copy).filter_by(id=copy_id, owner_uuid=owner).first()
    if not copy or not copy.edition_id:
        raise HTTPException(status_code=404, detail="Copy or edition not found")
    existing = db.query(Reading).filter_by(copy_id=copy.id, owner_uuid=owner, status="active").first()
    if existing:
        return {"reading_id": existing.id, "status": existing.status}
    reading = Reading(owner_uuid=owner, edition_id=copy.edition_id, copy_id=copy.id, start_date=date.today(), current_page=0, finished=False, status="active")
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return {"reading_id": reading.id, "status": reading.status}


@router.post("/{copy_id}/action", status_code=200)
def copy_action(
    copy_id: int,
    data: dict,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    owner = uuid_module.UUID(owner_uuid)
    copy = db.query(Copy).filter_by(id=copy_id, owner_uuid=owner).first()
    if not copy:
        raise HTTPException(status_code=404, detail="Copy not found")

    action_type = data.get("type")
    if action_type == "return":
        copy.disposal_date = None
        copy.disposal_type_id = None
        copy.disposal_friend_id = None
        db.commit()
        return {"copy_id": copy.id, "action": action_type}

    type_name_map = {
        "lend": "prestito",
        "gift": "regalo",
        "sell": "vendita",
    }
    if action_type not in type_name_map:
        raise HTTPException(status_code=400, detail="Invalid action type")

    search_name = type_name_map[action_type]
    acq_type = (
        db.query(AcquisitionType)
        .filter(
            AcquisitionType.direction == "out",
            (AcquisitionType.name_ita.ilike(f"%{search_name}%")) | (AcquisitionType.name.ilike(f"%{search_name}%")),
        )
        .first()
    )
    if not acq_type:
        raise HTTPException(status_code=400, detail=f"Tipo di dismissione non trovato: {search_name}")

    copy.disposal_date = date.today()
    copy.disposal_type_id = acq_type.id
    copy.disposal_friend_id = data.get("friend_id")
    if action_type == "sell" and data.get("price") is not None:
        copy.disposal_price = Decimal(str(data.get("price")))
    db.commit()
    return {"copy_id": copy.id, "action": action_type}
