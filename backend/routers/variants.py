import pathlib
import uuid as uuid_module

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_user_uuid
from ..database import get_db
from ..models import Copy, Edition, EditionVariant, EditionVariantImage, Reading
from ..schemas import EditionVariantCreate, EditionVariantImageCreate, EditionVariantUpdate
from ..services.enrichment import _variant_to_dict
from .editions import _edition_ownership


router = APIRouter(tags=["variants"])
UPLOAD_DIR = pathlib.Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
IMAGE_KINDS = {"front", "back", "spine", "copyright", "other"}


def _get_variant_or_404(variant_id: int, db: Session) -> EditionVariant:
    variant = db.query(EditionVariant).filter_by(id=variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    return variant


def _check_variant_edit_permission(variant: EditionVariant, db: Session, owner_uuid: str) -> None:
    if not _edition_ownership(db, variant.edition_id, owner_uuid)["can_edit"]:
        raise HTTPException(status_code=403, detail="Non hai i permessi per modificare questa edizione")


def _validate_kind(kind: str) -> str:
    if kind not in IMAGE_KINDS:
        raise HTTPException(status_code=400, detail="Tipo immagine non valido")
    return kind


@router.get("/editions/{edition_id}/variants")
def list_edition_variants(
    edition_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    if not db.query(Edition).filter_by(id=edition_id).first():
        raise HTTPException(status_code=404, detail="Edition not found")
    variants = (
        db.query(EditionVariant)
        .filter_by(edition_id=edition_id)
        .order_by(EditionVariant.is_default.desc(), EditionVariant.id)
        .all()
    )
    return {"items": [_variant_to_dict(variant, db) for variant in variants]}


@router.post("/editions/{edition_id}/variants", status_code=201)
def create_edition_variant(
    edition_id: int,
    data: EditionVariantCreate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    edition = db.query(Edition).filter_by(id=edition_id).first()
    if not edition:
        raise HTTPException(status_code=404, detail="Edition not found")
    if not _edition_ownership(db, edition_id, owner_uuid)["can_edit"]:
        raise HTTPException(status_code=403, detail="Non hai i permessi per modificare questa edizione")

    payload = data.model_dump(exclude_unset=True)
    variant = EditionVariant(
        edition_id=edition_id,
        label=payload.pop("label", None) or "Nuova variante",
        status=edition.status,
        source="manual",
        created_by_uuid=uuid_module.UUID(owner_uuid),
        **payload,
    )
    if variant.is_default:
        db.query(EditionVariant).filter_by(edition_id=edition_id, is_default=True).update({"is_default": False}, synchronize_session=False)
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return _variant_to_dict(variant, db)


@router.get("/variants/{variant_id}")
def get_variant(
    variant_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    return _variant_to_dict(_get_variant_or_404(variant_id, db), db)


@router.patch("/variants/{variant_id}")
def update_variant(
    variant_id: int,
    data: EditionVariantUpdate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    variant = _get_variant_or_404(variant_id, db)
    _check_variant_edit_permission(variant, db, owner_uuid)
    payload = data.model_dump(exclude_unset=True)

    if payload.get("is_default") is True:
        db.query(EditionVariant).filter(
            EditionVariant.edition_id == variant.edition_id,
            EditionVariant.id != variant.id,
            EditionVariant.is_default,
        ).update({"is_default": False}, synchronize_session=False)
    elif payload.get("is_default") is False and variant.is_default:
        raise HTTPException(status_code=400, detail="Seleziona prima un'altra variante predefinita")

    for field, value in payload.items():
        setattr(variant, field, value)
    db.commit()
    db.refresh(variant)
    return _variant_to_dict(variant, db)


@router.delete("/variants/{variant_id}")
def delete_variant(
    variant_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    variant = _get_variant_or_404(variant_id, db)
    _check_variant_edit_permission(variant, db, owner_uuid)
    if variant.is_default:
        raise HTTPException(status_code=400, detail="Seleziona prima un'altra variante predefinita")

    copies = db.query(Copy).filter_by(edition_variant_id=variant.id).count()
    readings = db.query(Reading).filter_by(edition_variant_id=variant.id).count()
    if copies or readings:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "La variante è utilizzata da copie o letture.",
                "copies": copies,
                "readings": readings,
            },
        )
    db.delete(variant)
    db.commit()
    return {"variant_id": variant_id, "status": "deleted"}


@router.post("/variants/{variant_id}/images", status_code=201)
def upload_variant_image(
    variant_id: int,
    image: UploadFile = File(...),
    kind: str = Form("front"),
    position: int = Form(0),
    is_primary: bool = Form(False),
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    variant = _get_variant_or_404(variant_id, db)
    _check_variant_edit_permission(variant, db, owner_uuid)
    kind = _validate_kind(kind)
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

    record = EditionVariantImage(
        edition_variant_id=variant.id,
        kind=kind,
        url=f"/uploads/{file_path.name}",
        position=position,
        is_primary=is_primary,
        source="manual",
        created_by_uuid=uuid_module.UUID(owner_uuid),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "url": record.url, "kind": record.kind, "position": record.position, "is_primary": record.is_primary}


@router.post("/variants/{variant_id}/images/url", status_code=201)
def add_variant_image_url(
    variant_id: int,
    data: EditionVariantImageCreate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    variant = _get_variant_or_404(variant_id, db)
    _check_variant_edit_permission(variant, db, owner_uuid)
    record = EditionVariantImage(
        edition_variant_id=variant.id,
        kind=_validate_kind(data.kind),
        url=data.url.strip(),
        position=data.position,
        is_primary=data.is_primary,
        source="manual",
        created_by_uuid=uuid_module.UUID(owner_uuid),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "url": record.url, "kind": record.kind, "position": record.position, "is_primary": record.is_primary}


@router.delete("/variants/{variant_id}/images/{image_id}")
def delete_variant_image(
    variant_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    variant = _get_variant_or_404(variant_id, db)
    _check_variant_edit_permission(variant, db, owner_uuid)
    image = db.query(EditionVariantImage).filter_by(id=image_id, edition_variant_id=variant.id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    db.delete(image)
    db.commit()
    return {"image_id": image_id, "status": "deleted"}
