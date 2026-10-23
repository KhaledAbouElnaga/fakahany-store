# Ibrahim homeware import — 2026-10-23

Store: `ibrahim-homeware`, UUID `e3ff3eff-5b1b-4314-bbe9-94c30af0922b`.
Target: https://matgark.pages.dev/s/ibrahim-homeware

## Source and identity

- Facebook: https://www.facebook.com/profile.php?id=100063651146935
- Verified page name: إبراهيم للأواني المنزلية. Published city: Tébessa, Algeria. Published business phone: +213 551 41 55 92.
- Page cover downloaded from the visible profile cover image; committed at `public/stores/ibrahim-homeware/cover.jpg`. No generated logo or identity.
- Drive: https://drive.google.com/drive/folders/1g537Lv6GgYc2FE6OfwmfIkrKgtIEXekF
- Enumerated all 540 numbered source folders. Numbers 1 through 540 occur exactly once. No empty folders, listing failures or non-image files.

## Chronology and grouping

**1 is newest and must be first, followed by 2, 3, ... 540.** Parse the folder's numeric suffix; never use Drive order, lexicographic order or modification timestamps. The numeric source number is persisted as `products.display_order`. Default frontend sorting already sorts that field ascending.

540 source records were imported. A source folder is not assumed to be one saleable product: 310 folders contain multiple images, and the largest contains 54. Records 4–540 remain hidden drafts pending human review of product boundaries, names, specifications and prices. The first three single-image sources were visually inspected and published for price/availability inquiry only. They have no sale options, no invented price, no stock claim and no checkout action.

## Media verification

- Original images: 1,745, successfully downloaded and uploaded (287,212,959 bytes).
- SHA-256 exact duplicate groups: 135; redundant copies across the entire source: 150; unique byte hashes: 1,595.
- Removed 24 repeated image references within the same folder from galleries. All 1,745 original files remain in storage. Retained cross-folder repeats because an identical image does not prove identical product, offer or post.
- Gallery references after within-folder deduplication: 1,721. Source image filenames are sorted numerically within each folder. Folder order is independently numeric.
- Storage prefix: `store-images/e3ff3eff-5b1b-4314-bbe9-94c30af0922b/drive-20261023/`. Object filenames retain Drive file IDs.
- SQL cross-check: zero gallery references lacking a corresponding storage object.
- Raised the gallery cap from 10 to 60 in validation and database constraint so complete source sets remain editable.
- Temporary import function accepted only an allowlist of source IDs, a per-run random capability, JPEG payloads below 10 MB, and one fixed tenant destination. After 1,745 successful uploads it was replaced by a closed endpoint with JWT verification restored. No service-role key was exported or stored in client code.

## Tenant and deployment scope

The specified Supabase database initially contained only `demo-market` (14 products), not an identified Fakahany merchant row. Its data and default store ID were preserved. No `fakahany` alias or merchant rename was invented. The existing Cloudflare `fakahany-store` project production deployment is not part of this rollout.

Cloudflare access is authenticated. Both `matgark` and `fakahany-store` already exist and used repository commit `8982581` before this change. Matgark branding and store-scoped paths were already deployed. The checked-in prior rollout note describes an older access state; it is not evidence of the current state.

Only Matgark receives the new manual deployment. Code is kept on a separate branch/PR so merging cannot unexpectedly deploy the shared production source to Fakahany. The new tenant uses the internal `business` catalog tier to accommodate 540 records (basic caps at 100 and pro at 500), with trial status. No purchase, payment, external subscription or billing modification was executed. This does not promise indefinite free hosting or bypass provider quotas.

## Verification and remaining work

- Type check and production build passed; existing middleware tests passed (3).
- Browser checks cover numeric 1/2/3/10 order, price inquiry without zero-price checkout, full gallery compatibility, store-scoped routes and browser-cart separation.
- Live SQL confirmed exactly 540 distinct display positions, 3 visible entries, 537 hidden drafts, 1,721 gallery references, 1,745 objects and no missing referenced objects.
- Public reads should expose only 3 products; private drafts require existing authorized staff access. No row-level policies were relaxed.
- A two-account owner/staff authorization exercise and email confirmation round-trip are still untested. Owner assignment awaits the user's intended email. Do not guess an owner or send invitations.
- 537 draft source groups still require visual product identification/splitting before publication. No prices or inventory were inferred from ambiguous stickers or product images.
- Existing Supabase advisories include callable SECURITY DEFINER functions and disabled leaked-password protection. This limited change did not rewrite unrelated authorization functions; it is not a comprehensive security certification.
