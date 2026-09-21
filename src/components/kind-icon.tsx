import {
  Code2,
  FileText,
  Github,
  Lightbulb,
  Link as LinkIcon,
  MessageSquareQuote,
} from "lucide-react";
import type { ItemKind } from "@/lib/types";

const MAP = {
  note: FileText,
  link: LinkIcon,
  snippet: Code2,
  repo: Github,
  prompt: MessageSquareQuote,
  idea: Lightbulb,
} as const;

export function KindIcon({ kind, className }: { kind: ItemKind; className?: string }) {
  const Icon = MAP[kind] ?? FileText;
  return <Icon className={className} />;
}
