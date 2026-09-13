import uuid as _uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import func, ForeignKey, String, Integer, Boolean, Date, DateTime, Text, Numeric, ARRAY, BigInteger
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


# ============================================================
# Lookup / reference tables
# ============================================================

class Language(Base):
    __tablename__ = "languages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True)
    name: Mapped[str] = mapped_column(String(100))


class Nation(Base):
    __tablename__ = "nations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[Optional[str]] = mapped_column(String(2), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(100))
    name_ita: Mapped[str] = mapped_column(String(100))
    continent: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)


class Form(Base):
    __tablename__ = "forms"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    name_ita: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class Binding(Base):
    __tablename__ = "bindings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    name_ita: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class Color(Base):
    __tablename__ = "colors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))


class Currency(Base):
    __tablename__ = "currencies"
    code: Mapped[str] = mapped_column(String(10), primary_key=True)


class AuthorRole(Base):
    __tablename__ = "author_roles"
    role: Mapped[str] = mapped_column(String(30), primary_key=True)
    name_ita: Mapped[str] = mapped_column(String(30))
    applies_to: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)


class Relationship(Base):
    __tablename__ = "relationships"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    name_ita: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class AcquisitionType(Base):
    __tablename__ = "acquisition_types"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(250))
    name_ita: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    direction: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)


class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    name_ita: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class MeasurementUnit(Base):
    __tablename__ = "measurement_units"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name_ita: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)


# ============================================================
# Genres (hierarchical)
# ============================================================

class Genre(Base):
    __tablename__ = "genres"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(250))
    name_ita: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("genres.id"), nullable=True)
    level: Mapped[int] = mapped_column(Integer, default=0)


class GenreLink(Base):
    __tablename__ = "genres_links"
    genre_id: Mapped[int] = mapped_column(ForeignKey("genres.id"), primary_key=True)
    link_id: Mapped[int] = mapped_column(ForeignKey("links.id"), primary_key=True)
    created_by_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Users (membre)
# ============================================================

class Membre(Base):
    __tablename__ = "membres"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), unique=True, nullable=True)
    pseudo: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    surname: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    language_id: Mapped[Optional[int]] = mapped_column(ForeignKey("languages.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Friends
# ============================================================

class Friend(Base):
    __tablename__ = "friends"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("membres.id"))
    name: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    surname: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    pseudo: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    linked_membre_id: Mapped[Optional[int]] = mapped_column(ForeignKey("membres.id"), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    relationship_id: Mapped[Optional[int]] = mapped_column(ForeignKey("relationships.id"), nullable=True)
    share_readings: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Publishers & Series
# ============================================================

class Publisher(Base):
    __tablename__ = "publishers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    nation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("nations.id"), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="approved")
    source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Series(Base):
    __tablename__ = "series"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    publisher_id: Mapped[Optional[int]] = mapped_column(ForeignKey("publishers.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Authors
# ============================================================

class Author(Base):
    __tablename__ = "authors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gender: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    given_name: Mapped[str] = mapped_column(String(150))
    family_name: Mapped[str] = mapped_column(String(150))
    acronym_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    acronym_family_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    nation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("nations.id"), nullable=True)
    pen_name_of: Mapped[Optional[int]] = mapped_column(ForeignKey("authors.id"), nullable=True)
    birth_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    birth_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    birth_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    birth_era: Mapped[int] = mapped_column(Integer, default=1)
    death_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    death_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    death_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    death_era: Mapped[int] = mapped_column(Integer, default=1)
    is_dead: Mapped[bool] = mapped_column(Boolean, default=False)
    birth_nation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("nations.id"), nullable=True)
    wikidata_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ============================================================
# Works
# ============================================================

class Work(Base):
    __tablename__ = "works"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    original_title: Mapped[str] = mapped_column(String(255))
    original_subtitle: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    publishing_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    publishing_era: Mapped[int] = mapped_column(Integer, default=1)
    original_language_id: Mapped[Optional[int]] = mapped_column(ForeignKey("languages.id"), nullable=True)
    form_id: Mapped[Optional[int]] = mapped_column(ForeignKey("forms.id"), nullable=True)
    wikidata_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorksAuthor(Base):
    __tablename__ = "works_authors"
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(30), ForeignKey("author_roles.role"), primary_key=True)


class WorksGenre(Base):
    __tablename__ = "works_genres"
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), primary_key=True)
    genre_id: Mapped[int] = mapped_column(ForeignKey("genres.id"), primary_key=True)
    level: Mapped[int] = mapped_column(Integer, default=0)
    created_by_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkWork(Base):
    __tablename__ = "work_works"
    parent_work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), primary_key=True)
    child_work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_by_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Editions
# ============================================================

class Edition(Base):
    __tablename__ = "editions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    subtitle: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    publishing_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    publishing_era: Mapped[int] = mapped_column(Integer, default=1)
    language_id: Mapped[Optional[int]] = mapped_column(ForeignKey("languages.id"), nullable=True)
    publisher_id: Mapped[Optional[int]] = mapped_column(ForeignKey("publishers.id"), nullable=True)
    series_id: Mapped[Optional[int]] = mapped_column(ForeignKey("series.id"), nullable=True)
    series_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    isbn10: Mapped[Optional[str]] = mapped_column(String(13), nullable=True)
    isbn13: Mapped[Optional[str]] = mapped_column(String(13), nullable=True)
    pages: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    binding_id: Mapped[Optional[int]] = mapped_column(ForeignKey("bindings.id"), nullable=True)
    height_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    width_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    thickness_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weight_g: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    color_id: Mapped[Optional[int]] = mapped_column(ForeignKey("colors.id"), nullable=True)
    # hybrid columns
    authors: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text), nullable=True)
    covers: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text), nullable=True)
    source_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    search_vector = mapped_column(TSVECTOR, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EditionsWork(Base):
    __tablename__ = "editions_works"
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), primary_key=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_by_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EditionsAuthor(Base):
    __tablename__ = "editions_authors"
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(30), ForeignKey("author_roles.role"), primary_key=True)


class EditionEdition(Base):
    __tablename__ = "edition_editions"
    parent_edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), primary_key=True)
    child_edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_by_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EditionMeasurement(Base):
    __tablename__ = "edition_measurements"
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), primary_key=True)
    unit_id: Mapped[str] = mapped_column(ForeignKey("measurement_units.id"), primary_key=True)
    value: Mapped[int] = mapped_column(Integer)


class EditionContent(Base):
    __tablename__ = "edition_contents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("authors.id"), nullable=True)
    role: Mapped[Optional[str]] = mapped_column(String(30), ForeignKey("author_roles.role"), nullable=True)
    language_id: Mapped[Optional[int]] = mapped_column(ForeignKey("languages.id"), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subtitle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    argument: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    memo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ============================================================
# Tags & Links
# ============================================================

class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(250))
    language_id: Mapped[Optional[int]] = mapped_column(ForeignKey("languages.id"), nullable=True)
    created_by_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorksTag(Base):
    __tablename__ = "works_tags"
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)
    created_by_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))


class EditionsTag(Base):
    __tablename__ = "editions_tags"
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)
    created_by_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))


class AuthorsTag(Base):
    __tablename__ = "authors_tags"
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)
    created_by_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))


class Link(Base):
    __tablename__ = "links"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    url: Mapped[str] = mapped_column(String(500))
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    language_id: Mapped[Optional[int]] = mapped_column(ForeignKey("languages.id"), nullable=True)
    created_by_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorksLink(Base):
    __tablename__ = "works_links"
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), primary_key=True)
    link_id: Mapped[int] = mapped_column(ForeignKey("links.id"), primary_key=True)


class EditionsLink(Base):
    __tablename__ = "editions_links"
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), primary_key=True)
    link_id: Mapped[int] = mapped_column(ForeignKey("links.id"), primary_key=True)


class AuthorsLink(Base):
    __tablename__ = "authors_links"
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"), primary_key=True)
    link_id: Mapped[int] = mapped_column(ForeignKey("links.id"), primary_key=True)


# ============================================================
# Libraries, Shelves, Copies
# ============================================================

class Library(Base):
    __tablename__ = "libraries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    name: Mapped[str] = mapped_column(String(250))
    location: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Shelf(Base):
    __tablename__ = "shelves"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    library_id: Mapped[int] = mapped_column(ForeignKey("libraries.id"))
    name: Mapped[str] = mapped_column(String(255))
    location: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    length_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    width_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    book_count: Mapped[int] = mapped_column(Integer, default=0)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Copy(Base):
    __tablename__ = "copies"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    edition_id: Mapped[Optional[int]] = mapped_column(ForeignKey("editions.id"), nullable=True)
    shelf_id: Mapped[Optional[int]] = mapped_column(ForeignKey("shelves.id"), nullable=True)
    barcode: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    acquisition_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    acquisition_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("acquisition_types.id"), nullable=True)
    acquisition_friend_id: Mapped[Optional[int]] = mapped_column(ForeignKey("friends.id"), nullable=True)
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(String(10), ForeignKey("currencies.code"), nullable=True)
    condition_note: Mapped[Optional[str]] = mapped_column(String(450), nullable=True)
    sort_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    disposal_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    disposal_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("acquisition_types.id"), nullable=True)
    disposal_friend_id: Mapped[Optional[int]] = mapped_column(ForeignKey("friends.id"), nullable=True)
    disposal_note: Mapped[Optional[str]] = mapped_column(String(450), nullable=True)
    disposal_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ============================================================
# Transactions
# ============================================================

class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    copy_id: Mapped[int] = mapped_column(ForeignKey("copies.id"))
    type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("acquisition_types.id"), nullable=True)
    direction: Mapped[int] = mapped_column(Integer, default=1)
    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    transaction_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Borrow(Base):
    __tablename__ = "borrows"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"))
    friend_id: Mapped[Optional[int]] = mapped_column(ForeignKey("friends.id"), nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    returned_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Readings & Bookmarks
# ============================================================

class Reading(Base):
    __tablename__ = "readings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"))
    copy_id: Mapped[Optional[int]] = mapped_column(ForeignKey("copies.id"), nullable=True)
    friend_id: Mapped[Optional[int]] = mapped_column(ForeignKey("friends.id"), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    current_page: Mapped[int] = mapped_column(Integer, default=0)
    finished: Mapped[bool] = mapped_column(Boolean, default=False)
    rating: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Bookmark(Base):
    __tablename__ = "bookmarks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reading_id: Mapped[int] = mapped_column(ForeignKey("readings.id"))
    page: Mapped[int] = mapped_column(Integer)
    bookmark_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rating: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    use_rating: Mapped[bool] = mapped_column(Boolean, default=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Extracts
# ============================================================

class Extract(Base):
    __tablename__ = "extracts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"))
    owner_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    page: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    content: Mapped[str] = mapped_column(Text)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ExtractLink(Base):
    __tablename__ = "extract_links"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    extract_a_id: Mapped[int] = mapped_column(ForeignKey("extracts.id"))
    extract_b_id: Mapped[int] = mapped_column(ForeignKey("extracts.id"))
    argument: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comment_language_id: Mapped[Optional[int]] = mapped_column(ForeignKey("languages.id"), nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Quote references
# ============================================================

class ArtType(Base):
    __tablename__ = "art_types"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    name_ita: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class QuoteReference(Base):
    __tablename__ = "quote_references"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"))
    art_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("art_types.id"), nullable=True)
    artist: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    artwork: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    created_by_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ============================================================
# Sharing tables
# ============================================================

class ShareLibrary(Base):
    __tablename__ = "share_libraries"
    library_id: Mapped[int] = mapped_column(ForeignKey("libraries.id"), primary_key=True)
    membre_id: Mapped[int] = mapped_column(ForeignKey("membres.id"), primary_key=True)
    permission_id: Mapped[Optional[int]] = mapped_column(ForeignKey("permissions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SharingMembreAuthor(Base):
    __tablename__ = "sharing_membre_author"
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"), primary_key=True)
    membre_id: Mapped[int] = mapped_column(ForeignKey("membres.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SharingMembreEdition(Base):
    __tablename__ = "sharing_membre_edition"
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), primary_key=True)
    membre_id: Mapped[int] = mapped_column(ForeignKey("membres.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SharingMembrePublisher(Base):
    __tablename__ = "sharing_membre_publisher"
    publisher_id: Mapped[int] = mapped_column(ForeignKey("publishers.id"), primary_key=True)
    membre_id: Mapped[int] = mapped_column(ForeignKey("membres.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SharingMembreSerie(Base):
    __tablename__ = "sharing_membre_serie"
    serie_id: Mapped[int] = mapped_column(ForeignKey("series.id"), primary_key=True)
    membre_id: Mapped[int] = mapped_column(ForeignKey("membres.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SharingMembreWork(Base):
    __tablename__ = "sharing_membre_work"
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), primary_key=True)
    membre_id: Mapped[int] = mapped_column(ForeignKey("membres.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Messages
# ============================================================

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("membres.id"))
    recipient_id: Mapped[int] = mapped_column(ForeignKey("membres.id"))
    subject: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    sender_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    recipient_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Arguments
# ============================================================

class Argument(Base):
    __tablename__ = "arguments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ArgumentTranslation(Base):
    __tablename__ = "argument_translations"
    argument_id: Mapped[int] = mapped_column(ForeignKey("arguments.id"), primary_key=True)
    language_id: Mapped[int] = mapped_column(ForeignKey("languages.id"), primary_key=True)
    name: Mapped[str] = mapped_column(String(250))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


# ============================================================
# Periods
# ============================================================

class Period(Base):
    __tablename__ = "periods"
    id: Mapped[str] = mapped_column(String(15), primary_key=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    duration: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    name_ita: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    name_eng: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


# ============================================================
# Settings
# ============================================================

class GlobalSetting(Base):
    __tablename__ = "global_settings"
    key: Mapped[str] = mapped_column(String(25), primary_key=True)
    language_id: Mapped[int] = mapped_column(ForeignKey("languages.id"), primary_key=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class UserSetting(Base):
    __tablename__ = "user_settings"
    membre_id: Mapped[int] = mapped_column(ForeignKey("membres.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(25), primary_key=True)
    language_id: Mapped[int] = mapped_column(ForeignKey("languages.id"), primary_key=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


# ============================================================
# Copy enrichment jobs (our addition)
# ============================================================

class CopyEnrichmentJob(Base):
    __tablename__ = "copy_enrichment_jobs"
    id: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    copy_id: Mapped[Optional[int]] = mapped_column(ForeignKey("copies.id"), nullable=True)
    owner_uuid: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    isbn: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    result: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
