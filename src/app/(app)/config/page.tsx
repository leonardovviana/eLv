import { createClient, getUser } from "@/lib/supabase/server";
import { aiUsageToday } from "@/lib/ai-server";
import { pendingIndexCount } from "@/lib/embed-items";
import { MODEL_EMBED, MODEL_FAST, MODEL_HEAVY, isGeminiConfigured } from "@/lib/gemini";
import { ConfigClient } from "@/components/config-client";
import { PageHeader } from "@/components/chrome";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const user = await getUser();
  const supabase = await createClient();

  const [pending, usage] = await Promise.all([
    pendingIndexCount(supabase),
    aiUsageToday(supabase),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        title={
          <>
            Sala de <span className="text-acid">máquinas</span>
          </>
        }
        description="Índice semântico, consumo de IA, backup e conta."
      />

      <ConfigClient
        email={user?.email ?? ""}
        name={(user?.user_metadata?.name as string) ?? ""}
        pendingIndex={pending}
        usageToday={usage}
        aiConfigured={isGeminiConfigured()}
        models={{ fast: MODEL_FAST, heavy: MODEL_HEAVY, embed: MODEL_EMBED }}
      />
    </div>
  );
}
