// API Configuration
// If in local environment, uses VITE_LOCAL_URL, otherwise uses VITE_LIVE_URL from env

const env = import.meta.env;
export const API_BASE_URL =
  env.VITE_LIVE_URL || env.VITE_LOCAL_URL || "http://localhost:8000";
