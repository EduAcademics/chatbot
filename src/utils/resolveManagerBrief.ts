import type { ChatMessage } from "../components/types";
import type { ManagerBriefPayload } from "../types/managerBriefTypes";

function isManagerBriefPayload(value: unknown): value is ManagerBriefPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as ManagerBriefPayload;
  return v.template === "manager_brief" && Array.isArray(v.sections);
}

function isCatalogTagged(msg: ChatMessage): boolean {
  return Boolean(msg.catalog_id?.trim());
}


export function narrativeToBullets(text: string): string[] {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 6);

  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, 6);
}

function normalizeBriefBullets(payload: ManagerBriefPayload): ManagerBriefPayload {
  const bullets = (payload.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  if (bullets.length) {
    return { ...payload, bullets };
  }

  const fromNarrative = narrativeToBullets(payload.narrative || "");
  if (fromNarrative.length) {
    return { ...payload, bullets: fromNarrative, narrative: "" };
  }

  return payload;
}


export function resolveManagerBrief(msg: ChatMessage): ManagerBriefPayload | null {
  if (!isCatalogTagged(msg)) return null;

  const raw = (msg as ChatMessage & { interactive_ui?: unknown }).interactive_ui;
  if (!isManagerBriefPayload(raw)) return null;

  return normalizeBriefBullets(raw);
}
