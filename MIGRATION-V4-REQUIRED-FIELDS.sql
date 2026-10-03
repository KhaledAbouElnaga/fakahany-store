-- V4: configurable required checkout fields.
-- Run once in Supabase SQL Editor.

alter table public.shop_settings
  add column if not exists require_name boolean not null default true,
  add column if not exists require_phone boolean not null default true,
  add column if not exists require_address boolean not null default true,
  add column if not exists require_area boolean not null default true,
  add column if not exists require_notes boolean not null default false;

update public.shop_settings
set
  require_name = coalesce(require_name, true),
  require_phone = coalesce(require_phone, true),
  require_address = coalesce(require_address, true),
  require_area = coalesce(require_area, true),
  require_notes = coalesce(require_notes, false)
where id = 'main';
