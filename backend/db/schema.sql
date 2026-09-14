CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE entity_status AS ENUM ('draft', 'proposed', 'approved', 'rejected', 'merged');
CREATE TYPE data_source AS ENUM ('manual', 'open_library', 'google_books', 'isbn_db', 'ollama', 'openai', 'claude');

-- ============================================================
-- Lookup / reference tables
-- ============================================================

CREATE TABLE languages (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE nations (
  id SERIAL PRIMARY KEY,
  code VARCHAR(2) UNIQUE,
  name VARCHAR(100) NOT NULL,
  name_ita VARCHAR(100) NOT NULL,
  continent VARCHAR(15)
);

CREATE TABLE forms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  name_ita VARCHAR(50)
);

CREATE TABLE bindings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  name_ita VARCHAR(50)
);

CREATE TABLE colors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE currencies (
  code VARCHAR(10) PRIMARY KEY
);

CREATE TABLE author_roles (
  role VARCHAR(30) PRIMARY KEY,
  name_ita VARCHAR(30) NOT NULL,
  applies_to CHAR(1)  -- W=work, E=edition, NULL=both
);

CREATE TABLE relationships (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  name_ita VARCHAR(50)
);

CREATE TABLE acquisition_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(250) NOT NULL,
  name_ita VARCHAR(250),
  direction VARCHAR(3)  -- 'in' / 'out'
);

CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  name_ita VARCHAR(50)
);

CREATE TABLE measurement_units (
  id VARCHAR(50) PRIMARY KEY,
  name_ita VARCHAR(50),
  description VARCHAR(250)
);

-- ============================================================
-- Genres (hierarchical)
-- ============================================================

CREATE TABLE genres (
  id SERIAL PRIMARY KEY,
  name VARCHAR(250) NOT NULL,
  name_ita VARCHAR(250),
  parent_id INT REFERENCES genres(id),
  level INT DEFAULT 0
);

CREATE TABLE genres_links (
  genre_id INT NOT NULL REFERENCES genres(id),
  link_id INT NOT NULL,  -- FK added after links table
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (genre_id, link_id)
);

-- ============================================================
-- Users (membre)
-- ============================================================

CREATE TABLE membres (
  id SERIAL PRIMARY KEY,
  uuid UUID UNIQUE,  -- mapped for auth integration
  pseudo VARCHAR(32),
  email VARCHAR(255),
  name VARCHAR(250),
  surname VARCHAR(250),
  is_admin BOOLEAN NOT NULL DEFAULT false,
  language_id INT REFERENCES languages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Friends
-- ============================================================

CREATE TABLE friends (
  id SERIAL PRIMARY KEY,
  owner_id INT NOT NULL REFERENCES membres(id),
  name VARCHAR(20),
  surname VARCHAR(20),
  pseudo VARCHAR(20),
  linked_membre_id INT REFERENCES membres(id),
  email VARCHAR(50),
  relationship_id INT REFERENCES relationships(id),
  share_readings BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Publishers & Series
-- ============================================================

CREATE TABLE publishers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  nation_id INT REFERENCES nations(id),
  website TEXT,
  status entity_status NOT NULL DEFAULT 'approved',
  source data_source,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE series (
  id SERIAL PRIMARY KEY,
  publisher_id INT REFERENCES publishers(id),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Authors
-- ============================================================

CREATE TABLE authors (
  id SERIAL PRIMARY KEY,
  gender CHAR(1),
  given_name VARCHAR(150) NOT NULL,
  family_name VARCHAR(150) NOT NULL,
  acronym_name VARCHAR(150),
  acronym_family_name VARCHAR(150),
  nation_id INT REFERENCES nations(id),
  pen_name_of INT REFERENCES authors(id),
  birth_year INT,
  birth_month INT,
  birth_day INT,
  birth_era INT DEFAULT 1,  -- 1=AD, -1=BC
  death_year INT,
  death_month INT,
  death_day INT,
  death_era INT DEFAULT 1,
  is_dead BOOLEAN NOT NULL DEFAULT false,
  birth_nation_id INT REFERENCES nations(id),
  wikidata_id VARCHAR(50),
  status entity_status NOT NULL DEFAULT 'proposed',
  source data_source,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Works
-- ============================================================

CREATE TABLE works (
  id SERIAL PRIMARY KEY,
  original_title VARCHAR(255) NOT NULL,
  original_subtitle VARCHAR(255),
  publishing_year INT,
  publishing_era INT DEFAULT 1,  -- 1=AD, -1=BC
  original_language_id INT REFERENCES languages(id),
  form_id INT REFERENCES forms(id),
  wikidata_id VARCHAR(50),
  status entity_status NOT NULL DEFAULT 'proposed',
  source data_source,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE works_authors (
  work_id INT NOT NULL REFERENCES works(id),
  author_id INT NOT NULL REFERENCES authors(id),
  role VARCHAR(30) NOT NULL REFERENCES author_roles(role),
  PRIMARY KEY (work_id, author_id, role)
);

CREATE TABLE works_genres (
  work_id INT NOT NULL REFERENCES works(id),
  genre_id INT NOT NULL REFERENCES genres(id),
  level INT DEFAULT 0,
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (work_id, genre_id)
);

-- Work-to-work: anthologies / collections
CREATE TABLE work_works (
  parent_work_id INT NOT NULL REFERENCES works(id),
  child_work_id INT NOT NULL REFERENCES works(id),
  position INT NOT NULL DEFAULT 0,
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_work_id, child_work_id)
);

-- ============================================================
-- Editions
-- ============================================================

CREATE TABLE editions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255),
  publishing_year INT,
  publishing_era INT DEFAULT 1,
  language_id INT REFERENCES languages(id),
  publisher_id INT REFERENCES publishers(id),
  series_id INT REFERENCES series(id),
  series_number INT,
  isbn10 VARCHAR(13),
  isbn13 VARCHAR(13),
  pages INT,
  binding_id INT REFERENCES bindings(id),
  height_mm INT,
  width_mm INT,
  thickness_mm INT,
  weight_g INT,
  color_id INT REFERENCES colors(id),
  -- hybrid columns (for editions not yet linked to works/authors)
  authors TEXT[],
  covers TEXT[],
  source_data JSONB,
  -- full-text search (stored, updated via trigger)
  search_vector TSVECTOR,
  status entity_status NOT NULL DEFAULT 'proposed',
  source data_source,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: edition ↔ work (replaces old editions.work_id)
CREATE TABLE editions_works (
  edition_id INT NOT NULL REFERENCES editions(id),
  work_id INT NOT NULL REFERENCES works(id),
  position INT DEFAULT 0,  -- order of work in collected edition
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (edition_id, work_id)
);

CREATE TABLE editions_authors (
  edition_id INT NOT NULL REFERENCES editions(id),
  author_id INT NOT NULL REFERENCES authors(id),
  role VARCHAR(30) NOT NULL REFERENCES author_roles(role),
  PRIMARY KEY (edition_id, author_id, role)
);

-- Edition-to-edition: collected physical editions
CREATE TABLE edition_editions (
  parent_edition_id INT NOT NULL REFERENCES editions(id),
  child_edition_id INT NOT NULL REFERENCES editions(id),
  position INT NOT NULL DEFAULT 0,
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_edition_id, child_edition_id)
);

-- Additional measurements for editions
CREATE TABLE edition_measurements (
  edition_id INT NOT NULL REFERENCES editions(id),
  unit_id VARCHAR(50) NOT NULL REFERENCES measurement_units(id),
  value INT NOT NULL,
  PRIMARY KEY (edition_id, unit_id)
);

-- Extra content inside an edition (prefaces, afterwords, etc.)
CREATE TABLE edition_contents (
  id SERIAL PRIMARY KEY,
  edition_id INT NOT NULL REFERENCES editions(id),
  position INT NOT NULL DEFAULT 0,
  author_id INT REFERENCES authors(id),
  role VARCHAR(30) REFERENCES author_roles(role),
  language_id INT REFERENCES languages(id),
  title TEXT,
  subtitle TEXT,
  argument VARCHAR(250),
  memo TEXT,
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tags & Links (polymorphic)
-- ============================================================

CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(250) NOT NULL,
  language_id INT REFERENCES languages(id),
  created_by_uuid UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE works_tags (
  work_id INT NOT NULL REFERENCES works(id),
  tag_id INT NOT NULL REFERENCES tags(id),
  created_by_uuid UUID NOT NULL,
  PRIMARY KEY (work_id, tag_id)
);

CREATE TABLE editions_tags (
  edition_id INT NOT NULL REFERENCES editions(id),
  tag_id INT NOT NULL REFERENCES tags(id),
  created_by_uuid UUID NOT NULL,
  PRIMARY KEY (edition_id, tag_id)
);

CREATE TABLE authors_tags (
  author_id INT NOT NULL REFERENCES authors(id),
  tag_id INT NOT NULL REFERENCES tags(id),
  created_by_uuid UUID NOT NULL,
  PRIMARY KEY (author_id, tag_id)
);

CREATE TABLE links (
  id SERIAL PRIMARY KEY,
  url VARCHAR(500) NOT NULL,
  title VARCHAR(255),
  language_id INT REFERENCES languages(id),
  created_by_uuid UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE genres_links ADD CONSTRAINT fk_genres_links_link FOREIGN KEY (link_id) REFERENCES links(id);

CREATE TABLE works_links (
  work_id INT NOT NULL REFERENCES works(id),
  link_id INT NOT NULL REFERENCES links(id),
  PRIMARY KEY (work_id, link_id)
);

CREATE TABLE editions_links (
  edition_id INT NOT NULL REFERENCES editions(id),
  link_id INT NOT NULL REFERENCES links(id),
  PRIMARY KEY (edition_id, link_id)
);

CREATE TABLE authors_links (
  author_id INT NOT NULL REFERENCES authors(id),
  link_id INT NOT NULL REFERENCES links(id),
  PRIMARY KEY (author_id, link_id)
);

-- ============================================================
-- Libraries, Shelves, Copies
-- ============================================================

CREATE TABLE libraries (
  id SERIAL PRIMARY KEY,
  owner_uuid UUID,
  name VARCHAR(250) NOT NULL,
  location VARCHAR(250),
  sort_order INT,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shelves (
  id SERIAL PRIMARY KEY,
  library_id INT NOT NULL REFERENCES libraries(id),
  name VARCHAR(255) NOT NULL,
  location VARCHAR(250),
  sort_order INT,
  length_mm INT,
  width_mm INT,
  height_mm INT,
  book_count INT DEFAULT 0,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE copies (
  id SERIAL PRIMARY KEY,
  owner_uuid UUID,
  edition_id INT REFERENCES editions(id),
  shelf_id INT REFERENCES shelves(id),
  barcode BIGINT,
  acquisition_date DATE,
  acquisition_type_id INT REFERENCES acquisition_types(id),
  acquisition_friend_id INT REFERENCES friends(id),
  price DECIMAL(10,2),
  currency VARCHAR(10) REFERENCES currencies(code),
  condition_note VARCHAR(450),
  sort_index INT,
  disposal_date DATE,
  disposal_type_id INT REFERENCES acquisition_types(id),
  disposal_friend_id INT REFERENCES friends(id),
  disposal_note VARCHAR(450),
  disposal_price DECIMAL(10,2),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  status entity_status NOT NULL DEFAULT 'draft',
  source data_source,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Transactions (buy, sell, lend, borrow)
-- ============================================================

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  owner_uuid UUID,
  copy_id INT NOT NULL REFERENCES copies(id),
  type_id INT REFERENCES acquisition_types(id),
  direction INT DEFAULT 1,  -- 1=in, -1=out
  comment VARCHAR(500),
  transaction_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE borrows (
  id SERIAL PRIMARY KEY,
  transaction_id INT NOT NULL REFERENCES transactions(id),
  friend_id INT REFERENCES friends(id),
  due_date DATE,
  returned_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Readings & Bookmarks
-- ============================================================

CREATE TABLE readings (
  id SERIAL PRIMARY KEY,
  owner_uuid UUID,
  owner_membre_id INT REFERENCES membres(id),
  edition_id INT NOT NULL REFERENCES editions(id),
  copy_id INT REFERENCES copies(id),
  friend_id INT REFERENCES friends(id),  -- who recommended
  start_date DATE,
  end_date DATE,
  current_page INT NOT NULL DEFAULT 0,
  finished BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'wishlist', 'finished', 'abandoned')),
  status_changed_at TIMESTAMPTZ,
  rating DECIMAL(4,2),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bookmarks (
  id SERIAL PRIMARY KEY,
  reading_id INT NOT NULL REFERENCES readings(id),
  page INT NOT NULL,
  bookmark_date DATE,
  note TEXT,
  rating DECIMAL(4,2),
  use_rating BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Extracts (citations / passages)
-- ============================================================

CREATE TABLE extracts (
  id SERIAL PRIMARY KEY,
  edition_id INT NOT NULL REFERENCES editions(id),
  owner_uuid UUID,
  page INT,
  content TEXT NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE extract_links (
  id SERIAL PRIMARY KEY,
  extract_a_id INT NOT NULL REFERENCES extracts(id),
  extract_b_id INT NOT NULL REFERENCES extracts(id),
  argument VARCHAR(250),
  comment TEXT,
  comment_language_id INT REFERENCES languages(id),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Quote references (cross-art references in works)
-- ============================================================

CREATE TABLE art_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_ita VARCHAR(50)
);

CREATE TABLE quote_references (
  id SERIAL PRIMARY KEY,
  work_id INT NOT NULL REFERENCES works(id),
  art_type_id INT REFERENCES art_types(id),
  artist VARCHAR(255),
  artwork VARCHAR(255),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  status entity_status NOT NULL DEFAULT 'proposed',
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Sharing tables
-- ============================================================

CREATE TABLE share_libraries (
  library_id INT NOT NULL REFERENCES libraries(id),
  membre_id INT NOT NULL REFERENCES membres(id),
  permission_id INT REFERENCES permissions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (library_id, membre_id)
);

CREATE TABLE sharing_membre_author (
  author_id INT NOT NULL REFERENCES authors(id),
  membre_id INT NOT NULL REFERENCES membres(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (author_id, membre_id)
);

CREATE TABLE sharing_membre_edition (
  edition_id INT NOT NULL REFERENCES editions(id),
  membre_id INT NOT NULL REFERENCES membres(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (edition_id, membre_id)
);

CREATE TABLE sharing_membre_publisher (
  publisher_id INT NOT NULL REFERENCES publishers(id),
  membre_id INT NOT NULL REFERENCES membres(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (publisher_id, membre_id)
);

CREATE TABLE sharing_membre_serie (
  serie_id INT NOT NULL REFERENCES series(id),
  membre_id INT NOT NULL REFERENCES membres(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (serie_id, membre_id)
);

CREATE TABLE sharing_membre_work (
  work_id INT NOT NULL REFERENCES works(id),
  membre_id INT NOT NULL REFERENCES membres(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (work_id, membre_id)
);

-- ============================================================
-- Messages
-- ============================================================

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  sender_id INT NOT NULL REFERENCES membres(id),
  recipient_id INT NOT NULL REFERENCES membres(id),
  subject VARCHAR(500),
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  sender_visible BOOLEAN NOT NULL DEFAULT true,
  recipient_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Arguments (legacy thematic grouping)
-- ============================================================

CREATE TABLE arguments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(250),
  description TEXT
);

CREATE TABLE argument_translations (
  argument_id INT NOT NULL REFERENCES arguments(id),
  language_id INT NOT NULL REFERENCES languages(id),
  name VARCHAR(250) NOT NULL,
  description TEXT,
  PRIMARY KEY (argument_id, language_id)
);

-- ============================================================
-- Periods (historical periods)
-- ============================================================

CREATE TABLE periods (
  id VARCHAR(15) PRIMARY KEY,
  start_date DATE,
  end_date DATE,
  duration INT,
  name_ita VARCHAR(50),
  name_eng VARCHAR(50)
);

-- ============================================================
-- Global / user settings (legacy)
-- ============================================================

CREATE TABLE global_settings (
  key VARCHAR(25) NOT NULL,
  language_id INT NOT NULL REFERENCES languages(id),
  value TEXT,
  PRIMARY KEY (key, language_id)
);

CREATE TABLE user_settings (
  membre_id INT NOT NULL REFERENCES membres(id),
  key VARCHAR(25) NOT NULL,
  language_id INT NOT NULL REFERENCES languages(id),
  value TEXT,
  PRIMARY KEY (membre_id, key, language_id)
);

-- ============================================================
-- Copy enrichment jobs (our addition)
-- ============================================================

CREATE TABLE copy_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_id INT REFERENCES copies(id),
  owner_uuid UUID,
  image_url TEXT,
  isbn VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_editions_isbn13 ON editions (isbn13);
CREATE INDEX IF NOT EXISTS idx_editions_isbn10 ON editions (isbn10);
CREATE INDEX IF NOT EXISTS idx_editions_title ON editions (title);
CREATE INDEX IF NOT EXISTS idx_editions_authors_gin ON editions USING GIN (authors);
CREATE INDEX IF NOT EXISTS idx_editions_source_data_gin ON editions USING GIN (source_data);
CREATE INDEX IF NOT EXISTS idx_editions_search_vector ON editions USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_authors_family_name ON authors (family_name);
CREATE INDEX IF NOT EXISTS idx_authors_given_name ON authors (given_name);
CREATE INDEX IF NOT EXISTS idx_works_title ON works (original_title);
CREATE INDEX IF NOT EXISTS idx_copies_owner ON copies (owner_uuid);
CREATE INDEX IF NOT EXISTS idx_readings_owner ON readings (owner_uuid);
CREATE INDEX IF NOT EXISTS idx_readings_owner_membre ON readings (owner_membre_id);
CREATE INDEX IF NOT EXISTS idx_readings_edition ON readings (edition_id);

-- ============================================================
-- Full-text search: function to rebuild edition search_vector
-- ============================================================
-- Combines: edition title, subtitle, hybrid authors array,
--           relational authors (via editions_works → works_authors → authors
--           and editions_authors → authors), publisher name, ISBN, series name.

CREATE OR REPLACE FUNCTION edition_search_vector(eid INT) RETURNS TSVECTOR AS $$
DECLARE
  vec TSVECTOR;
BEGIN
  SELECT
    setweight(to_tsvector('simple', coalesce(e.title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(e.subtitle, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(array_to_string(e.authors, ' '), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(
        (SELECT string_agg(a.given_name || ' ' || a.family_name, ' ')
         FROM editions_works ew
         JOIN works_authors wa ON wa.work_id = ew.work_id
         JOIN authors a ON a.id = wa.author_id
         WHERE ew.edition_id = e.id AND wa.role IN ('author','co_author')), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(
        (SELECT string_agg(a.given_name || ' ' || a.family_name, ' ')
         FROM editions_authors ea
         JOIN authors a ON a.id = ea.author_id
         WHERE ea.edition_id = e.id), '')), 'B')
    || setweight(to_tsvector('simple', coalesce(p.name, '')), 'C')
    || setweight(to_tsvector('simple', coalesce(s.name, '')), 'D')
    || to_tsvector('simple', coalesce(e.isbn13, '') || ' ' || coalesce(e.isbn10, ''))
  INTO vec
  FROM editions e
  LEFT JOIN publishers p ON p.id = e.publisher_id
  LEFT JOIN series s ON s.id = e.series_id
  WHERE e.id = eid;

  RETURN vec;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger function: refreshes search_vector on edition INSERT/UPDATE
-- Uses NEW fields for local data; relational data comes from existing rows
-- (will be empty on first INSERT, then refreshed by edition_works/edition_authors triggers)
CREATE OR REPLACE FUNCTION trg_edition_search_vector() RETURNS TRIGGER AS $$
DECLARE
  rel_authors TEXT;
  edi_authors TEXT;
  pub_name TEXT;
  ser_name TEXT;
BEGIN
  -- Relational authors via editions_works (only available on UPDATE or after initial insert)
  SELECT string_agg(a.given_name || ' ' || a.family_name, ' ')
  INTO rel_authors
  FROM editions_works ew
  JOIN works_authors wa ON wa.work_id = ew.work_id
  JOIN authors a ON a.id = wa.author_id
  WHERE ew.edition_id = NEW.id AND wa.role IN ('author','co_author');

  -- Edition-level contributors
  SELECT string_agg(a.given_name || ' ' || a.family_name, ' ')
  INTO edi_authors
  FROM editions_authors ea
  JOIN authors a ON a.id = ea.author_id
  WHERE ea.edition_id = NEW.id;

  -- Publisher name
  SELECT p.name INTO pub_name FROM publishers p WHERE p.id = NEW.publisher_id;

  -- Series name
  SELECT s.name INTO ser_name FROM series s WHERE s.id = NEW.series_id;

  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(NEW.subtitle, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(array_to_string(NEW.authors, ' '), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(rel_authors, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(edi_authors, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(pub_name, '')), 'C')
    || setweight(to_tsvector('simple', coalesce(ser_name, '')), 'D')
    || to_tsvector('simple', coalesce(NEW.isbn13, '') || ' ' || coalesce(NEW.isbn10, ''));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_editions_search_vector
  BEFORE INSERT OR UPDATE ON editions
  FOR EACH ROW
  EXECUTE FUNCTION trg_edition_search_vector();

-- Helper: refresh search_vector for a specific edition (call after changing related tables)
CREATE OR REPLACE FUNCTION refresh_edition_search(eid INT) RETURNS VOID AS $$
BEGIN
  UPDATE editions SET updated_at = NOW() WHERE id = eid;
END;
$$ LANGUAGE plpgsql;

-- Trigger on editions_works: refresh edition search_vector when work link changes
CREATE OR REPLACE FUNCTION trg_ew_refresh_search() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE editions SET updated_at = NOW() WHERE id = OLD.edition_id;
    RETURN OLD;
  ELSE
    UPDATE editions SET updated_at = NOW() WHERE id = NEW.edition_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_editions_works_search
  AFTER INSERT OR UPDATE OR DELETE ON editions_works
  FOR EACH ROW
  EXECUTE FUNCTION trg_ew_refresh_search();

-- Trigger on editions_authors: refresh edition search_vector when author link changes
CREATE TRIGGER trg_editions_authors_search
  AFTER INSERT OR UPDATE OR DELETE ON editions_authors
  FOR EACH ROW
  EXECUTE FUNCTION trg_ew_refresh_search();
