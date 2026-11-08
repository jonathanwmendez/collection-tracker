import { Scanner } from "@/components/scanner";

export const metadata = { title: "Scan · Demo · Collection Tracker" };

/** The Scan page with sample cards through a pretend camera (or your own camera). Nothing is saved. */
export default function DemoScan() {
  return <Scanner ebayOn demo />;
}
