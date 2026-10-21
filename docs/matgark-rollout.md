# Matgark rollout audit — 2026-10-21

## Implemented in this change

- Platform screens, signup, login and neutral metadata use Matgark — متجرك. Merchant names and database records are untouched.
- `/s/:slug`, `/s/:slug/cart`, `/s/:slug/checkout`, `/s/:slug/admin`, and tracking routes use explicit tenant context. Path context wins over `?store=`. Existing root and query URLs remain supported without redirects.
- Tenant navigation, owner invitation links and signup completion generate path URLs. Pages domains use paths, not unsupported nested Pages subdomains.
- Cart, favorites, recent orders, success payloads, visit markers and pending staff invitation storage are isolated for explicit stores. Existing unscoped root data and auth session storage keys are retained. Stale preview storage can no longer silently change the root store.
- Email confirmation redirects keep the current store's admin path. No OAuth provider flow has been added.
- Unknown explicit slugs are rejected if the backend silently returns a different default store.

## Verified live, before any deployment

- Repository main: `cecaee45de77c8b336b23d712c3f7db68a3f4815`, unprotected. CI checks types/build and separate browser/visual workflows.
- `https://fakahany-store.pages.dev/` returned HTTP 200. Its asset points at `tjytgtabzhtwmxvgaejk.supabase.co`.
- Supabase is ACTIVE_HEALTHY. All public tables have RLS enabled. Inspected order/product/staff policies use store ownership/permissions for private operations. This is a limited audit, not proof from a two-user authorization exercise.
- The specified database currently has exactly ONE store: `demo-market` / `سوق التجربة | عرض المنصة`. Its default store id is `a50d0fc2-91d5-4ee2-9037-45066c172a85`. There are NO `fakahany` or `home` rows. Do not create aliases or rename it assuming it is the missing merchant's data.
- The live resolver currently returns that default store even for nonexistent explicit `fakahany` and `home` slugs. The frontend guard in this change prevents displaying a different merchant under an invalid path.
- Public Auth settings report email enabled; every external OAuth provider disabled. Code contains no signInWithOAuth flow. Auth management allowlists are NOT exposed by the available connector and were not verified.
- Cloudflare CLI authentication is expired. There is no authenticated Cloudflare browser session available. Project/source integration, build environment, deployments and domain availability cannot be inspected with current access.
- `matgark.pages.dev` failed DNS resolution. This does NOT prove name availability or reserve it.
- Repository `_redirects` retains `/* /index.html 200` for SPA deep links. Actual Cloudflare routing/settings still need authenticated verification.

## Required before production rollout

1. Restore Cloudflare authentication. Inspect existing `fakahany-store` project, production branch, build command/output, environment and deployment commit. Preserve the project and old domain. Confirm where the original Fakahany store/data currently are before claiming continuity for that merchant.
2. Check/create a SEPARATE Pages project named `matgark` only if available, keeping `fakahany-store`. Confirm the assigned pages.dev hostname from Cloudflare itself. Copy the verified build settings and public Supabase variables, never service-role credentials. Do not set platform base_domain or advertise a hostname until it is deployed and tested.
3. Supabase Dashboard → Authentication → URL Configuration: inspect and preserve the current Site URL and all existing redirect entries. Add only verified production origins/paths. Required email callbacks include `/signup?complete=1`, `/admin`, and store-scoped `/s/<actual-slug>/admin` (plus legacy query callbacks). Use documented scoped path patterns only if needed; do not allow every pages.dev project. Test real email confirmation/resend with authorized accounts on each origin.
4. If OAuth providers are enabled later, keep their Supabase callback `https://tjytgtabzhtwmxvgaejk.supabase.co/auth/v1/callback`; inspect each provider's origin/callback configuration and test return paths. Current providers are disabled.
5. Verify `/s/demo-market` and a second real store, private admin denial with two different users, order submission/tracking, browser storage isolation and direct deep-link reload. `/s/fakahany` and `/s/home` are supported route shapes, not provisioned stores.
6. Deploy/verify a preview before production. Verify both old/new origins, service worker update, HTTPS, SPA fallback, email auth and merchant-specific titles. Keep sessions per origin; changing branding does not transfer browser sessions across domains. No forced redirect is part of this change.

No database writes, merchant renames, domain reservation, production deployment, auth allowlist changes or redirects were performed.

References: https://supabase.com/docs/guides/auth/redirect-urls and https://developers.cloudflare.com/pages/configuration/redirects/
