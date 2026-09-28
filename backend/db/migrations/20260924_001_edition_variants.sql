BEGIN;

-- Default physical characteristics provided by a series. Values left NULL on
-- a variant are inherited from these fields.
ALTER TABLE series
  ADD COLUMN IF NOT EXISTS default_binding_id INT REFERENCES bindings(id),
  ADD COLUMN IF NOT EXISTS default_height_mm INT,
  ADD COLUMN IF NOT EXISTS default_width_mm INT,
  ADD COLUMN IF NOT EXISTS default_color_id INT REFERENCES colors(id),
  ADD COLUMN IF NOT EXISTS default_format_note VARCHAR(250);

-- A variant is a physical presentation of an edition: cover, binding,
-- pagination, printing and other characteristics shared by equivalent copies.
CREATE TABLE IF NOT EXISTS edition_variants (
  id SERIAL PRIMARY KEY,
  edition_id INT NOT NULL REFERENCES editions(id),
  label VARCHAR(255) NOT NULL DEFAULT 'Variante principale',
  printing_year INT,
  printing_number VARCHAR(50),
  series_id INT REFERENCES series(id),
  series_number INT,
  pages INT,
  binding_id INT REFERENCES bindings(id),
  height_mm INT,
  width_mm INT,
  thickness_mm INT,
  weight_g INT,
  color_id INT REFERENCES colors(id),
  format_note VARCHAR(250),
  notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status entity_status NOT NULL DEFAULT 'proposed',
  source data_source,
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, edition_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_edition_variants_default
  ON edition_variants (edition_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_edition_variants_edition
  ON edition_variants (edition_id);

CREATE INDEX IF NOT EXISTS idx_edition_variants_series
  ON edition_variants (series_id);

-- Role-aware images attached to a physical variant.
CREATE TABLE IF NOT EXISTS edition_variant_images (
  id SERIAL PRIMARY KEY,
  edition_variant_id INT NOT NULL REFERENCES edition_variants(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('front', 'back', 'spine', 'copyright', 'other')),
  url TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source data_source,
  created_by_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edition_variant_images_variant
  ON edition_variant_images (edition_variant_id, kind, position);

ALTER TABLE copies
  ADD COLUMN IF NOT EXISTS edition_variant_id INT;

ALTER TABLE copies
  ADD CONSTRAINT fk_copies_variant_edition
  FOREIGN KEY (edition_variant_id, edition_id)
  REFERENCES edition_variants (id, edition_id);

CREATE INDEX IF NOT EXISTS idx_copies_variant
  ON copies (edition_variant_id);

ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS edition_variant_id INT;

ALTER TABLE readings
  ADD CONSTRAINT fk_readings_variant_edition
  FOREIGN KEY (edition_variant_id, edition_id)
  REFERENCES edition_variants (id, edition_id);

CREATE INDEX IF NOT EXISTS idx_readings_variant
  ON readings (edition_variant_id);

-- A wishlist entry is an intention to read a work. It is deliberately separate
-- from readings and does not require an identified edition or physical copy.
CREATE TABLE IF NOT EXISTS wishlist_items (
  id SERIAL PRIMARY KEY,
  owner_uuid UUID NOT NULL,
  work_id INT REFERENCES works(id),
  title VARCHAR(255),
  author VARCHAR(255),
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fulfilled', 'abandoned')),
  fulfilled_reading_id INT REFERENCES readings(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_owner
  ON wishlist_items (owner_uuid, status);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_work
  ON wishlist_items (work_id);

COMMIT;
