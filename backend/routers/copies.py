import pathlib
from typing import Optional
from uuid import UUID
import uuid as uuid_module
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, File, Form, UploadFile
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user_uuid
from ..models import Author, Copy, CopyEnrichmentJob, Edition, EditionsWork, Work, WorksAuthor
from ..schemas import CopyDraftCreate, CopyDraftResponse, EnrichmentJobResponse, CopyConfirm, CopyConfirmResponse, CopyListItem
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
        results.append({
            "copy_id": copy.id,
            "edition_id": edition.id,
            "status": copy.status,
            "title": edition.title,
            "author": author_name,
        })
    return results
