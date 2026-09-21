"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { createTrack } from "@/lib/actions/tracks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Area } from "@/lib/types";

export function TrackGenerator({ areas }: { areas: Area[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [areaId, setAreaId] = useState<string>(areas[0]?.id ?? "none");
  const [theme, setTheme] = useState("");
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          areaId: areaId === "none" ? null : areaId,
          theme: theme.trim() || undefined,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.quota ? "Quota do Gemini esgotada" : "Não consegui gerar", {
          description: json.error,
        });
        return;
      }

      toast.success(`Trilha criada com ${json.topics} tópicos`);
      setOpen(false);
      setTheme("");
      router.push(`/trilhas/${json.trackId}`);
    } catch {
      toast.error("Falha de rede ao gerar a trilha.");
    } finally {
      setGenerating(false);
    }
  }

  async function manual() {
    const title = theme.trim();
    if (!title) {
      toast.error("Escreva um nome para a trilha.");
      return;
    }
    setCreating(true);
    const res = await createTrack({
      title,
      areaId: areaId === "none" ? null : areaId,
    });
    setCreating(false);

    if (res.ok) {
      setOpen(false);
      setTheme("");
      router.push(`/trilhas/${res.data?.id}`);
    } else {
      toast.error("Não consegui criar", { description: res.error });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Nova trilha
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <span className="label text-acid">Nova trilha</span>
          <DialogTitle>Monte um percurso</DialogTitle>
          <DialogDescription>
            A IA ancora a trilha no que você já salvou naquela área. Sem acervo, ela tem pouco
            de onde puxar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2.5">
            <Label>Área</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a área" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem área</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="theme">Tema (opcional)</Label>
            <Input
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Ex.: construir agentes com tool calling"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Criando manualmente, este texto vira o nome da trilha.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={manual} disabled={creating || generating}>
              {creating && <Loader2 className="animate-spin" />}
              Criar vazia
            </Button>
            <Button onClick={generate} disabled={generating || creating}>
              {generating ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {generating ? "Montando" : "Gerar com IA"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
