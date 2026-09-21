import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ItemCard } from "@/components/item-card";
import { Empty, PageHeader } from "@/components/chrome";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: area } = await supabase
    .from("areas")
    .select("id, name, slug, color, icon, sort_order")
    .eq("slug", slug)
    .maybeSingle();

  if (!area) notFound();

  const { data: items } = await supabase
    .from("items")
    .select("id, kind, title, summary, why_useful, url, source_meta, area_id")
    .eq("area_id", area.id)
    .neq("status", "archived")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  const list = items ?? [];

  return (
    <div className="space-y-10">
      <PageHeader
        accent={area.color}
        title={area.name}
        description={`${list.length} ${list.length === 1 ? "item guardado nesta área" : "itens guardados nesta área"}.`}
      />

      {list.length === 0 ? (
        <Empty icon={Layers} title="Área vazia">
          Capture algo no Fluxo e destile. O que cair nesta área aparece aqui.
        </Empty>
      ) : (
        <div className="stagger space-y-3">
          {list.map((item) => (
            <ItemCard key={item.id} item={item as never} area={area as Area} />
          ))}
        </div>
      )}
    </div>
  );
}
