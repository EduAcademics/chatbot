/**
 * Normalize user_roles from API (string, JSON array, or legacy Python str(list)).
 */

export function normalizeRolesToString(roles: unknown): string {
  if (roles == null) return "";
  if (Array.isArray(roles)) {
    return roles.map((x) => String(x).trim()).filter(Boolean).join(", ");
  }
  const s = String(roles).trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const inner = s.slice(1, -1).trim();
      if (!inner) return "";
      const parts = inner.split(",").map((p) =>
        p.trim().replace(/^['"]+|['"]+$/g, ""),
      );
      return parts.filter(Boolean).join(", ");
    } catch {
      return s;
    }
  }
  return s;
}

export function normalizeRolesToList(roles: unknown): string[] {
  const s = normalizeRolesToString(roles);
  if (!s) return [];
  return s.split(",").map((r) => r.trim()).filter(Boolean);
}
