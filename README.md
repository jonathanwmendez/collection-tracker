# Collection Tracker

A phone-first web app for cataloging collectibles. Take a photo, Claude identifies the item, the app finds a verified market price from real sales, and you approve it into your collection. Photos are saved to Google Drive, and the collection stays in sync with a Google Sheet.

Categories: Sports Cards, Magic: The Gathering, Yu-Gi-Oh!, Pokémon, Figures, Magazines, Newspapers, Ornaments, and Other.

## How it's built

| Part | Tool | Why |
|---|---|---|
| App | Next.js 15, TypeScript, Tailwind CSS | One codebase for screens and server code |
| Hosting | Vercel | Free for personal projects |
| Database and sign-in | Supabase (Postgres, Auth, Storage) | Real SQL database, Google sign-in, photo previews |
| Full-size photos | Google Drive | 15 GB free, browsable in Drive |
| Spreadsheet view | Google Sheets | The collection stays readable and shareable as a sheet |
| Identification and prices | Claude API, Scryfall, Pokémon TCG API, YGOPRODeck | Photo identification and verified pricing |

### Data model

- `items`: one row per item, with category-specific fields in `details` (JSON keyed by the sheet's column names)
- `photos`: Drive file plus a small preview in Supabase Storage
- `price_checks`: every price check ever run, so value can be charted over time
- `settings`: which sheet and Drive folders to use
- `google_tokens`: server-only Google refresh tokens for background work

See [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

## Build plan

- [x] **Step 1: Foundation.** Project setup, theme, Google sign-in locked to allowed accounts, app layout, database schema
- [ ] **Step 2: Add items.** Photos, Claude identification, review card, saving to Drive, Supabase, and the sheet
- [ ] **Step 3: Prices.** Verified prices on the review card, card game price databases
- [ ] **Step 4: Collection.** Browse, search, photo gallery, editing
- [ ] **Step 5: Value and upkeep.** Totals, charts over time, scheduled repricing, sheet sync

## Setup

Checked against the Supabase, Google, and Vercel docs in November 2026. Button labels can shift, but the settings are the same.

Do the parts in this order: each one needs an address from the one before it.

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com). Under **Security**, keep **Enable Data API** on, turn **Automatically expose new tables** off, and turn **Enable automatic RLS** on.
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, and run it.
3. Open **Settings > API Keys**. Copy the project URL, a **publishable** key, and a **secret** key. If the page has no publishable or secret key yet, create them there.

### 2. Vercel

1. Sign up at [vercel.com](https://vercel.com) with GitHub, then **Add New > Project** and import this repository. If it isn't listed, use **Adjust GitHub App Permissions** to give Vercel access to it.
2. Before deploying, open **Environment Variables** and add the four variables from the table below.
3. Deploy, then note the production address (for example `https://collection-tracker-xxxx.vercel.app`). The sign-in button won't work until parts 3 and 4 are done.

### 3. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. Enable the **Google Drive API** and the **Google Sheets API** (search each name in the top bar, then **Enable**).
3. Open **Google Auth Platform** and click **Get started**: app name, support email, audience **External**, contact email, then **Create**.
4. **Audience > Test users:** add the Google account you'll sign in with. Leave the status on **Testing** (see the note below).
5. **Data access > Add or remove scopes:** add `openid` and `.../auth/drive.file`, then **Save**.
6. **Clients > Create client:** type **Web application**.
   - **Authorized JavaScript origins:** your Vercel address (no trailing slash), plus `http://localhost:3000` for local development.
   - **Authorized redirect URIs:** the callback URL from Supabase's Google provider page (step 4.1), which looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Create it and copy the client ID and client secret.

**Testing vs. production.** In Testing, only listed test users can sign in, and Google ends their access 7 days after each sign-in, so you sign in again about once a week. Moving to **In production** removes that limit, but Google requires a home page, privacy policy, and terms of service on a domain you own and have verified, listed under **Branding**. That's a later step.

### 4. Connect Google to Supabase

1. In Supabase, **Authentication > Sign In / Providers > Google:** turn it on, paste the client ID and client secret, and save. This page also shows the callback URL used in step 3.6.
2. **Authentication > URL Configuration:**
   - **Site URL:** your Vercel address.
   - **Redirect URLs:** `https://<your-vercel-address>/auth/callback` and `http://localhost:3000/**`.

Then open your Vercel address and sign in.

### Environment variables

Set these in Vercel, and in `.env.local` (copied from `.env.example`) for local development:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Supabase secret key (server only) |
| `ALLOWED_EMAILS` | Google accounts allowed to sign in, comma-separated |

### Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Security

- Only the Google accounts listed in `ALLOWED_EMAILS` can sign in.
- Every table uses row-level security, so each account sees only its own rows.
- Google refresh tokens are stored in a table only the server can read.
- The app asks Google only for `drive.file` access: the files it creates and the sheet you pick, not the rest of your Drive.
