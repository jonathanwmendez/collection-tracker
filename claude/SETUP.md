Paste everything below the line into a new Claude conversation that has the Google Drive and Google Sheets connectors turned on. Claude builds the sheet, the photo folders, the nightly price check, and the Collection Intake page, then gives you the two links the web app needs.

---

Set up my Collection Tracker. Use the Google Sheets and Google Drive connectors, your scheduled task tools, and your artifact tools. The files mentioned below are in https://github.com/jonathanwmendez/collection-tracker under `claude/`. My time zone is: <your time zone, for example America/New_York>.

1. **Sheet.** Create a Google Sheet named "Collection Tracker", in Roboto, with these tabs. Row 1 holds the headers, frozen and bold. Header colors: navy (#1F3864, white text) for columns I fill in, Claude orange (#D97757, white text) for Market Value (Each) and Last Checked, gray (#6B7280, white text) for columns ending in "(Auto)".
   - Sports Cards: Player, Year, Brand / Set, Card #, Parallel / Variant, Condition, Grade, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes
   - Magic: The Gathering: Card Name, Set, Collector #, Finish, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, TCGplayer (Auto), Status, Photo, Notes
   - Yu-Gi-Oh!: Card Name, Set, Set Code, Rarity, Edition, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, TCGplayer (Auto), Status, Photo, Notes
   - Pokémon: Card Name, Set, Card #, Rarity, Variant, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, TCGplayer (Auto), Status, Photo, Notes
   - Figures: Name, Line / Brand, Year, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes
   - Magazines: Title, Issue, Date, Cover / Feature, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes
   - Newspapers: Newspaper, Date, Headline, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes
   - Ornaments: Name, Brand / Series, Year, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes
   - Other: Item, Type, Year, Condition, Qty, Market Value (Each), Total Value (Auto), Last Checked, eBay Sold (Auto), Status, Photo, Notes
   - Price Log: Date, Started, Finished, Run, Priced, Couldn't Price, Still Due, New Tokens, Cached Tokens, New Tokens Per Item, Notes

   Put each "(Auto)" column's formula in its header cell as a one-cell array, so it fills the column by itself:
   - Total Value (Auto): `={"Total Value (Auto)";ARRAYFORMULA(IF(ISNUMBER(<value col>2:<value col>),<value col>2:<value col>*IF(<qty col>2:<qty col>="",1,<qty col>2:<qty col>),))}`
   - eBay Sold (Auto): a HYPERLINK to `https://www.ebay.com/sch/i.html?_nkw=<the row's identifying fields>&LH_Sold=1&LH_Complete=1`, labeled "eBay sold", blank when column A is empty.
   - TCGplayer (Auto): a HYPERLINK to `https://www.tcgplayer.com/search/<magic|yugioh|pokemon>/product?q=<Card Name>`, labeled "TCGplayer", blank when column A is empty.

   Add a "Summary" tab first: A1 "Collection Summary", A3 "Reprice After (Days)" with B3 = 30, and from row 5 a table of Category, Items, Total Value, Need Repricing (filled rows whose Last Checked is empty or older than B3 days), and Share Of Value for each category tab, with a Total row.

2. **Photo folders.** In Google Drive, create a folder "Collection Tracker Photos" with one subfolder per category tab (not Summary or Price Log), named exactly like the tabs.

3. **Price check.** Create a scheduled task named "Collection Tracker pricing" that runs every day at 3:30 AM my time, with the Google Sheets connector, using the prompt in `claude/price-check.md` with {{SHEET_ID}} and {{TIME_ZONE}} filled in.

4. **Collection Intake.** Publish `claude/collection-intake.html` as an artifact titled "Collection Intake", with every {{...}} placeholder filled in: the sheet ID, the photos folder ID, each category folder ID, and the price check task ID. Give it these capabilities: `sample` with images, and `mcp` with Google Drive `create_file`, Google Sheets `get_values` and `update_values`, and your scheduled task tool `fire_trigger`. Pin it.

5. **Finish** by giving me the sheet's link and the Collection Intake link, to paste into the web app's Settings page.
