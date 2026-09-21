import { createClient } from "@/lib/supabase/server";
import { SearchClient } from "@/components/search-client";
import { PageHeader } from "@/components/chrome";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; modo?: string }>;
}) {
  const { q, modo } = await searchParams;
  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("id, name, slug, color, icon, sort_order")
    .order("sort_order");

  return (
    <div className="space-y-10">
      <PageHeader
        title={
          <>
            Reencontre pelo <span className="text-acid">sentido</span>
          </>
        }
        description="Palavra exata e significado ao mesmo tempo. Descreva a coisa com suas palavras, mesmo sem lembrar o termo certo."
      />

      <SearchClient
        areas={(areas ?? []) as Area[]}
        initialQuery={q ?? ""}
        initialMode={modo === "perguntar" ? "perguntar" : "buscar"}
      />
    </div>
  );
}
