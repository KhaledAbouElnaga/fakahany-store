-- Add a single extensible, per-store design object for the title panel below the banner.
-- Defaults preserve the existing white panel on all current stores.
-- No existing order, product, image or subscription data is modified.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS hero_copy_style jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.shop_settings.hero_copy_style IS
  'Merchant-controlled appearance of the text panel displayed below the banner';
