/** Turn login_id / email into a friendly first-name greeting. */
export function formatDisplayName(loginId?: string | null): string | null {
  if (!loginId?.trim()) return null;
  const raw = loginId.trim();
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  const namePart = local.split(/[._-]/)[0];
  if (!namePart) return null;
  return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
}
