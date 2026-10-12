-- Per-store banner typography and actual glass translucency.
-- Existing stores keep their art and text; safe defaults apply to everyone.
alter table public.shop_settings
  add column if not exists hero_title_font_size integer not null default 27,
  add column if not exists hero_subtitle_font_size integer not null default 15,
  add column if not exists hero_glass_tint_percent integer not null default 25;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='shop_settings_hero_title_font_size_range') then
    alter table public.shop_settings add constraint shop_settings_hero_title_font_size_range
      check (hero_title_font_size between 18 and 42);
  end if;
  if not exists (select 1 from pg_constraint where conname='shop_settings_hero_subtitle_font_size_range') then
    alter table public.shop_settings add constraint shop_settings_hero_subtitle_font_size_range
      check (hero_subtitle_font_size between 12 and 22);
  end if;
  if not exists (select 1 from pg_constraint where conname='shop_settings_hero_glass_tint_percent_range') then
    alter table public.shop_settings add constraint shop_settings_hero_glass_tint_percent_range
      check (hero_glass_tint_percent between 8 and 50);
  end if;
end $$;
