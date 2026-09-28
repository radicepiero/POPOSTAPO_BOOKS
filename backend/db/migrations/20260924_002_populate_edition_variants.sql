BEGIN;

-- 1. Every existing edition receives one default physical variant. Edition
-- status/source and the earliest known edition creator are preserved.
INSERT INTO edition_variants (
  edition_id,
  label,
  printing_year,
  series_id,
  series_number,
  pages,
  binding_id,
  height_mm,
  width_mm,
  thickness_mm,
  weight_g,
  color_id,
  is_default,
  status,
  source,
  created_by_uuid
)
SELECT
  e.id,
  'Variante principale',
  e.publishing_year,
  e.series_id,
  e.series_number,
  e.pages,
  e.binding_id,
  e.height_mm,
  e.width_mm,
  e.thickness_mm,
  e.weight_g,
  e.color_id,
  true,
  e.status,
  e.source,
  creator.uuid
FROM editions e
LEFT JOIN LATERAL (
  SELECT m.uuid
  FROM sharing_membre_edition sme
  JOIN membres m ON m.id = sme.membre_id
  WHERE sme.edition_id = e.id
  ORDER BY sme.created_at, sme.membre_id
  LIMIT 1
) creator ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM edition_variants ev
  WHERE ev.edition_id = e.id AND ev.is_default
);

-- 2a. Role-aware image metadata already present in source_data.
WITH role_images AS (
  SELECT
    ev.id AS variant_id,
    CASE
      WHEN lower(image.key) = 'front cover' THEN 'front'
      WHEN lower(image.key) = 'back cover' THEN 'back'
      WHEN lower(image.key) = 'spine' THEN 'spine'
      WHEN lower(image.key) LIKE 'copyright%' THEN 'copyright'
      ELSE 'other'
    END AS kind,
    image.value AS url,
    row_number() OVER (
      PARTITION BY ev.id,
      CASE
        WHEN lower(image.key) = 'front cover' THEN 'front'
        WHEN lower(image.key) = 'back cover' THEN 'back'
        WHEN lower(image.key) = 'spine' THEN 'spine'
        WHEN lower(image.key) LIKE 'copyright%' THEN 'copyright'
        ELSE 'other'
      END
      ORDER BY image.key
    ) - 1 AS position,
    e.source,
    ev.created_by_uuid
  FROM editions e
  JOIN edition_variants ev ON ev.edition_id = e.id AND ev.is_default
  CROSS JOIN LATERAL jsonb_each_text(e.source_data -> 'images') AS image(key, value)
  WHERE e.source_data ? 'images'
)
INSERT INTO edition_variant_images (
  edition_variant_id,
  kind,
  url,
  position,
  is_primary,
  source,
  created_by_uuid
)
SELECT
  variant_id,
  kind,
  url,
  position,
  kind = 'front',
  source,
  created_by_uuid
FROM role_images
WHERE url IS NOT NULL AND btrim(url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM edition_variant_images evi
    WHERE evi.edition_variant_id = role_images.variant_id
      AND evi.url = role_images.url
  );

-- 2b. Covers without role metadata: the first image is considered the front;
-- any additional image is preserved as 'other' rather than being discarded.
WITH cover_images AS (
  SELECT
    ev.id AS variant_id,
    cover.url,
    cover.ordinality - 1 AS position,
    e.source,
    ev.created_by_uuid,
    EXISTS (
      SELECT 1
      FROM edition_variant_images evi
      WHERE evi.edition_variant_id = ev.id AND evi.kind = 'front'
    ) AS has_front
  FROM editions e
  JOIN edition_variants ev ON ev.edition_id = e.id AND ev.is_default
  CROSS JOIN LATERAL unnest(COALESCE(e.covers, '{}')) WITH ORDINALITY AS cover(url, ordinality)
)
INSERT INTO edition_variant_images (
  edition_variant_id,
  kind,
  url,
  position,
  is_primary,
  source,
  created_by_uuid
)
SELECT
  variant_id,
  CASE WHEN NOT has_front AND position = 0 THEN 'front' ELSE 'other' END,
  url,
  position,
  NOT has_front AND position = 0,
  source,
  created_by_uuid
FROM cover_images
WHERE url IS NOT NULL AND btrim(url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM edition_variant_images evi
    WHERE evi.edition_variant_id = cover_images.variant_id
      AND evi.url = cover_images.url
  );

-- 3. Existing copies point to the default variant of their edition.
UPDATE copies c
SET edition_variant_id = ev.id,
    updated_at = NOW()
FROM edition_variants ev
WHERE c.edition_id = ev.edition_id
  AND ev.is_default
  AND c.edition_variant_id IS NULL;

-- 4. Readings linked to a copy inherit that copy's variant.
UPDATE readings r
SET edition_variant_id = c.edition_variant_id
FROM copies c
WHERE r.copy_id = c.id
  AND r.edition_id = c.edition_id
  AND c.edition_variant_id IS NOT NULL
  AND r.edition_variant_id IS NULL;

-- Readings without a concrete copy use the default variant when available.
UPDATE readings r
SET edition_variant_id = ev.id
FROM edition_variants ev
WHERE r.edition_id = ev.edition_id
  AND ev.is_default
  AND r.edition_variant_id IS NULL;

-- 5. Existing wishlist rows become independent intentions to read. The work
-- is linked when the edition has one; otherwise title/authors are preserved.
INSERT INTO wishlist_items (
  owner_uuid,
  work_id,
  title,
  author,
  note,
  status,
  fulfilled_reading_id,
  created_at,
  updated_at
)
SELECT
  COALESCE(r.owner_uuid, m.uuid),
  ew.work_id,
  e.title,
  COALESCE(NULLIF(array_to_string(e.authors, ', '), ''), work_authors.names),
  NULL,
  'active',
  NULL,
  r.created_at,
  NOW()
FROM readings r
JOIN editions e ON e.id = r.edition_id
LEFT JOIN membres m ON m.id = r.owner_membre_id
LEFT JOIN editions_works ew ON ew.edition_id = e.id AND ew.position = 0
LEFT JOIN LATERAL (
  SELECT string_agg(trim(concat_ws(' ', a.given_name, a.family_name)), ', ' ORDER BY wa.role, a.family_name, a.given_name) AS names
  FROM works_authors wa
  JOIN authors a ON a.id = wa.author_id
  WHERE wa.work_id = ew.work_id
) work_authors ON true
WHERE r.status = 'wishlist'
  AND COALESCE(r.owner_uuid, m.uuid) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM wishlist_items wi
    WHERE wi.owner_uuid = COALESCE(r.owner_uuid, m.uuid)
      AND wi.work_id IS NOT DISTINCT FROM ew.work_id
      AND wi.title IS NOT DISTINCT FROM e.title
      AND wi.status = 'active'
  );

DELETE FROM readings
WHERE status = 'wishlist';

COMMIT;
