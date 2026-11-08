import { DEMO } from "@/lib/demo-data";
import { InsuranceReport } from "@/components/insurance-report";

export const metadata = { title: "Insurance report · Demo · Collection Tracker" };

export default function DemoReport() {
  return <InsuranceReport items={DEMO.items} />;
}
