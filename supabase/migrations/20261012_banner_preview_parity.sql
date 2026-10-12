-- Independent per-store image display rules; all existing covers show in full by default.
-- Does not touch any current images, hero copy design, products, orders or backups.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS banner_display jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.shop_settings.banner_display IS
  'Image fit (full, contain, cover), aspect ratio and crop focus for the shared storefront/merchant banner renderer';
