"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function toggleTopic(topicId: string, done: boolean): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();
  const { error } = await supabase.from("track_topics").update({ done }).eq("id", topicId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/trilhas", "layout");
  revalidatePath("/");
  return { ok: true };
}

export async function createTrack(input: {
  title: string;
  description?: string;
  areaId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Dê um nome à trilha." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .insert({
      user_id: user.id,
      title,
      description: input.description?.trim() ?? "",
      area_id: input.areaId ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/trilhas");
  return { ok: true, data: { id: data.id } };
}

export async function addTopic(trackId: string, title: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const clean = title.trim();
  if (!clean) return { ok: false, error: "Tópico vazio." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("track_topics")
    .select("id", { count: "exact", head: true })
    .eq("track_id", trackId);

  const { error } = await supabase
    .from("track_topics")
    .insert({ track_id: trackId, title: clean, sort_order: count ?? 0 });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trilhas/${trackId}`);
  return { ok: true };
}

export async function deleteTrack(id: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();
  const { error } = await supabase.from("tracks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/trilhas");
  return { ok: true };
}
