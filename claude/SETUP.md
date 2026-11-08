Paste everything below the line into a new Claude conversation that has the Google Drive, Google Sheets, and Gmail connectors turned on (Gmail is optional, for price alerts). If you already created your Supabase project (README step 2.1), also turn on the Supabase connector and Claude will set up the database too. With the Vercel connector on, Claude also creates the Vercel project and adds the variables that aren't secret. If Claude can use a browser where you're signed in to Google Cloud (such as Claude in Chrome), it can also do the Google Cloud setup, except copying the client secret. Claude builds the sheet, the photo folders, the nightly price check, and the Collection Intake page, then gives you the two links the web app needs.

---

Set up my Collection Tracker. Use the Google Sheets, Google Drive, Gmail, Supabase, and Vercel connectors (whichever are on), your scheduled task tools, your artifact tools, and a browser if you have one. The files mentioned below are in https://github.com/jonathanwmendez/collection-tracker (paths are from the repository root). My time zone is: <your time zone, for example America/New_York>.

1. **Sheet.** Create a Google Sheet named "Collection Tracker", in Roboto, with these tabs. Row 1 holds the headers, frozen and bold. Header colors: navy (#1F3864, white text) for columns I fill in, Claude orange (#D97757, white text) for Market Value (Each), Last Checked, PSA 9 (Each), and PSA 10 (Each), gray (#6B7280, white text) for columns ending in "(Auto)". Format money columns as $#,##0.00 and date columns as mmm d, yyyy.
   - Sports Cards: Player, Year, Brand / Set, Card #, Parallel / Variant, Condition, Grade, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, PSA 9 (Each), PSA 10 (Each), Back Photo, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Magic: The Gathering: Card Name, Set, Collector #, Finish, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, TCGplayer (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, PSA 9 (Each), PSA 10 (Each), Back Photo, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Yu-Gi-Oh!: Card Name, Set, Set Code, Rarity, Edition, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, TCGplayer (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, PSA 9 (Each), PSA 10 (Each), Back Photo, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Pokémon: Card Name, Set, Card #, Rarity, Variant, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, TCGplayer (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, PSA 9 (Each), PSA 10 (Each), Back Photo, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Figures: Name, Line / Brand, Year, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Magazines: Title, Issue, Date, Cover / Feature, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Newspapers: Newspaper, Date, Headline, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Ornaments: Name, Brand / Series, Year, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Sets & Sealed: Product, Year, Brand, Sport / Game, Type, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, Location, Catalog ID, Authenticator, Cert Number, COA Photo (only truly sealed items: factory sets, boxes, packs, tins)
   - Other: Item, Type, Year, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes, Paid (Each), Sold For (Each), Sold Date, Location, Catalog ID, Authenticator, Cert Number, COA Photo
   - Price Log: Date, Started, Finished, Run, Priced, Couldn't Price, Still Due, New Tokens, Cached Tokens, New Tokens Per Item, Notes

   Put each "(Auto)" column's formula in its header cell as a one-cell array, so it fills the column by itself:
   - Total Value (Auto): `={"Total Value (Auto)";ARRAYFORMULA(IF(ISNUMBER(<value col>2:<value col>),<value col>2:<value col>*IF(<qty col>2:<qty col>="",1,<qty col>2:<qty col>),))}`
   - eBay Sold (Auto): a HYPERLINK to `https://www.ebay.com/sch/i.html?_nkw=<the row's identifying fields>&LH_Sold=1&LH_Complete=1`, labeled "eBay sold", blank when column A is empty.
   - TCGplayer (Auto): a HYPERLINK to `https://www.tcgplayer.com/search/<magic|yugioh|pokemon>/product?q=<Card Name>`, labeled "TCGplayer", blank when column A is empty.

   Add a "Summary" tab first: A1 "Collection Summary"; settings A3 "Reprice After (Days)" = 30, A4 "Alert On Change (%)" = 20, A5 "Grading Cost (Each)" = 30, A6 "Claude Check Over ($)" = 10; and from row 7 a table of Category, Items, Total Value, Need Repricing (filled rows whose Last Checked is empty or older than B3 days), and Share Of Value for each category tab, with a Total row. Leave out rows whose Status is "Sold" from every count and total (COUNTIFS / SUMIFS with Status "<>Sold").

2. **Photo folders.** In Google Drive, create a folder "Collection Tracker Photos" with one subfolder per category tab (not Summary or Price Log), named exactly like the tabs, plus a subfolder named "Inbox".

3. **Price check.** Create a scheduled task named "Collection Tracker pricing" that runs every day at 3:30 AM my time, using the prompt in `claude/price-check.md` with {{SHEET_ID}}, {{TIME_ZONE}}, {{PHOTOS_FOLDER_ID}}, {{INBOX_FOLDER_ID}}, and {{EMAIL}} (my Gmail address, for price alerts) filled in. Connect it to Google Sheets, Google Drive, and Gmail (if I have Gmail connected). It also turns photos from Collection Intake into rows.

4. **Collection Intake.** Publish `claude/collection-intake.html` as an artifact titled "Collection Intake", with every {{...}} placeholder filled in: the sheet ID and the Inbox folder ID. Give it one capability: `mcp` with Google Drive `create_file`. Pin it.

5. **Database (only if the Supabase connector is on).** List my Supabase projects and use the one named "collection-tracker" (ask me if there isn't exactly one match; never create a project). Check which migrations are already applied, then apply each remaining file in `supabase/migrations/` in number order, one migration per file, named after the file. Then run the security advisor and tell me about any warnings. If the connector is off, skip this step and remind me to run the migrations myself (README step 2.2).

6. **Vercel (only if the Vercel connector is on).** Ask me which GitHub repository holds my copy of collection-tracker, then create a Vercel project from it (Next.js, production branch `main`). Add these production environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: from the Supabase connector, if it's on.
   - `ADMIN_EMAILS`: ask me for my Google account email.
   - `CRON_SECRET`: generate a random 48-character value and store it as sensitive. Never show it to me.

   Never ask me to paste a secret key into this chat. I add `SUPABASE_SECRET_KEY` and `GOOGLE_CLIENT_SECRET` in Vercel myself, then redeploy. If the connector is off, skip this step (README step 4).

7. **Google Cloud (only if you can use a browser where I'm signed in to Google Cloud).** Ask before you start, and stop and ask me if anything looks different from these steps. In https://console.cloud.google.com:
   - Create a project named "collection-tracker" and enable the Google Sheets API and Google Drive API.
   - Google Auth Platform > Get started: app name "Collection Tracker", my email as the support and contact email, audience External.
   - Audience > Test users: add my Google account. Then **Publish app** so the status is "In production" (this stops Google from signing me out every 7 days). Don't submit the app for verification.
   - Data access > Add or remove scopes > Manually add scopes: `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive.readonly`, and `https://www.googleapis.com/auth/drive.file`, then save.
   - Clients > Create client, type Web application, name "Collection Tracker". Authorized redirect URI: my Supabase project URL plus `/auth/v1/callback` (from the Supabase connector, or ask me). Authorized JavaScript origin: the Vercel address, if you created the Vercel project.
   - The client secret is shown only once. Leave that dialog open and tell me to copy the secret now. Don't copy, type, or repeat it anywhere. You can share the client ID. If you created the Vercel project, add `GOOGLE_CLIENT_ID` there.

   If you can't use a browser, skip this step (README step 3).

8. **Finish** by giving me the sheet's link and the Collection Intake link, to paste into the web app's Settings page. Say whether the database is set up, give me the Vercel address if you created the project, and list which secrets I still need to add myself and where.
