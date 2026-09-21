import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ItemEditor, RelatedList } from "@/components/item-editor";
import type { Area, Item } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
  if (!item) notFound();

  const [{ data: areas }, { data: tagRows }, { data: related }] = await Promise.all([
    supabase.from("areas").select("id, name, slug, color, icon, sort_order").order("sort_order"),
    supabase.from("item_tags").select("tags(name)").eq("item_id", id),
    supabase.rpc("related_items", { p_item_id: id, match_count: 5 }),
  ]);

  const tags = (tagRows ?? [])
    .map((r) => (r.tags as unknown as { name: string } | null)?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <div className="space-y-10">
      <ItemEditor item={item as Item} areas={(areas ?? []) as Area[]} tags={tags} />
      <RelatedList items={related ?? []} />
    </div>
  );
}
