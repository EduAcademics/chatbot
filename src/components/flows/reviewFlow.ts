/**
 * Review flow logic.
 * Extracted from AudioStreamerChatBot to keep the main component manageable.
 * Handles review chat API calls, exit detection, and TTS.
 */

import { aiAPI } from "../../services/api";

const REVIEW_ERR = "Sorry, there was an error processing your review request.";

export type ReviewBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface ReviewFlowCallbacks {
  appendBotMessage: (msg: ReviewBotMessage) => void;
  exitFlow: () => void;
  /** When provided, used for manual exit (user said "exit") - creates new session */
  exitFlowForManualExit?: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export interface ReviewChatParams extends ReviewFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

export function shouldExitReviewOnError(answer: string): boolean {
  return answer.includes("❌") && !answer.includes("Please try again");
}

export function shouldExitReviewOnSuccess(answer: string): boolean {
  return answer.includes("✅") && answer.includes("saved successfully");
}

/**
 * Run review chat (API only).
 */
export async function runReviewChat(params: {
  sessionId: string | null;
  userId: string;
  query: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}): Promise<{
  success: boolean;
  data?: { answer?: string; tts_text?: string };
  error?: string;
}> {
  const authToken = localStorage.getItem("token");
  const { academic_session, branch_token } = params.getErpContext();
  try {
    const data = await aiAPI.reviewChat({
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
      error: data.message || REVIEW_ERR,
    };
  } catch (err) {
    return { success: false, error: REVIEW_ERR };
  }
}

/**
 * Handle a user message in the review flow: call API, update chat, TTS, exit logic.
 */
export async function handleReviewChat(
  params: ReviewChatParams,
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

  try {
    const result = await runReviewChat({
      sessionId,
      userId,
      query: userMessage,
      isVoiceTriggered,
      getErpContext,
    });

    if (result.success && result.data) {
      const answer = result.data.answer || "";
      const ttsText = result.data.tts_text;

      appendBotMessage({ type: "bot", answer, activeTab: "answer" });

      if (isVoiceTriggered) {
        try {
          // Use backend tts_text (short, user-friendly) when provided; else summarize full answer
          const textToSpeak =
            ttsText != null && ttsText !== "" ? ttsText : getTTSSummary(answer);
          playTTS(-1, textToSpeak);
        } catch (ttsErr) {
          console.error("Review TTS playback failed:", ttsErr);
        }
      }

      // If backend exit message detected, exit flow and create new session
      const isExitResponse =
        answer.toLowerCase().includes("you've exited the review") ||
        (answer.includes("✅") && answer.toLowerCase().includes("exited"));
      if (isExitResponse) {
        (exitFlowForManualExit ?? exitFlow)();
        setProcessing(false);
        return;
      }

      if (shouldExitReviewOnError(answer)) {
        console.log("⚠️ Review error detected, exiting flow");
        exitFlow();
      }

      if (shouldExitReviewOnSuccess(answer)) {
        console.log("✅ Review saved successfully, exiting flow");
        setTimeout(exitFlow, 1000);
      }
    } else {
      const errMsg = result.error || REVIEW_ERR;
      appendBotMessage({ type: "bot", text: errMsg });
      if (isVoiceTriggered) {
        try {
          playTTS(-1, getTTSSummary(errMsg));
        } catch (ttsErr) {
          console.error("Review TTS playback failed:", ttsErr);
        }
      }
    }
  } catch {
    appendBotMessage({ type: "bot", text: REVIEW_ERR });
    if (params.isVoiceTriggered) {
      try {
        params.playTTS(-1, params.getTTSSummary(REVIEW_ERR));
      } catch (ttsErr) {
        console.error("Review TTS playback failed:", ttsErr);
      }
    }
  } finally {
    setProcessing(false);
  }
}
