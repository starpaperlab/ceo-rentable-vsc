# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

CEO Rentable OS™ is a SaaS finance/operations platform (React 18 + Vite + Supabase + PayPal) aimed at LATAM
entrepreneurs. The UI is in Spanish. It manages billing/invoicing, inventory, clients, monthly financial control,
profitability analysis, agenda, email campaigns, and an admin panel — all backed by Supabase Postgres with RLS.

## Commands

```bash
npm run dev              # Vite dev server on :5173 (also mounts local /api/* handlers, see below)
npm run build             # production build
npm run preview           # preview production build
npm run lint               # eslint . --quiet
npm run lint:fix           # eslint . --fix
npm run typecheck         # tsc -p ./jsconfig.json (checkJs is off; mainly validates JSX/paths)
npm run deploy:check      # lint + build (used as pre-flight for deploys)
npm run deploy:main -- "commit message"        # validate, commit (git add -A), push to main (triggers Vercel)
npm run deploy:main:fast -- "commit message"   # same but skips lint/build
```

There is no test runner configured in this repo — `deploy:check` (lint + build) is the correctness gate.

ESLint only targets `src/components/**`, `src/pages/**`, and `src/Layout.jsx` (see `eslint.config.js`); `src/lib/**`
and `src/components/ui/**` are excluded. `jsconfig.json` similarly only type-checks `src/components/**/*.js`,
`src/pages/**/*.jsx`, and `src/Layout.jsx`.

## Architecture

### Routing / page registration

- `src/pages.config.js` is the auto-registered page map (`PAGES` object + `mainPage`). New top-level pages added
  under `src/pages/` should follow this registration pattern; the comment header in that file explains the
  convention. `mainPage` is currently `"Dashboard"`.
- `src/App.jsx` builds routes from `pages.config.js`. Every registered page is wrapped in `AccessGuard` (and gets
  both a canonical `/PageName` and a lowercase `/pagename` route). `AdminPanel` additionally goes through
  `AdminRouteGuard`. Public/unauthenticated routes (`/login`, `/register`, `/acceso`, `/paywall`,
  `/payment-success`, `/payment-cancel`, etc.) are declared explicitly above the guarded block.
- `src/Layout.jsx` is the shared shell (sidebar/nav) wrapped around every guarded page.
- Path alias `@/*` → `src/*` (configured in `vite.config.js` and `jsconfig.json`).

### Auth, access control & multi-tenancy

- `src/lib/AuthContext.jsx` + `src/hooks/useAuth.js` (large file) own Supabase session state, user profile loading,
  invitation/recovery URL handling, and admin-email fallback logic.
- `src/components/shared/AccessGuard.jsx` + `src/hooks/useAccessGuard.js` gate every page on `hasAccess`
  (subscription/plan status); unpaid users see `Paywall` instead of the page.
- `src/components/shared/AdminRouteGuard.jsx` further restricts admin-only routes via `useAuth().isAdmin()`.
- `src/hooks/useFeatureGate.js` maps `user.plan` (`admin`, `subscription`, `monthly`, `founder`,
  `founder_lifetime`) to feature flags (e.g. `luna`, `automatizaciones`, `nuevas_funciones`), with manual
  per-user `features` overrides taking precedence and `admin`/`role==='admin'` always passing.

**Critical: row ownership.** This app is multi-tenant on shared tables (`user_id` / `created_by` columns) protected
by Supabase RLS. `src/lib/supabaseOwnership.js` is the central helper layer:
- `fetchOwnedRows({ table, ownerId, ownerEmail, adminMode, ... })` — reads scoped to the current user; it
  deliberately returns `[]` rather than ever falling back to an unscoped `select *` for non-admins (see
  `AUDITORIA_MULTIUSUARIO_2026-04-17.md` — there was a real cross-tenant data leak from an unscoped fallback).
- `withOwner(payload, { ownerId, ownerEmail })` — stamps `user_id`/`created_by` on inserts.
- `updateOwnedRowById` / `deleteOwnedRowById` — scoped mutations that filter by owner unless `adminMode`.

When adding new data access for user-owned tables, use these helpers rather than calling `supabase.from(...)`
directly — bypassing them re-introduces the cross-tenant leak class described above.

### Supabase

- Client: `src/lib/supabase.js` (anon key, persisted session under `ceo-rentable-os-auth`).
- Config/env validation: `src/config/env.js` — throws early if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are
  missing; also centralizes Stripe (legacy, disabled by default), PayPal, Resend, Gemini, Meta Pixel, and brand
  color config (`ENV_CONFIG`).
- `supabase/migrations/*.sql` — dated, additive migrations (`YYYYMMDD_description.sql`); apply manually via the
  Supabase SQL editor or CLI. `supabase/sql/*.sql` holds larger one-off setup/hardening/audit scripts (admin panel
  setup, RLS hardening, multi-tenant isolation hotfix, schema repair).
- `supabase/functions/handle-stripe-webhook/` — Deno edge function (legacy Stripe path).

### Payments

- **PayPal is the active/primary payment rail** (Stripe is legacy and disabled by default via
  `STRIPE_LEGACY_ENABLED=false`, kept only for historical data).
- Vercel serverless entry points live in `api/` (e.g. `api/paypal/create-order.js`, `capture-order.js`,
  `webhook.js`, `api/stripe/create-session.js`) and are thin wrappers that parse the request and delegate to the
  real handler logic in `server/` (`server/paypalHandler.js`, `server/paypalWebhookHandler.js`,
  `server/createStripeCheckoutSessionHandler.js`).
- `src/lib/paypalService.js` / `src/lib/pendingCheckout.js` drive the frontend checkout flow; `Paywall.jsx` and
  `PaymentSuccess.jsx` / `PaymentCancel.jsx` are the relevant pages.

### Local dev API server

`vite.config.js` registers a custom Vite middleware (`devEmailApiPlugin`) so that in `npm run dev`,
`POST /api/send-email`, `/api/accept-invitation`, and `/api/activate-invitation` are handled locally by
`server/sendEmailHandler.js`, `server/acceptInvitationHandler.js`, `server/activateInvitationHandler.js` — mirroring
what the equivalent files under `api/` do in production on Vercel. If you add a new server-side endpoint, you
generally need both: a handler in `server/`, a thin `api/<route>.js` wrapper for Vercel, and (if needed locally) a
route registered in this dev plugin.

### Email

- `src/lib/emailService.js` (client helper) + `src/services/emailService.js` (admin/templating service) +
  `server/sendEmailHandler.js` (Resend integration) + `src/components/email/*` (campaign composer, GrapesJS-based
  template editor `GrapesEditor.jsx`, broadcast modal). `EmailLogs.jsx` / `EmailTemplates.jsx` are admin pages under
  `/admin/emails` and `/admin/email-templates`.

### Billing documents (quotes/invoices) & PDFs

- `src/components/billing/DocumentForm.jsx` is the large form for creating quotes/invoices, with
  `LineItemsTable.jsx`, `ProductAutocomplete.jsx`, `QuickCreateProductModal.jsx`, `AdditionalChargesEditor.jsx`,
  `TotalsPanel.jsx`, and `PreviewModal.jsx` as supporting pieces.
- `src/lib/documentPdf.js` + `src/lib/documentBranding.js` + `src/lib/visualAttachments.js` generate branded PDFs
  (jsPDF) using per-business branding profiles (`src/lib/brandProfiles.js`,
  `src/components/admin/BrandProfilesManager.jsx`).
- `src/lib/productTypes.js` defines product/category types shared between Products, Inventory, and billing
  components.

### Autosave / draft recovery

- `src/hooks/useAutosave.js` + `src/lib/autosaveQueue.js` (debounced timer queue) + `src/lib/autosaveStorage.js`
  (localStorage drafts, scoped by `module`/`userId`/`recordId`) implement local + remote (Supabase) autosave with
  conflict/error handling. `src/hooks/useDraftRecovery.js` and
  `src/components/shared/DraftRecoveryDialog.jsx`/`AutosaveStatus.jsx` surface recovery UI. This pattern is used by
  `DocumentForm` and the email campaign composer.

### Tracking

- `src/lib/metaPixel.js` + `src/components/tracking/MetaPixelRouteTracker.jsx` handle Meta Pixel route/funnel
  tracking (PayPal funnel events specifically — see recent commit history for event alignment).

### UI conventions

- shadcn/ui ("new-york" style) components live in `src/components/ui/` — generally treat these as
  vendor/generated and avoid hand-editing unless necessary (excluded from lint/typecheck).
- `cn()` helper in `src/lib/utils.js` (clsx + tailwind-merge) is the standard way to compose Tailwind classes.
- Feature components are organized by domain under `src/components/{billing,inventory,clients,dashboard,email,
  admin,paywall,shared,tracking}/`.

## Conventions & gotchas

- App copy/UI strings are in Spanish; error messages from hooks/services are also Spanish — match this when adding
  user-facing text.
- `pages.config.js` has an "AUTO-GENERATED, do not add imports manually" header, but in practice new pages are added
  by editing it directly (import + `PAGES` entry); follow the existing format.
- Several `.sql` files at the repo root (`SETUP_SUPABASE.sql`, `supabase-setup.sql`) and many `FASE*_COMPLETADA.md` /
  `*.md` docs at the root are historical project-status/setup notes from earlier phases — useful for context on why
  things are structured a certain way, but not authoritative for current state (check `supabase/migrations/` and the
  actual code instead).
- Commit message style in this repo mixes `feat:`, `fix:`, `chore:` prefixes with plain descriptive messages
  (e.g. `feat improve commercial attachments preview and pdf layouts`) — short, imperative, present tense.
