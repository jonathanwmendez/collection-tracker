import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getItem } from "@/lib/data";
import { categoryByName } from "@/lib/categories";
import { ItemForm } from "@/components/item-form";

export const metadata = { title: "Edit item · Collection Tracker" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const found = await getItem(supabase, id);
  if (!found) notFound();
  const { item } = found;
  const category = categoryByName(item.category);
  if (!category) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={`/items/${id}`} className="text-sm">
          ← {item.name}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Edit item</h1>
        <p className="text-muted">
          {item.category}, row {item.sheet_row} in your sheet
        </p>
      </div>
      <ItemForm
        mode="edit"
        itemId={id}
        initial={{
          category: item.category,
          fields: { [category.fields[0]!]: item.name, ...item.details },
          condition: item.condition ?? "",
          quantity: item.quantity,
          value: item.market_value === null ? "" : String(item.market_value),
          status: item.status,
          notes: item.notes,
          paid: item.paid === null ? "" : String(item.paid),
          soldPrice: item.sold_price === null ? "" : String(item.sold_price),
          soldOn: item.sold_on ?? "",
        }}
      />
    </div>
  );
}
