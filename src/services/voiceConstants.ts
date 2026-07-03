/** Debounce after VAD turn-complete before auto-submit (general full voice). */
export const FULL_VOICE_TURN_DEBOUNCE_MS = 500;

/** Longer pause for flows where users list names (attendance, assignment, leave). */
export const FULL_VOICE_DICTATION_DEBOUNCE_MS = 1200;

/** De-dupe window for voice submits. Multiple paths can try to submit the same
 *  utterance (dictation debounce, VAD turn-complete, PTT release). If the same
 *  text is submitted again within this window it is ignored so the user's speech
 *  isn't sent/echoed twice. */
export const VOICE_SUBMIT_DEDUPE_MS = 4000;

/** Backstop de-dupe window applied inside handleSubmit itself (covers every
 *  submit source, not just voice). Kept short so it only catches accidental
 *  double-fires, never an intentional repeat the user types/says later. */
export const SUBMIT_DEDUPE_MS = 1500;

/** Wait before REST TTS if WebRTC pipeline does not signal audio start.
 *  Must stay above the real pipeline TTS time-to-first-byte (~1.4s observed for
 *  Azure) so a healthy pipeline isn't raced by the REST fallback (which caused
 *  double playback). Mutual-exclusion guards correctness; this only tunes latency. */
export const PIPELINE_TTS_FALLBACK_MS = 2500;

/** Max seconds to block on resolve-tts-text when no pre-resolved summary exists. */
export const TTS_RESOLVE_TIMEOUT_SEC = 1.0;

/** Keep WebRTC warm after PTT release before disconnecting.
 *  Long window so repeated PTT presses reuse the live connection (instant mic,
 *  no "Connecting microphone…"). Mic is muted between turns so STT stays idle. */
export const PTT_WARM_DISCONNECT_MS = 300_000;

/** Wait after mic off so STT can emit the last final transcript before submit.
 *  Azure's final segment can lag the mic gate; keep this generous so trailing
 *  words aren't dropped on release. */
export const PTT_RELEASE_STT_FLUSH_MS = 450;

/** Delay before background WebRTC pre-warm on chatbot mount. Kept minimal so the
 *  connection is ready before the first push-to-talk press (the handshake itself
 *  still takes ~1–3s, so starting ASAP maximizes the chance it is warm in time). */
export const VOICE_PREWARM_DELAY_MS = 0;

/** Matches backend webrtc_bot _TTS_VOICE_MAP for consistent REST + pipeline voice. */
export const TTS_VOICE_BY_LANGUAGE: Record<string, string> = {
  auto: "en-IN-NeerjaNeural",
  "en-US": "en-US-JennyNeural",
  "hi-IN": "hi-IN-SwaraNeural",
  "mr-IN": "mr-IN-AarohiNeural",
  "en-IN": "en-IN-NeerjaNeural",
};

export function resolveTtsVoice(language: string): string {
  return TTS_VOICE_BY_LANGUAGE[language] ?? TTS_VOICE_BY_LANGUAGE.auto;
}

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
