# Collection Tracker

A phone-first web app for cataloging collectibles: sports cards, Magic: The Gathering, Yu-Gi-Oh!, Pokémon, figures, magazines, newspapers, ornaments, and more. It browses, searches, edits, and values a collection kept in a Google Sheet, with photos in Google Drive.

## How it works

The Google Sheet is the main copy of the collection. Three pieces work on it:

| Piece | Runs on | What it does |
|---|---|---|
| **Collection Intake** | A Claude artifact, on the owner's Claude plan | Take a photo, Claude identifies the item and estimates a price, you approve, and it saves the photo to Drive and the row to the sheet |
| **Scheduled price check** | A Claude scheduled task, every 4 hours | Prices every row with an empty Last Checked from recent sold listings, and notes the source |
| **This web app** | Vercel + Supabase | Syncs from the sheet, then browses, searches, edits, deletes, values, and charts the collection |

Identification and sales research run inside Claude, so they use the Claude subscription rather than paid API calls. The web app itself makes no Claude calls.

### Features

- **Sync** from the sheet when the app opens and whenever you return to it, or with **Sync now**
- **Collection**: categories with counts and values, search across everything, per-category lists with status filters and sorting
- **Item pages**: photos (previews made once from Drive and cached), value and price history, details, notes, links to eBay sold listings or TCGplayer and to the item's row in the sheet
- **Editing** that writes to the sheet first. Each write checks the row still holds the same item, so a sorted or edited sheet can't cause the wrong row to be overwritten
- **Delete** an item's row, or **Ask Claude to reprice** it (clears Last Checked so the scheduled check picks it up)
- **Free card prices** for Magic (Scryfall), Pokémon (Pokémon TCG API), and Yu-Gi-Oh! (YGOPRODeck), one card or a whole category at a time, saved to the sheet with the source
- **Value**: total, share verified against real sales, value over time (one snapshot per day), by category, by status, most valuable items, and items due for repricing
- **Add without a photo**: a form that appends a row to the right tab
- Light and dark mode, installable on a phone home screen

## How it's built

| Part | Tool |
|---|---|
| App | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 |
| Hosting | Vercel |
| Database, sign-in, preview images | Supabase (Postgres with row-level security, Auth, Storage) |
| Main copy of the collection | Google Sheets API |
| Full-size photos | Google Drive API |
| Card prices | Scryfall, Pokémon TCG API, YGOPRODeck |

### Data model

- `items`: one row per sheet row, with category-specific fields in `details` (JSON keyed by the sheet's column names)
- `photos`: the Drive file linked in the sheet, plus a small cached preview in Supabase Storage
- `price_checks`: every value change seen during sync or saved by the app, for price history
- `value_snapshots`: the collection's total value once per day, for the chart
- `settings`: the sheet, its tab IDs, the Collection Intake link, and the repricing window
- `google_tokens`: server-only Google refresh tokens

Migrations: [`0001_init.sql`](supabase/migrations/0001_init.sql), [`0002_sheet_sync.sql`](supabase/migrations/0002_sheet_sync.sql).

### Code map

- `src/lib/sheet-format.ts`: reading and writing sheet rows (columns found by header name, so columns can move)
- `src/lib/sync.ts`: sheet to database sync, price history, daily snapshots
- `src/lib/prices.ts`: free card price lookups
- `src/lib/item-sheet.ts`: safe row writes (checks the row before writing)
- `src/app/api/*`: sync, item edit/delete/reprice/price, settings, photo previews
- `tests/`: unit tests for row parsing, price lookups, and collection math (`npm test`)

## Setup

Checked against the Supabase, Google, and Vercel docs in November 2026. Button labels can shift, but the settings are the same.

Do the parts in this order: each one needs an address from the one before it.

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com). Under **Security**, keep **Enable Data API** on, turn **Automatically expose new tables** off, and turn **Enable automatic RLS** on.
2. Open **SQL Editor** and run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_sheet_sync.sql`.
3. Open **Settings > API Keys**. Copy the project URL, a **publishable** key, and a **secret** key. If the page has no publishable or secret key yet, create them there.

### 2. Vercel

1. Sign up at [vercel.com](https://vercel.com) with GitHub, then **Add New > Project** and import this repository.
2. Before deploying, open **Environment Variables** and add the variables from the table below.
3. Deploy, then note the production address (for example `https://collection-tracker-xxxx.vercel.app`).

### 3. Google

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. Enable the **Google Drive API** and the **Google Sheets API** (search each name in the top bar, then **Enable**).
3. Open **Google Auth Platform** and click **Get started**: app name, support email, audience **External**, contact email, then **Create**.
4. **Audience > Test users:** add the Google account you'll sign in with. Leave the status on **Testing** (see the note below).
5. **Data access > Add or remove scopes:** under **Manually add scopes**, paste these, click **Add to table**, then **Update** and **Save**:
   ```
   openid
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/drive.readonly
   https://www.googleapis.com/auth/drive.file
   ```
6. **Clients > Create client:** type **Web application**.
   - **Authorized JavaScript origins:** your Vercel address (no trailing slash), plus `http://localhost:3000` for local development.
   - **Authorized redirect URIs:** the callback URL from Supabase's Google provider page (step 4.1), which looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Create it and copy the client ID and client secret. Google may only show the secret once. If you lose it, open the client and use **Add secret**; older secrets keep working.

**Testing vs. production.** In Testing, only listed test users can sign in, Google shows a "Google hasn't verified this app" screen (choose **Continue**), and Google ends access 7 days after each sign-in, so you sign in again about once a week. Publishing to production needs a home page, privacy policy, and terms on a verified domain, plus Google's review for the `spreadsheets` (sensitive) and `drive.readonly` (restricted) scopes.

### 4. Connect Google to Supabase

1. In Supabase, **Authentication > Sign In / Providers > Google:** turn it on, paste the client ID and client secret, and save. This page also shows the callback URL used in step 3.6.
2. **Authentication > URL Configuration:**
   - **Site URL:** your Vercel address.
   - **Redirect URLs:** `https://<your-vercel-address>/auth/callback` and `http://localhost:3000/**`.

### 5. Connect the sheet

1. Open your Vercel address and sign in. Allow all the Google permissions on the consent screen.
2. Open **Settings** (your initials, top right). Paste the Google Sheet's link and the Collection Intake artifact's link, then **Save**. The first sync starts on its own.

The sheet needs one tab per category (Sports Cards, Magic: The Gathering, Yu-Gi-Oh!, Pokémon, Figures, Magazines, Newspapers, Ornaments, Other), with headers in row 1: the category's fields, then `Condition`, `Qty`, `Market Value (Each)`, `Last Checked`, `Status`, `Photo`, `Notes`. Columns whose header ends in `(Auto)` are formulas and are never written.

### Environment variables

Set these in Vercel, and in `.env.local` (copied from `.env.example`) for local development:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Supabase secret key (server only) |
| `ALLOWED_EMAILS` | Google accounts allowed to sign in, comma-separated |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (step 3.6) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (step 3.6, server only) |
| `POKEMONTCG_API_KEY` | Optional. Raises the Pokémon TCG API's rate limit. Free at [pokemontcg.io](https://pokemontcg.io) |
| `ANTHROPIC_API_KEY` | Optional and unused by default. Only for the in-app identification routes (`/api/identify`), billed to a Claude Console account |

After changing variables in Vercel, redeploy for them to take effect.

### Run locally

```bash
npm install
npm run dev
npm test
```

Open http://localhost:3000.

## Security

- Only the Google accounts listed in `ALLOWED_EMAILS` can sign in.
- Every table uses row-level security, so each account sees only its own rows.
- Google refresh tokens are stored in a table only the server can read.
- Google access: `spreadsheets` to read and update the collection sheet, `drive.readonly` to show photos Collection Intake saved to Drive, and `drive.file` for files the app creates. The app never deletes Drive files.
- Every sheet write first re-reads the row and checks the item's name, so a sorted or edited sheet can't cause the wrong row to be overwritten.
