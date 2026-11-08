# Collection Tracker

A phone-first web app for cataloging and valuing collectibles: sports cards, Magic: The Gathering, Yu-Gi-Oh!, Pokémon, figures, magazines, newspapers, ornaments, and more.

**[Try the demo](https://jonathanwmendez-collection-tracker.vercel.app/demo)** (sample data, no sign-in).

<p>
  <img src="docs/collection.png" alt="Collection overview with categories and totals" width="260">
  <img src="docs/value.png" alt="Value dashboard with total value, gains, and value over time" width="260">
  <img src="docs/item.png" alt="Item page with value history, cost, and grading" width="260">
</p>

## How it works

A Google Sheet is the main copy of the collection. Four pieces work on it:

| Piece | Runs on | What it does |
|---|---|---|
| **Scan page** | This web app, on your phone | Tap Add and the camera opens. Hold up any item: it snaps on its own, reads the text on the phone, and works out what it is (sports card, Magic, Pokémon, Yu-Gi-Oh!, or something else). Sports cards ask for the back; trading cards don't need it. It saves to the sheet with a free price, or shows the top 3 matches when unsure. Works offline and catches up when the signal returns. No Claude usage |
| **Collection Intake** | A Claude artifact | For anything that isn't a card: take photos and you're done. They upload to a Drive inbox. No Claude usage |
| **Morning pricing** | This web app, daily at 9 AM | Free prices, no Claude: Magic, Pokémon, and Yu-Gi-Oh! from their card databases every day, and sports cards from current eBay listings (labeled "asking") once they're due |
| **Background task** | A Claude scheduled task, nightly at 3:30 AM | Identifies Intake photos and scans the app couldn't read, prices from recent sold listings (everything that isn't a card, plus cards worth at least the "Claude Check Over" amount, $10 by default), checks certificates, samples the free prices for accuracy on Sundays, adds PSA 9 and PSA 10 prices, emails alerts for big moves, and logs each run to a Price Log tab. Stops starting new items at 8:00 AM |

The app makes no paid AI calls. Only the background task uses a Claude subscription, and only overnight.

**App features:**
- Collection: search, category lists with filters, item pages with full-screen photos (cards show front and back) and price history, and a list of items Claude flagged to check
- Location (which box or binder), certificates of authenticity with a lookup link, and a Sets & Sealed tab for factory-sealed products
- Add a back or certificate photo later from the item page
- Editing saved to the sheet (each write checks it still has the right row), delete, queue for repricing, add without a photo with a duplicate check
- Profit tracking: what you paid, what you sold for, gain so far, and realized profit
- Value dashboard: total over time (snapshot every morning), change by category, biggest price moves, grading candidates, price upkeep, CSV export, and a printable insurance report
- Free card prices for Magic, Pokémon, and Yu-Gi-Oh! (Scryfall, Pokémon TCG API, YGOPRODeck), and eBay asking prices for sports cards (eBay Browse API)
- Settings kept the same in the app and the sheet: repricing window, alert threshold, grading cost, Claude check amount
- Invite-only accounts with an Admin page and a setup checklist for each new person, and view-only share links

**Built with:** Next.js 15, TypeScript, Tailwind CSS, Supabase (Postgres, Auth, Storage), Google Sheets and Drive APIs, Vercel.

## Setup

About 30 minutes. Do the steps in order: each one uses an address from the one before. Checked against each service in November 2026.

**You need:** a Google account, a GitHub account, free Supabase and Vercel accounts, and a Claude plan with scheduled tasks and artifacts. Optional: a free [eBay developer account](https://developer.ebay.com) for sports card asking prices. In Claude (**Settings > Connectors**), connect:

| Connector | Used by | For |
|---|---|---|
| Google Sheets | Setup, background task | Reading and writing the sheet |
| Google Drive | Setup, Collection Intake, background task | Photo folders, uploads, and reading photos |
| Gmail | Background task | Price alert emails. Optional: without it, alerts go in the Price Log tab instead |
| Supabase | Setup | Optional. Runs the database migrations for you (create the Supabase project in step 2.1 first) |
| Vercel | Setup | Optional. Creates the Vercel project and adds the variables that aren't secret |

Google Cloud has no connector. If Claude can use a browser where you're signed in to Google Cloud (such as Claude in Chrome), the setup prompt does step 3 for you, except copying the client secret.

### 1. Claude

Paste [`claude/SETUP.md`](claude/SETUP.md) into a new Claude conversation, after filling in your time zone where the prompt asks for it. It creates the sheet, photo folders, the background task, and Collection Intake, and gives you the sheet and Intake links for step 6.

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com). Under **Security**: keep **Enable Data API** on, turn **Automatically expose new tables** off, turn **Enable automatic RLS** on.
2. **SQL Editor:** run the files in [`supabase/migrations/`](supabase/migrations) in order, `0001` through `0010`. Skip this if Claude already ran them in step 1 with the Supabase connector.
3. **Settings > API Keys:** copy the project URL, a publishable key, and a secret key.

### 3. Google Cloud

If Claude did this in step 1, skip to step 4. You still need the client secret you copied.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Sheets API** and **Google Drive API**.
2. **Google Auth Platform > Get started:** app name, support email, audience **External**, contact email.
3. **Audience > Test users:** add your Google account. Then **Publish app** so the status is **In production**. Don't submit for verification. In production, Google stops signing you out every 7 days.
4. **Data access > Add or remove scopes > Manually add scopes:** paste the three scopes below, then **Add to table**, **Update**, **Save**.
   ```
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/drive.readonly
   https://www.googleapis.com/auth/drive.file
   ```
5. **Clients > Create client**, type **Web application**. Leave the origins for now. Under **Authorized redirect URIs**, add `https://<project-ref>.supabase.co/auth/v1/callback` (your Supabase URL plus `/auth/v1/callback`). Copy the client ID and secret. Google may show the secret only once.

### 4. Vercel

1. At [vercel.com](https://vercel.com), **Add New > Project** and import this repository.
2. Add the environment variables below, then deploy. If Claude created the project in setup step 1, skip 4.1. Claude's last message lists the variables it added. Add the rest (at least `SUPABASE_SECRET_KEY` and `GOOGLE_CLIENT_SECRET`) and redeploy. Note the address, like `https://collection-tracker-xxxx.vercel.app`.
3. Back in the Google client from step 3.5, add that address under **Authorized JavaScript origins**.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Supabase secret key |
| `ADMIN_EMAILS` | Your Google account (the owner). Comma-separate to add more owners |
| `GOOGLE_CLIENT_ID` | Google client ID |
| `GOOGLE_CLIENT_SECRET` | Google client secret |
| `CRON_SECRET` | A long random string. Vercel sends it to the daily sync so only Vercel can run it |
| `POKEMONTCG_API_KEY` | Optional, raises the Pokémon price lookup limit ([pokemontcg.io](https://pokemontcg.io)) |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Optional, turns on sports card asking prices. From your eBay developer account's Production keyset: App ID and Cert ID |

If you change a variable later, redeploy for it to take effect.

To use a different `.vercel.app` address, add it under **Settings > Domains**. Then put the new address in three places: Supabase's Site URL, Supabase's Redirect URLs (with `/auth/callback`), and the Google client's Authorized JavaScript origins. Share links made on the old address stop working unless you redirect it (see `vercel.json`).

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

**About Google's limits:** an unverified app in production can have up to 100 users, and they see "Google hasn't verified this app" when signing in. Verifying removes both, but Google requires a verified domain with a privacy policy and terms, plus a review of the scopes, including a yearly third-party security assessment for `drive.readonly`.

## Sharing

**Collection > Share** creates view-only links. For each link, pick the categories, whether values and notes show, and when it expires. Anyone with the link can browse, search, and open items without an account, and tap a photo to see it full screen (swipe between photos, pinch to zoom). Links never expose the sheet, Drive links, or anything else in your Google account. The Share page shows each link's views, and **Turn off** disables it for good.

## Development

```bash
npm install
cp .env.example .env.local   # fill in the values from the table
npm run dev                  # http://localhost:3000
npm test
```

`npm run dev` and `npm run build` first copy the on-phone text reader (tesseract.js) into `public/tesseract/`, which is not committed.

For local sign-in, also add `http://localhost:3000` to the Google client's JavaScript origins and `http://localhost:3000/**` to Supabase's redirect URLs.

| Path | What's there |
|---|---|
| `src/lib/sheet-format.ts` | Reading and writing sheet rows. Columns are found by header, so they can move |
| `src/lib/sheets.ts` | Google Sheets API calls, including the settings on the Summary tab |
| `src/lib/sync.ts` | Sheet-to-database sync, price history, daily value snapshots (also run every morning by `src/app/api/cron/sync`) |
| `src/lib/collection.ts`, `src/lib/movers.ts` | Totals, gains, grading math, and biggest price changes |
| `src/components/value-dashboard.tsx` | The Value page, shared with the demo |
| `src/lib/demo-data.ts`, `src/app/demo/` | The public demo with sample data |
| `src/lib/csv.ts` | CSV export |
| `src/lib/item-sheet.ts` | Safe row writes that check the row first |
| `src/lib/prices.ts`, `src/lib/ebay.ts` | Free card price lookups and eBay asking prices |
| `src/lib/reprice.ts`, `src/lib/reprice-rules.ts` | Morning free repricing and which items it covers |
| `src/components/scanner.tsx`, `src/lib/card-text.ts`, `src/lib/identify.ts`, `src/lib/scan.ts` | Scan page: camera, reading card text, matching, and saving |
| `src/lib/paged.ts` | Reads past Supabase's 1,000-row limit |
| `src/lib/access.ts` | Owners, invites, and roles |
| `src/lib/shares.ts`, `src/app/s/` | Share links and the public view-only pages |
| `src/app/api/` | Sync, daily sync and pricing, scanning, item edit/delete/reprice/price/photos, settings, export, access requests, admin, account deletion, photo previews |
| `supabase/migrations/` | Tables: items, photos, price_checks, value_snapshots, settings, google_tokens, members, access_requests, shares |
| `claude/` | Setup prompt, Collection Intake page, and the background task prompt (`price-check.md`) |
| `vercel.json` | Daily sync schedule, and a redirect from this deployment's old address (safe to remove in a fork) |
| `tests/` | Unit tests for row parsing, card text, price lookups, repricing rules, access and share rules, collection math, and CSV export |

## Security

- Only owners (`ADMIN_EMAILS`) and invited accounts can sign in, and every table uses row-level security, so each person sees only their own data.
- Invites and access requests live in tables only the server can read.
- Share links use random 128-bit tokens, are checked on every request, and only serve the categories and fields the link allows. Share pages are hidden from search engines.
- Google refresh tokens live in a table only the server can read.
- Google access: the app asks to edit sheets, view Drive files, and create files in folders it makes itself (the "Collection Tracker Scans" folder). It only opens the connected sheet and the photos it links to, and never deletes anything in Drive. Deleting your account also revokes the app's Google access.
