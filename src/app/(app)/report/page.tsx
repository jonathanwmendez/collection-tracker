import { createClient } from "@/lib/supabase/server";
import { getItems } from "@/lib/data";
import { InsuranceReport } from "@/components/insurance-report";

export const metadata = { title: "Insurance report · Collection Tracker" };

export default async function ReportPage() {
  const supabase = await createClient();
  return <InsuranceReport items={await getItems(supabase)} />;
}
