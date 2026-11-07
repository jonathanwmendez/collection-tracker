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

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, and run it.
3. In **Project Settings > API**, copy the project URL, the publishable key, and the secret key.

### 2. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. **APIs & Services > Library:** enable the **Google Drive API** and **Google Sheets API**.
3. **APIs & Services > OAuth consent screen:** choose **External**, fill in the app name and your email, and add the scope `.../auth/drive.file`. Add yourself as a test user, then publish the app to **In production** so sign-ins don't expire every 7 days. Because the app only uses the `drive.file` scope, Google doesn't require a review.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID:** choose **Web application**, and add the redirect URI shown in Supabase under **Authentication > Providers > Google** (it looks like `https://<project-ref>.supabase.co/auth/v1/callback`).
5. In Supabase, **Authentication > Providers > Google:** turn it on and paste the client ID and client secret.
6. In Supabase, **Authentication > URL Configuration:** set the Site URL to your app's address, and add `http://localhost:3000/**` and your Vercel address followed by `/**` to the redirect URLs.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Supabase secret key (server only) |
| `ALLOWED_EMAILS` | Google accounts allowed to sign in, comma-separated |

### 4. Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### 5. Deploy

Import the repository at [vercel.com/new](https://vercel.com/new), add the same environment variables, and deploy. Then add the Vercel address to Supabase's redirect URLs (step 2.6).

## Security

- Only the Google accounts listed in `ALLOWED_EMAILS` can sign in.
- Every table uses row-level security, so each account sees only its own rows.
- Google refresh tokens are stored in a table only the server can read.
- The app asks Google only for `drive.file` access: the files it creates and the sheet you pick, not the rest of your Drive.
