import { createClient, getUser } from "@/lib/supabase/server";

/**
 * Export completo em JSON.
 *
 * Um segundo cérebro só merece confiança se der para tirar tudo de dentro
 * dele a qualquer momento. Embeddings ficam de fora de propósito: são
 * derivados e podem ser regerados, e incluí-los inflaria o arquivo à toa.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const supabase = await createClient();

  const [areas, items, tags, itemTags, tracks, topics] = await Promise.all([
    supabase.from("areas").select("*").order("sort_order"),
    supabase.from("items").select("*").order("created_at"),
    supabase.from("tags").select("*"),
    supabase.from("item_tags").select("*"),
    supabase.from("tracks").select("*"),
    supabase.from("track_topics").select("*").order("sort_order"),
  ]);

  const payload = {
    app: "eLv, segundo cérebro",
    version: 1,
    exported_at: new Date().toISOString(),
    areas: areas.data ?? [],
    items: (items.data ?? []).map(({ fts: _fts, ...rest }) => rest),
    tags: tags.data ?? [],
    item_tags: itemTags.data ?? [],
    tracks: tracks.data ?? [],
    track_topics: topics.data ?? [],
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="elv-backup-${stamp}.json"`,
    },
  });
}
