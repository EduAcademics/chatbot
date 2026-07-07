import {
  SUGGESTED_PROMPTS_BY_PERSONA,
  type PersonaGroup,
} from "../components/chatbotData";

const PERSONA_RULES: Array<{
  persona: PersonaGroup;
  match: "exact" | "contains";
  keywords: string[];
}> = [
  { persona: "student", match: "exact", keywords: ["student"] },
  { persona: "principal", match: "contains", keywords: ["principal"] },
  { persona: "management", match: "contains", keywords: ["management"] },
  { persona: "hr", match: "contains", keywords: ["hr", "human resource"] },
  {
    persona: "admin",
    match: "contains",
    keywords: ["admin head", "school admin", "administrator"],
  },
];

function normalizeRoles(roles: string): string[] {
  return roles
    .replace(/[\[\]]/g, "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

/** Mirrors chatbotApi/utils/persona_resolver.py role → persona mapping. */
export function resolvePersona(roles: string): PersonaGroup {
  const normalized = normalizeRoles(roles);

  for (const rule of PERSONA_RULES) {
    for (const role of normalized) {
      const hit =
        rule.match === "exact"
          ? rule.keywords.includes(role)
          : rule.keywords.some((kw) => role.includes(kw));
      if (hit) return rule.persona;
    }
  }

  return "teacher";
}

export function getSuggestedPrompts(roles: string): string[] {
  const persona = resolvePersona(roles);
  return SUGGESTED_PROMPTS_BY_PERSONA[persona];
}
