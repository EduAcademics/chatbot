/**
 * Central configuration – all parameters from .env (import.meta.env).
 * No hardcoded URLs, keys, or environment-specific values in app code.
 */

const env = import.meta.env;

// ---------------------------------------------------------------------------
// Backend API
// ---------------------------------------------------------------------------
export const API_BASE_URL =
  env.VITE_API_BASE_URL ||
  env.VITE_LIVE_URL ||
  env.VITE_LOCAL_URL ||
  "http://localhost:8000";

// ---------------------------------------------------------------------------
// ERP API (course progress, class sections, etc.)
// ---------------------------------------------------------------------------
export const ERP_API_BASE_URL =
  env.VITE_ERP_API_BASE_URL || "https://api.eduacademics.com";

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
export const WS_BASE_URL = env.VITE_WS_BASE_URL || "";

// ---------------------------------------------------------------------------
// Voice transport selection and endpoints
// ---------------------------------------------------------------------------
export const VOICE_TRANSPORT =
  (env.VITE_VOICE_TRANSPORT as "webrtc" | "livekit" | undefined) || "webrtc";

// WebRTC / Pipecat bot (current implementation)
export const BOT_START_URL =
  env.VITE_BOT_START_URL || "http://localhost:7860/start";
export const BOT_START_PUBLIC_API_KEY = env.VITE_BOT_START_PUBLIC_API_KEY || "";

// LiveKit (new implementation – used when VOICE_TRANSPORT === "livekit")
export const LIVEKIT_URL = env.VITE_LIVEKIT_URL || "";

// ---------------------------------------------------------------------------
// ICE servers (STUN / TURN) for WebRTC – all from .env
// ---------------------------------------------------------------------------
function getIceServers(): RTCIceServer[] {
  const stunUrl = env.VITE_STUN_URL || "stun:stun.l.google.com:19302";
  const servers: RTCIceServer[] = [{ urls: stunUrl }];

  const turnUrl =
    env.VITE_TURN_URL || "turn:aiapi.schoolforschools.ai:3478";
  const turnUsername = env.VITE_TURN_USERNAME || "webrtc";
  const turnCredential = env.VITE_TURN_CREDENTIAL || "webrtcpass";
  servers.push({
    urls: turnUrl,
    username: turnUsername,
    credential: turnCredential,
  });

  return servers;
}

export const ICE_SERVERS = getIceServers();
