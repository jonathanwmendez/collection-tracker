import { CONTACT_URL, LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy Policy · Collection Tracker" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 8, 2026">
      <p>
        Collection Tracker is a personal app for cataloging and valuing a collection of cards and collectibles. It is run by its owner for their
        own use and for a small number of people they invite. This page explains what it does with your information.
      </p>

      <section>
        <h2>What it uses from your Google account</h2>
        <ul>
          <li>Your name, email address, and profile picture, to sign you in and check that you were invited.</li>
          <li>
            Google Sheets: it reads and edits the one spreadsheet you connect, which holds your collection. It doesn&apos;t open your other
            spreadsheets.
          </li>
          <li>Google Drive, read only: it opens the photos your spreadsheet links to, so it can show them in the app.</li>
          <li>
            Google Drive, files the app creates: it makes a &quot;Collection Tracker Scans&quot; folder and saves photos you take on the Scan page
            there.
          </li>
        </ul>
        <p>It never deletes anything in your Google Drive.</p>
      </section>

      <section>
        <h2>What it stores</h2>
        <p>The app keeps the following in its database (Supabase) so it loads quickly and can show history:</p>
        <ul>
          <li>A copy of your spreadsheet&apos;s rows, small thumbnails of your photos, price history, and your settings.</li>
          <li>Share links you create, and invitations and access requests.</li>
          <li>The key Google provides so the app can reach your spreadsheet and photos while you&apos;re signed in. Only the server can read it.</li>
        </ul>
        <p>
          On your phone, the Scan page keeps its settings and any scans that haven&apos;t finished saving, so nothing is lost if the signal
          drops. The app uses a cookie to keep you signed in. It has no ads and no tracking.
        </p>
      </section>

      <section>
        <h2>Who else sees it</h2>
        <ul>
          <li>Supabase (the database) and Vercel (the web host) store and serve the app&apos;s data on its behalf.</li>
          <li>
            To look up prices, it sends a card&apos;s name, set, and number to free card price services (Scryfall, the Pokémon TCG API, and
            YGOPRODeck) and to eBay. Nothing about you is sent with these lookups.
          </li>
          <li>People you share a link with see the items that link includes, and nothing else.</li>
        </ul>
        <p>Your information is never sold, never used for advertising, and never used to train AI models.</p>
      </section>

      <section>
        <h2>Google user data</h2>
        <p>
          Collection Tracker&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Google data is used only to provide the features described above.
        </p>
      </section>

      <section>
        <h2>Deleting your information</h2>
        <p>
          Settings &gt; Delete account removes everything the app stores about you. Your spreadsheet and Drive files stay in your Google
          account. You can also remove the app&apos;s access to your Google account at any time at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          If this policy changes, the date at the top changes too. Questions:{" "}
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
            contact the owner
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
