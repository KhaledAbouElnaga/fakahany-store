-- Preserve complete imported source galleries (largest verified source: 54).
alter table public.products drop constraint if exists products_image_gallery_limit;
alter table public.products add constraint products_image_gallery_limit
  check (coalesce(cardinality(image_urls),0) <= 60);
