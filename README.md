# Collection Tracker

A phone-first web app for cataloging and valuing collectibles: sports cards, Magic: The Gathering, Yu-Gi-Oh!, Pokémon, figures, magazines, newspapers, ornaments, and more.

## How it works

A Google Sheet is the main copy of the collection. Three pieces work on it:

| Piece | Runs on | What it does |
|---|---|---|
| **Collection Intake** | A Claude artifact | Take a photo. Claude identifies the item and estimates its value. You approve, and it saves the photo to Drive and a row to the sheet |
| **Price check** | A Claude scheduled task, nightly at 3:30 AM, plus right after each approval | Prices new rows from recent sold listings, then rechecks the oldest prices past the repricing window (30 days by default) until 8:00 AM. Notes its sources and logs each run, with tokens used, to a Price Log tab |
| **This web app** | Vercel + Supabase | Syncs from the sheet to browse, search, edit, and value the collection |

Identifying and pricing run inside Claude, on a Claude subscription. The web app makes no paid AI calls.

**App features:** invite-only accounts with an Admin page and a setup checklist for each new person, sync on open, search, category lists with filters, item pages with photos and price history, edits saved to the sheet (each write checks it still has the right row), delete, queue for repricing, a repricing window kept the same in the app and the sheet, free card prices for Magic, Pokémon, and Yu-Gi-Oh! (Scryfall, Pokémon TCG API, YGOPRODeck), a value dashboard with value over time, and adding items without a photo.

**Built with:** Next.js 15, TypeScript, Tailwind CSS, Supabase (Postgres, Auth, Storage), Google Sheets and Drive APIs, Vercel.

## Setup

About 30 minutes. Do the steps in order: each one uses an address from the one before. Checked against each service in November 2026.

### 1. Claude

Paste [`claude/SETUP.md`](claude/SETUP.md) into a Claude conversation with the Google Drive and Google Sheets connectors on, after filling in your time zone where the prompt asks for it. It creates the sheet, photo folders, nightly price check, and Collection Intake, and gives you the sheet and Intake links for step 6.

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com). Under **Security**: keep **Enable Data API** on, turn **Automatically expose new tables** off, turn **Enable automatic RLS** on.
2. **SQL Editor:** run [`0001_init.sql`](supabase/migrations/0001_init.sql), [`0002_sheet_sync.sql`](supabase/migrations/0002_sheet_sync.sql), and [`0003_access.sql`](supabase/migrations/0003_access.sql), in that order.
3. **Settings > API Keys:** copy the project URL, a publishable key, and a secret key.

### 3. Google Cloud

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Sheets API** and **Google Drive API**.
2. **Google Auth Platform > Get started:** app name, support email, audience **External**, contact email.
3. **Audience > Test users:** add your Google account. Leave the status on **Testing**.
4. **Data access > Add or remove scopes > Manually add scopes:** paste the two scopes below, then **Add to table**, **Update**, **Save**.
   ```
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/drive.readonly
   ```
5. **Clients > Create client**, type **Web application**. Leave the origins for now. Under **Authorized redirect URIs**, add `https://<project-ref>.supabase.co/auth/v1/callback` (your Supabase URL plus `/auth/v1/callback`). Copy the client ID and secret. Google may show the secret only once.

### 4. Vercel

1. At [vercel.com](https://vercel.com), **Add New > Project** and import this repository.
2. Add the environment variables below, then deploy. Note the address, like `https://collection-tracker-xxxx.vercel.app`.
3. Back in the Google client from step 3.5, add that address under **Authorized JavaScript origins**.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Supabase secret key |
| `ADMIN_EMAILS` | Your Google account (the owner). Comma-separate to add more owners |
| `GOOGLE_CLIENT_ID` | Google client ID |
| `GOOGLE_CLIENT_SECRET` | Google client secret |
| `POKEMONTCG_API_KEY` | Optional, raises the Pokémon price lookup limit ([pokemontcg.io](https://pokemontcg.io)) |

If you change a variable later, redeploy for it to take effect.

### 5. Supabase sign-in

1. **Authentication > Sign In / Providers > Google:** turn it on, paste the Google client ID and secret, save.
2. **Authentication > URL Configuration:** Site URL = your Vercel address. Redirect URLs = `https://<your-vercel-address>/auth/callback`.

### 6. First sign-in

Open your Vercel address and sign in with Google. You'll see "Google hasn't verified this app": choose **Continue** and allow access. The setup checklist opens: paste the sheet and Collection Intake links from step 1 and save. The first sync starts on its own.

## Adding people

Everyone uses their own Google account and their own Claude plan. Their data stays separate.

1. They open the app and use **Request access** on the login page, or you invite them on the **Admin** page (Settings > Open Admin).
2. Approve or invite them on the Admin page. Then add their email under **Google Auth Platform > Audience > Test users**. Google doesn't let apps change that list, so the Admin page links to it.
3. They sign in, and the setup checklist walks them through the rest, including a button that copies the Claude setup prompt.

The Admin page shows each person's progress (signed in, Google, sheet, Intake, synced) and lets you make admins or remove access. Anyone can delete their own account and app data from Settings.

**About Testing mode:** up to 100 test users can sign in, and Google asks everyone to sign in again every 7 days. Publishing the app removes both limits, but Google requires a verified domain with a privacy policy and terms, plus a review of both scopes, including a yearly third-party security assessment for `drive.readonly`.

## Development

```bash
npm install
cp .env.example .env.local   # fill in the values from the table
npm run dev                  # http://localhost:3000
npm test
```

For local sign-in, also add `http://localhost:3000` to the Google client's JavaScript origins and `http://localhost:3000/**` to Supabase's redirect URLs.

| Path | What's there |
|---|---|
| `src/lib/sheet-format.ts` | Reading and writing sheet rows. Columns are found by header, so they can move |
| `src/lib/sheets.ts` | Google Sheets API calls, including the repricing window on the Summary tab |
| `src/lib/sync.ts` | Sheet-to-database sync, price history, daily value snapshots |
| `src/lib/item-sheet.ts` | Safe row writes that check the row first |
| `src/lib/prices.ts` | Free card price lookups |
| `src/lib/access.ts` | Owners, invites, and roles |
| `src/app/api/` | Sync, item edit/delete/reprice/price, settings, access requests, admin, account deletion, photo previews |
| `supabase/migrations/` | Tables: items, photos, price_checks, value_snapshots, settings, google_tokens, members, access_requests |
| `claude/` | Setup prompt, Collection Intake page, and price check prompt |
| `tests/` | Unit tests for row parsing, price lookups, access rules, and collection math |

## Security

- Only owners (`ADMIN_EMAILS`) and invited accounts can sign in, and every table uses row-level security, so each person sees only their own data.
- Invites and access requests live in tables only the server can read.
- Google refresh tokens live in a table only the server can read.
- Google access: the app asks to edit sheets and view Drive files. It only opens the connected sheet and the photos it links to, and never deletes anything in Drive. Deleting your account also revokes the app's Google access.
