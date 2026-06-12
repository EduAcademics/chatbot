/**
 * Library reserve-book flow logic.
 * Mirrors messageFlow structure without file upload handling.
 */

import { aiAPI } from "../../services/api";

const LIBRARY_ERR =
  "Sorry, there was an error processing your library request.";

/** Delay flow exit so TTS can finish (voice mode needs network + playback slack). */
export function getLibraryExitDelayMs(
  spokenText: string,
  isVoiceTriggered: boolean,
): number {
  if (!isVoiceTriggered) {
    return 1000;
  }
  const generationSlackMs = 3000;
  return Math.min(
    12000,
    Math.max(5000, spokenText.length * 55 + generationSlackMs),
  );
}

export type LibraryBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface LibraryFlowCallbacks {
  appendBotMessage: (msg: LibraryBotMessage) => void;
  exitFlow: () => void;
  /** When provided, used for manual exit (user said "exit") - creates new session */
  exitFlowForManualExit?: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export interface LibraryChatParams extends LibraryFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

export function shouldExitLibraryOnError(answer: string): boolean {
  if (/^\|\s*#\s*\|/.test(answer) || answer.includes("Reply with the book number")) {
    return false;
  }
  return (
    answer.toLowerCase().includes("error") ||
    answer.toLowerCase().includes("failed")
  );
}

export function shouldExitLibraryOnSuccess(answer: string): boolean {
  const lower = answer.toLowerCase();
  return lower.includes("reserved successfully");
}

/**
 * Run library chat (API only).
 */
export async function runLibraryChat(params: {
  sessionId: string | null;
  userId: string;
  query: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}): Promise<{
  success: boolean;
  data?: {
    answer?: string;
    library_data?: unknown;
    tts_text?: string;
  };
  error?: string;
}> {
  const authToken = localStorage.getItem("token");
  const { academic_session, branch_token } = params.getErpContext();
  try {
    const data = await aiAPI.libraryChat({
      session_id: params.sessionId || params.userId,
      user_id: params.userId,
      query: params.query,
      bearer_token: authToken || undefined,
      academic_session,
      branch_token,
      voice_mode: params.isVoiceTriggered,
      tts: params.isVoiceTriggered,
    });
    if (data.status === "success" && data.data) {
      return { success: true, data: data.data };
    }
    return {
      success: false,
      error: data.message || LIBRARY_ERR,
    };
  } catch {
    return { success: false, error: LIBRARY_ERR };
  }
}

/**
 * Handle a user message in the library flow: call API, update chat, TTS, exit logic.
 */
export async function handleLibraryChat(
  params: LibraryChatParams,
): Promise<void> {
  const {
    userMessage,
    sessionId,
    userId,
    isVoiceTriggered,
    getErpContext,
    appendBotMessage,
    exitFlow,
    exitFlowForManualExit,
    setProcessing,
    playTTS,
    getTTSSummary,
  } = params;

  const scheduleFlowExit = (spokenText: string) => {
    const delayMs = getLibraryExitDelayMs(spokenText, isVoiceTriggered);
    setTimeout(exitFlow, delayMs);
  };

  try {
    const result = await runLibraryChat({
      sessionId,
      userId,
      query: userMessage,
      isVoiceTriggered,
      getErpContext,
    });

    if (result.success && result.data) {
      const answer = result.data.answer || "";
      const ttsText = result.data.tts_text;
      const libraryData = result.data.library_data;

      appendBotMessage({ type: "bot", answer, activeTab: "answer" });

      if (isVoiceTriggered) {
        try {
          const textToSpeak =
            ttsText != null && ttsText !== "" ? ttsText : getTTSSummary(answer);
          playTTS(-1, textToSpeak);
        } catch (ttsErr) {
          console.error("Library TTS playback failed:", ttsErr);
        }
      }

      if (libraryData) {
        console.log("Library data:", libraryData);
      }

      const isExitResponse =
        answer.toLowerCase().includes("you've exited the library") ||
        (answer.includes("✅") && answer.toLowerCase().includes("exited"));
      if (isExitResponse) {
        (exitFlowForManualExit ?? exitFlow)();
        setProcessing(false);
        return;
      }

      if (answer.includes("I've cancelled the reservation")) {
        console.log("Library reservation cancelled by user, exiting flow");
        const spoken =
          ttsText != null && ttsText !== ""
            ? ttsText
            : "Okay, reservation cancelled.";
        scheduleFlowExit(spoken);
        return;
      }

      if (shouldExitLibraryOnError(answer)) {
        console.log("Library reservation error detected, exiting flow");
        exitFlow();
      }

      if (shouldExitLibraryOnSuccess(answer)) {
        console.log("Library book reserved successfully, exiting flow");
        const spoken =
          ttsText != null && ttsText !== ""
            ? ttsText
            : getTTSSummary(answer);
        scheduleFlowExit(spoken);
      }
    } else {
      const errMsg = result.error || LIBRARY_ERR;
      appendBotMessage({ type: "bot", text: errMsg });
      if (isVoiceTriggered) {
        try {
          playTTS(-1, getTTSSummary(errMsg));
        } catch (ttsErr) {
          console.error("Library TTS playback failed:", ttsErr);
        }
      }
    }
  } catch {
    appendBotMessage({ type: "bot", text: LIBRARY_ERR });
    if (params.isVoiceTriggered) {
      try {
        params.playTTS(-1, params.getTTSSummary(LIBRARY_ERR));
      } catch (ttsErr) {
        console.error("Library TTS playback failed:", ttsErr);
      }
    }
  } finally {
    setProcessing(false);
  }
}
