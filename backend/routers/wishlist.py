from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user_uuid
from ..database import get_db
from ..models import Copy, Edition, EditionVariant, EditionsWork, Membre, Reading, WishlistItem, Work
from ..schemas import WishlistItemCreate, WishlistItemUpdate, WishlistStartReading


router = APIRouter(prefix="/wishlist", tags=["wishlist"])


def _item_to_dict(item: WishlistItem, db: Session) -> dict:
    work = db.query(Work).filter_by(id=item.work_id).first() if item.work_id else None
    work_title = work.original_title if work else None
    return {
        "id": item.id,
        "work_id": item.work_id,
        "work_title": work_title,
        "title": item.title or work_title,
        "author": item.author,
        "note": item.note,
        "status": item.status,
        "fulfilled_reading_id": item.fulfilled_reading_id,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _get_owned_item(db: Session, item_id: int, owner: UUID) -> WishlistItem:
    item = db.query(WishlistItem).filter_by(id=item_id, owner_uuid=owner).first()
    if not item:
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    return item


@router.get("")
def list_wishlist(
    status: str = "active",
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    owner = UUID(owner_uuid)
    query = db.query(WishlistItem).filter_by(owner_uuid=owner)
    if status != "all":
        query = query.filter(WishlistItem.status == status)
    items = query.order_by(WishlistItem.created_at.desc(), WishlistItem.id.desc()).all()
    return {"items": [_item_to_dict(item, db) for item in items]}


@router.post("", status_code=201)
def create_wishlist_item(
    data: WishlistItemCreate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    if data.work_id is None and not (data.title or data.author):
        raise HTTPException(status_code=400, detail="Provide a work or title/author")
    if data.work_id is not None and not db.query(Work).filter_by(id=data.work_id).first():
        raise HTTPException(status_code=400, detail="Work not found")
    item = WishlistItem(
        owner_uuid=UUID(owner_uuid),
        work_id=data.work_id,
        title=data.title,
        author=data.author,
        note=data.note,
        status="active",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_to_dict(item, db)


@router.patch("/{item_id}")
def update_wishlist_item(
    item_id: int,
    data: WishlistItemUpdate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    item = _get_owned_item(db, item_id, UUID(owner_uuid))
    for field in ("work_id", "title", "author", "note"):
        if field in data.model_fields_set:
            setattr(item, field, getattr(data, field))
    if data.status is not None:
        item.status = data.status
        if data.status != "fulfilled":
            item.fulfilled_reading_id = None
    db.commit()
    db.refresh(item)
    return _item_to_dict(item, db)


@router.post("/{item_id}/start-reading", status_code=201)
def start_wishlist_reading(
    item_id: int,
    data: WishlistStartReading,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    owner = UUID(owner_uuid)
    item = _get_owned_item(db, item_id, owner)
    if item.status != "active":
        raise HTTPException(status_code=400, detail="Wishlist item is not active")

    copy = None
    variant = None
    if data.copy_id is not None:
        copy = db.query(Copy).filter_by(id=data.copy_id, owner_uuid=owner).first()
        if not copy:
            raise HTTPException(status_code=400, detail="Copy not found")
        variant = db.query(EditionVariant).filter_by(id=copy.edition_variant_id).first()
    elif data.edition_variant_id is not None:
        variant = db.query(EditionVariant).filter_by(id=data.edition_variant_id).first()

    if not variant:
        raise HTTPException(status_code=400, detail="Select a copy or edition variant")
    edition = db.query(Edition).filter_by(id=variant.edition_id).first()
    if not edition:
        raise HTTPException(status_code=400, detail="Edition not found")
    if item.work_id:
        linked = db.query(EditionsWork).filter_by(edition_id=edition.id, work_id=item.work_id).first()
        if not linked:
            raise HTTPException(status_code=400, detail="Edition is not linked to the wished work")

    membre = db.query(Membre).filter_by(uuid=owner).first()
    reading = Reading(
        owner_uuid=owner,
        owner_membre_id=membre.id if membre else None,
        edition_id=edition.id,
        edition_variant_id=variant.id,
        copy_id=copy.id if copy else None,
        start_date=data.start_date or date.today(),
        status="active",
    )
    db.add(reading)
    db.flush()
    item.status = "fulfilled"
    item.fulfilled_reading_id = reading.id
    db.commit()
    db.refresh(reading)
    return {"reading_id": reading.id, "wishlist_item_id": item.id, "status": "fulfilled"}


@router.delete("/{item_id}", status_code=204)
def delete_wishlist_item(
    item_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    item = _get_owned_item(db, item_id, UUID(owner_uuid))
    db.delete(item)
    db.commit()
