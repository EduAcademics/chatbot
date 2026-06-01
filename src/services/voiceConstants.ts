/** Debounce after VAD turn-complete before auto-submit (general full voice). */
export const FULL_VOICE_TURN_DEBOUNCE_MS = 500;

/** Longer pause for flows where users list names (attendance, assignment, leave). */
export const FULL_VOICE_DICTATION_DEBOUNCE_MS = 1200;

export const VOICE_MIC_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function buildMicConstraints(
  deviceId?: string,
): boolean | MediaTrackConstraints {
  const base = { ...VOICE_MIC_AUDIO_CONSTRAINTS };
  if (deviceId && deviceId !== "default") {
    return { ...base, deviceId: { exact: deviceId } };
  }
  return base;
}
