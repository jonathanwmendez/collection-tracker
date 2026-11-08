import { CONTACT_URL, LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms of Service · Collection Tracker" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="November 8, 2026">
      <p>
        Collection Tracker is a personal app for cataloging and valuing a collection of cards and collectibles. By signing in, you agree to
        these terms.
      </p>

      <section>
        <h2>Who can use it</h2>
        <p>
          The app is invite-only. The owner decides who has access and can remove it at any time. Use your own Google account and only connect a
          spreadsheet you&apos;re allowed to edit.
        </p>
      </section>

      <section>
        <h2>Prices are estimates</h2>
        <p>
          Values come from recent sales, card price databases, and current eBay listings, and can be wrong or out of date. They aren&apos;t
          appraisals or financial advice. The insurance report is a list of your items and their estimated values, not a certified appraisal.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          Your spreadsheet and photos stay in your Google account and remain yours. Keep your own copy of anything important; the app is provided
          as is, without guarantees that it will always be available or error-free.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>Don&apos;t use the app to break the law, to access other people&apos;s data, or to overload or interfere with it.</p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          How the app handles your information is described in the <a href="/privacy">Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          If these terms change, the date at the top changes too. Questions:{" "}
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
            contact the owner
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
