/**
 * Estate Complaint flow logic.
 * Extracted from AudioStreamerChatBot to keep the main component manageable.
 * Handles complaint chat API calls, exit detection, and TTS.
 */

import { aiAPI } from "../../services/api";

const COMPLAINT_ERR =
  "Sorry, there was an error processing your complaint request.";

export type ComplaintBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

/** Delay flow exit so TTS can finish (voice mode needs network + playback slack). */
export function getComplaintExitDelayMs(
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

export interface ComplaintFlowCallbacks {
  appendBotMessage: (msg: ComplaintBotMessage) => void;
  exitFlow: () => void;
  /** Exit without interrupting in-flight TTS (success/cancel in voice mode). */
  exitFlowPreserveTTS?: () => void;
  /** When provided, used for manual exit (user said "exit") - creates new session */
  exitFlowForManualExit?: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export interface ComplaintChatParams extends ComplaintFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

export function shouldExitComplaintOnError(answer: string): boolean {
  // Don't exit when bot is re-asking with available options or awaiting confirmation
  if (
    answer.includes("Select an area") ||
    answer.includes("Select a complaint type") ||
    answer.includes("Please describe") ||
    answer.includes("Ready to submit") ||
    answer.includes("complaint summary") ||
    answer.includes("couldn't match") ||
    /Reply with the (area|type) name or number/i.test(answer) ||
    /reply \*\*yes\*\*/i.test(answer)
  ) {
    return false;
  }
  return (
    answer.includes("❌") ||
    answer.toLowerCase().includes("error") ||
    answer.toLowerCase().includes("failed")
  );
}

export function shouldExitComplaintOnCancel(answer: string): boolean {
  return answer.toLowerCase().includes("submission cancelled");
}

export function shouldExitComplaintOnSuccess(answer: string): boolean {
  const lower = answer.toLowerCase();
  return (
    lower.includes("estate complaint created successfully") ||
    ((answer.includes("✅") || lower.includes("successfully")) &&
      (lower.includes("submitted") || lower.includes("created")))
  );
}

/**
 * Run complaint chat (API only).
 */
export async function runComplaintChat(params: {
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
    const data = await aiAPI.complaintChat({
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
      error: data.message || COMPLAINT_ERR,
    };
  } catch {
    return { success: false, error: COMPLAINT_ERR };
  }
}

/**
 * Handle a user message in the complaint flow: call API, update chat, TTS, exit logic.
 */
export async function handleComplaintChat(
  params: ComplaintChatParams,
): Promise<void> {
  const {
    userMessage,
    sessionId,
    userId,
    isVoiceTriggered,
    getErpContext,
    appendBotMessage,
    exitFlow,
    exitFlowPreserveTTS,
    exitFlowForManualExit,
    setProcessing,
    playTTS,
    getTTSSummary,
  } = params;

  const scheduleFlowExit = (spokenText: string) => {
    const delayMs = getComplaintExitDelayMs(spokenText, isVoiceTriggered);
    const doExit = isVoiceTriggered
      ? (exitFlowPreserveTTS ?? exitFlow)
      : exitFlow;
    setTimeout(doExit, delayMs);
  };

  try {
    const result = await runComplaintChat({
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
          const textToSpeak =
            ttsText != null && ttsText !== "" ? ttsText : getTTSSummary(answer);
          playTTS(-1, textToSpeak);
        } catch (ttsErr) {
          console.error("Complaint TTS playback failed:", ttsErr);
        }
      }

      const isExitResponse =
        answer.toLowerCase().includes("you've exited the complaint") ||
        (answer.includes("✅") && answer.toLowerCase().includes("exited"));
      if (isExitResponse) {
        (exitFlowForManualExit ?? exitFlow)();
        setProcessing(false);
        return;
      }

      if (shouldExitComplaintOnError(answer)) {
        console.log("⚠️ Complaint submission error detected, exiting flow");
        exitFlow();
      }

      if (shouldExitComplaintOnCancel(answer)) {
        console.log("Complaint cancelled, exiting flow");
        const spoken =
          ttsText != null && ttsText !== ""
            ? ttsText
            : "Submission cancelled.";
        scheduleFlowExit(spoken);
        return;
      }

      if (shouldExitComplaintOnSuccess(answer)) {
        console.log("✅ Complaint submitted successfully, exiting flow");
        const spoken =
          ttsText != null && ttsText !== ""
            ? ttsText
            : getTTSSummary(answer);
        scheduleFlowExit(spoken);
      }
    } else {
      const errMsg = result.error || COMPLAINT_ERR;
      appendBotMessage({ type: "bot", text: errMsg });
      if (isVoiceTriggered) {
        try {
          playTTS(-1, getTTSSummary(errMsg));
        } catch (ttsErr) {
          console.error("Complaint TTS playback failed:", ttsErr);
        }
      }
    }
  } catch {
    appendBotMessage({ type: "bot", text: COMPLAINT_ERR });
    if (params.isVoiceTriggered) {
      try {
        params.playTTS(-1, params.getTTSSummary(COMPLAINT_ERR));
      } catch (ttsErr) {
        console.error("Complaint TTS playback failed:", ttsErr);
      }
    }
  } finally {
    setProcessing(false);
  }
}
