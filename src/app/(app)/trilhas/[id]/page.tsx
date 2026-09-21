import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrackDetail } from "@/components/track-detail";
import type { Track, TrackTopic } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: track } = await supabase.from("tracks").select("*").eq("id", id).maybeSingle();
  if (!track) notFound();

  const { data: topics } = await supabase
    .from("track_topics")
    .select("*")
    .eq("track_id", id)
    .order("sort_order");

  return <TrackDetail track={track as Track} topics={(topics ?? []) as TrackTopic[]} />;
}
