-- Nullable so pre-gallery backups restored with jsonb_populate_recordset remain valid.
-- Existing image_url remains the cover and is never rewritten by this migration.
alter table public.products add column if not exists image_urls text[] default '{}';
alter table public.products add constraint products_image_gallery_limit
  check (coalesce(cardinality(image_urls),0) <= 10);
