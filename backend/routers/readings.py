from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..auth import get_current_user_uuid
from ..database import get_db
from ..models import Bookmark, Edition, Membre, Reading
from ..schemas import BookmarkCreate, ReadingStatusUpdate


router = APIRouter(prefix="/readings", tags=["readings"])


@router.get("")
def list_readings(
    status: Literal["all", "active", "inactive", "wishlist", "finished", "abandoned"] = "all",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    last_activity_sql = "GREATEST(COALESCE(lb.last_activity, DATE '0001-01-01'), COALESCE(r.end_date, DATE '0001-01-01'), COALESCE(r.start_date, DATE '0001-01-01'))"
    status_sql = {
        "all": "TRUE",
        "active": "r.status = 'active'",
        "inactive": f"r.status = 'active' AND {last_activity_sql} > DATE '0001-01-01' AND {last_activity_sql} < CURRENT_DATE - INTERVAL '60 days'",
        "wishlist": "r.status = 'wishlist'",
        "abandoned": "r.status = 'abandoned'",
        "finished": "r.status = 'finished'",
    }[status]
    query = text(f"""
        SELECT
            r.id AS reading_id,
            r.edition_id,
            r.copy_id,
            r.start_date,
            r.end_date,
            r.current_page,
            r.finished,
            r.status,
            r.status_changed_at,
            r.created_at,
            r.rating,
            r.is_shared,
            e.title,
            e.subtitle,
            e.pages,
            e.covers,
            p.name AS publisher,
            COALESCE(
                NULLIF(e.authors, ARRAY[]::text[]),
                wa.authors,
                ARRAY[]::text[]
            ) AS authors,
            lb.last_activity,
            (r.status = 'active'
                AND GREATEST(COALESCE(lb.last_activity, DATE '0001-01-01'), COALESCE(r.end_date, DATE '0001-01-01'), COALESCE(r.start_date, DATE '0001-01-01')) > DATE '0001-01-01'
                AND GREATEST(COALESCE(lb.last_activity, DATE '0001-01-01'), COALESCE(r.end_date, DATE '0001-01-01'), COALESCE(r.start_date, DATE '0001-01-01')) < CURRENT_DATE - INTERVAL '60 days') AS is_inactive,
            COALESCE(lb.bookmark_count, 0) AS bookmark_count,
            lb.last_note
        FROM readings r
        JOIN editions e ON e.id = r.edition_id
        LEFT JOIN publishers p ON p.id = e.publisher_id
        LEFT JOIN LATERAL (
            SELECT array_agg(DISTINCT concat_ws(' ', a.given_name, a.family_name)) AS authors
            FROM editions_works ew
            JOIN works_authors wra ON wra.work_id = ew.work_id
            JOIN authors a ON a.id = wra.author_id
            WHERE ew.edition_id = e.id AND wra.role IN ('author', 'co_author')
        ) wa ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                max(b.bookmark_date) AS last_activity,
                count(*) AS bookmark_count,
                (array_agg(NULLIF(regexp_replace(b.note, '<[^>]*>', '', 'g'), '')
                    ORDER BY b.bookmark_date DESC NULLS LAST, b.id DESC)
                    FILTER (WHERE NULLIF(btrim(regexp_replace(b.note, '<[^>]*>', '', 'g')), '') IS NOT NULL))[1] AS last_note
            FROM bookmarks b
            WHERE b.reading_id = r.id
        ) lb ON TRUE
        WHERE (
            r.owner_uuid = :owner_uuid
            OR r.owner_membre_id = (SELECT id FROM membres WHERE uuid = :owner_uuid LIMIT 1)
        )
          AND {status_sql}
        ORDER BY CASE
            WHEN r.status = 'wishlist' THEN r.created_at::date
            ELSE GREATEST(
                COALESCE(lb.last_activity, DATE '0001-01-01'),
                COALESCE(r.end_date, DATE '0001-01-01'),
                COALESCE(r.start_date, DATE '0001-01-01')
            )
        END DESC,
        r.id DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(query, {
        "owner_uuid": UUID(owner_uuid),
        "limit": limit,
        "offset": offset,
    }).mappings().all()
    return {"items": [dict(row) for row in rows], "limit": limit, "offset": offset}


@router.patch("/{reading_id}/status")
def update_reading_status(
    reading_id: int,
    data: ReadingStatusUpdate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    if data.status not in {"active", "wishlist", "finished", "abandoned"}:
        raise HTTPException(status_code=400, detail="Invalid reading status")
    owner = UUID(owner_uuid)
    membre = db.query(Membre).filter_by(uuid=owner).first()
    reading = db.query(Reading).filter(Reading.id == reading_id).first()
    owns_reading = reading is not None and (reading.owner_uuid == owner or (membre is not None and reading.owner_membre_id == membre.id))
    if not owns_reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    reading.status = data.status
    reading.finished = data.status == "finished"
    if data.status == "finished" and reading.end_date is None:
        reading.end_date = date.today()
    reading.status_changed_at = db.execute(text("SELECT now() ")).scalar_one()
    db.commit()
    return {"reading_id": reading.id, "status": reading.status, "finished": reading.finished}


@router.delete("/{reading_id}", status_code=204)
def delete_reading(
    reading_id: int,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    owner = UUID(owner_uuid)
    membre = db.query(Membre).filter_by(uuid=owner).first()
    reading = db.query(Reading).filter(Reading.id == reading_id).first()
    owns_reading = reading is not None and (reading.owner_uuid == owner or (membre is not None and reading.owner_membre_id == membre.id))
    if not owns_reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    db.delete(reading)
    db.commit()
    return


@router.post("/{reading_id}/bookmarks", status_code=201)
def add_bookmark(
    reading_id: int,
    data: BookmarkCreate,
    db: Session = Depends(get_db),
    owner_uuid: str = Depends(get_current_user_uuid),
):
    owner = UUID(owner_uuid)
    membre = db.query(Membre).filter_by(uuid=owner).first()
    reading = db.query(Reading).filter(Reading.id == reading_id).first()
    owns_reading = reading is not None and (reading.owner_uuid == owner or (membre is not None and reading.owner_membre_id == membre.id))
    if not owns_reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    bookmark = Bookmark(
        reading_id=reading_id,
        page=data.page,
        bookmark_date=data.bookmark_date or date.today(),
        note=data.note,
        rating=data.rating,
    )
    db.add(bookmark)
    if data.page > reading.current_page:
        reading.current_page = data.page

    edition = db.query(Edition).filter(Edition.id == reading.edition_id).first() if reading.edition_id else None
    if edition and edition.pages and edition.pages > 0 and data.page >= edition.pages:
        reading.status = "finished"
        reading.finished = True
        if not reading.end_date:
            reading.end_date = data.bookmark_date or date.today()

    db.commit()
    db.refresh(bookmark)
    return {"bookmark_id": bookmark.id, "reading_id": reading_id, "page": bookmark.page, "status": reading.status}
