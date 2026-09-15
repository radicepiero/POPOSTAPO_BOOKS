from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Optional
from pydantic import BaseModel


class CopyDraftCreate(BaseModel):
    isbn: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    image_url: Optional[str] = None
    shelf_id: Optional[int] = None


class CopyDraftResponse(BaseModel):
    copy_id: int
    job_id: UUID
    status: str


class EnrichmentJobResponse(BaseModel):
    id: UUID
    copy_id: Optional[int]
    isbn: Optional[str]
    image_url: Optional[str]
    status: str
    result: Optional[dict]
    created_at: Optional[datetime]
    completed_at: Optional[datetime]


class CopyConfirm(BaseModel):
    job_id: Optional[UUID] = None
    proposal_index: Optional[int] = 0
    work_title: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    authors: Optional[list[str]] = None
    contributors: Optional[list[Contributor]] = None
    publisher: Optional[str] = None
    year: Optional[int] = None
    isbn: Optional[str] = None
    pages: Optional[int] = None
    acquisition_date: Optional[date] = None
    price: Optional[Decimal] = None
    condition_note: Optional[str] = None


class CopyConfirmResponse(BaseModel):
    copy_id: int
    edition_id: int
    status: str


class EditionSearchResponse(BaseModel):
    job_id: UUID
    status: str


class Contributor(BaseModel):
    name: str
    role: Optional[str] = None


class CandidateConfirm(BaseModel):
    source: str
    record_type: Optional[str] = None
    external_id: Optional[str] = None
    local_edition_id: Optional[int] = None

    title: str
    subtitle: Optional[str] = None
    edition_name: Optional[list[str]] = None

    authors: Optional[list[str]] = None
    contributors: Optional[list[Contributor]] = None
    translators: Optional[list[str]] = None
    illustrators: Optional[list[str]] = None
    editors: Optional[list[str]] = None

    publishers: Optional[list[str]] = None
    publisher: Optional[str] = None
    publish_date: Optional[str] = None
    year: Optional[int] = None
    publish_places: Optional[list[str]] = None
    physical_format: Optional[str] = None
    print_type: Optional[str] = None

    isbn: Optional[str] = None
    isbn10: Optional[str] = None
    isbn13: Optional[str] = None
    issn: Optional[str] = None
    lccn: Optional[str] = None
    oclc: Optional[str] = None
    other_identifiers: Optional[dict[str, Any]] = None

    pages: Optional[int] = None
    language: Optional[str] = None

    series: Optional[list[str]] = None
    covers: Optional[list[str]] = None
    images: Optional[dict[str, str]] = None
    thumbnail: Optional[str] = None
    preview_url: Optional[str] = None
    info_url: Optional[str] = None

    ebook_access: Optional[str] = None
    has_fulltext: Optional[bool] = None
    average_rating: Optional[float] = None
    ratings_count: Optional[int] = None

    dimensions: Optional[dict[str, str]] = None
    weight: Optional[str] = None


class EditionConfirmResponse(BaseModel):
    edition_id: int
    status: str


class EditionActionCreate(BaseModel):
    acquisition_date: Optional[date] = None
    acquisition_type_id: Optional[int] = None
    acquisition_friend_id: Optional[int] = None
    shelf_id: Optional[int] = None
    currency: Optional[str] = None
    price: Optional[Decimal] = None
    condition_note: Optional[str] = None


class CopyUpdate(BaseModel):
    acquisition_date: Optional[date] = None
    acquisition_type_id: Optional[int] = None
    acquisition_friend_id: Optional[int] = None
    shelf_id: Optional[int] = None
    currency: Optional[str] = None
    price: Optional[Decimal] = None
    condition_note: Optional[str] = None
    status: Optional[str] = None


class ReadingCreate(BaseModel):
    copy_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    current_page: int = 0
    finished: bool = False
    status: Literal["active", "wishlist", "finished"] = "active"
    rating: Optional[Decimal] = None


class ReadingStatusUpdate(BaseModel):
    status: Literal["active", "wishlist", "finished", "abandoned"]


class BookmarkCreate(BaseModel):
    page: int
    bookmark_date: Optional[date] = None
    note: Optional[str] = None
    rating: Optional[Decimal] = None


class CopyListItem(BaseModel):
    copy_id: int
    edition_id: int | None
    status: str
    title: str | None
    author: str | None
    covers: list[str] | None = None
    publisher: str | None = None
    pages: int | None = None
    acquisition_date: date | None = None
    acquisition_type_name: str | None = None
    shelf_name: str | None = None
    library_name: str | None = None
    condition_note: str | None = None
    acquisition_friend_id: int | None = None
    friend_name: str | None = None
    reading_status: str | None = None
    reading_id: int | None = None
