/**
 * Build-time config from Amplify / Vite (`import.meta.env`).
 * Set `VITE_*` variables in the Amplify console; avoid hardcoding URLs or secrets here.
 */

const env = import.meta.env;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Backend API
// ---------------------------------------------------------------------------
export const API_BASE_URL = trimTrailingSlash(
  (env.VITE_API_BASE_URL ||
    env.VITE_LIVE_URL ||
    env.VITE_LOCAL_URL ||
    "") as string,
);

// ---------------------------------------------------------------------------
// ERP API (course progress, class sections, file links in chat)
// ---------------------------------------------------------------------------
export const ERP_API_BASE_URL = trimTrailingSlash(
  (env.VITE_ERP_API_BASE_URL || "") as string,
);

/** Match uploaded file URLs from the configured ERP host (for previews in chat). */
function buildErpFilesPathRegex(): RegExp {
  const raw = (env.VITE_ERP_API_BASE_URL || "").trim();
  if (!raw) return /(?!)/;
  try {
    const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
    const u = new URL(normalized);
    const hostEscaped = u.host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${hostEscaped}/v1/files/`, "i");
  } catch {
    return /(?!)/;
  }
}

export const ERP_FILES_URL_RE = buildErpFilesPathRegex();

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
export const WS_BASE_URL = trimTrailingSlash((env.VITE_WS_BASE_URL || "") as string);

// ---------------------------------------------------------------------------
// WebRTC / Pipecat bot
// ---------------------------------------------------------------------------
export const BOT_START_URL = (env.VITE_BOT_START_URL || "").trim();
export const BOT_START_PUBLIC_API_KEY = (
  env.VITE_BOT_START_PUBLIC_API_KEY || ""
).trim();

// ---------------------------------------------------------------------------
// ICE servers (STUN / TURN) for WebRTC – only added when env vars are set
// ---------------------------------------------------------------------------
function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const stun = (env.VITE_STUN_URL || "").trim();
  if (stun) {
    servers.push({ urls: stun });
  }
  const turn = (env.VITE_TURN_URL || "").trim();
  if (turn) {
    const entry: RTCIceServer = { urls: turn };
    const u = (env.VITE_TURN_USERNAME || "").trim();
    const c = (env.VITE_TURN_CREDENTIAL || "").trim();
    if (u) entry.username = u;
    if (c) entry.credential = c;
    servers.push(entry);
  }
  return servers;
}

export const ICE_SERVERS = getIceServers();

// ---------------------------------------------------------------------------
// Headers: academic session & branch (localStorage overrides env, for deep links)
// ---------------------------------------------------------------------------
export function getAcademicSessionForRequest(): string {
  if (typeof localStorage !== "undefined") {
    const fromStore = localStorage.getItem("academic_session")?.trim();
    if (fromStore) return fromStore;
  }
  return (env.VITE_ACADEMIC_SESSION || "").trim();
}

export function getBranchTokenForRequest(): string {
  if (typeof localStorage !== "undefined") {
    const fromStore = localStorage.getItem("branch_token")?.trim();
    if (fromStore) return fromStore;
  }
  return (env.VITE_BRANCH_TOKEN || "").trim();
}
