/**
 * Apply-Leave flow logic.
 * Extracted from AudioStreamerChatBot to keep the main component manageable.
 * Handles leave chat API calls, TTS summaries, and exit-on-success/retry-on-error.
 */

import { aiAPI } from "../../services/api";

const LEAVE_ERR = "Sorry, there was an error processing your leave request.";

export type LeaveBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface LeaveFlowCallbacks {
  appendBotMessage: (msg: LeaveBotMessage) => void;
  exitFlow: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export interface LeaveChatParams extends LeaveFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  /** This message was sent via voice (e.g. mic). */
  isVoiceTriggered: boolean;
  /** When true, play TTS for this response (flow was started by voice). */
  voiceInitiatedFlow: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

export function shouldExitLeaveOnError(answer: string): boolean {
  return (
    answer.includes("❌") ||
    answer.includes("error") ||
    answer.includes("failed")
  );
}

export function shouldExitLeaveOnSuccess(answer: string): boolean {
  return (
    answer.includes("✅") &&
    answer.includes("successfully") &&
    answer.includes("submitted")
  );
}

/**
 * Generate concise TTS summary for leave messages (voice-friendly, no balance numbers, etc.).
 */
export function generateLeaveTTSSummary(answer: string): string {
  const lowerAnswer = answer.toLowerCase();

  // Station selection (first question in apply leave flow)
  if (
    lowerAnswer.includes("station") &&
    (lowerAnswer.includes("in station or out station") ||
      lowerAnswer.includes("1) in station"))
  ) {
    return "Is this in station or out station leave? Say 1 for in station, 2 for out station.";
  }

  // Leave type options: speak only names, no balance (voice-friendly)
  if (
    (lowerAnswer.includes("leave type") &&
      lowerAnswer.includes("choose one of these options")) ||
    (lowerAnswer.includes("leave type") && lowerAnswer.includes("balance:"))
  ) {
    const nameMatches = answer.matchAll(/\d+\)\s*\*\*([^*]+)\*\*/g);
    const names = Array.from(nameMatches)
      .map((m) => m[1].trim())
      .filter(Boolean);
    if (names.length > 0) {
      return `Leave type. Choose one. ${names.join(". ")}. Type the leave type name.`;
    }
  }

  // Transport incharge alternative selection
  if (
    lowerAnswer.includes("transport vehicle incharge") ||
    lowerAnswer.includes("alternative incharge")
  ) {
    if (
      lowerAnswer.includes("select who will cover") ||
      lowerAnswer.includes("reply with a number")
    ) {
      return "You are transport incharge. Select who will cover during your leave. Reply with a number, a name, or say skip.";
    }
    if (
      lowerAnswer.includes("no replacements available") ||
      lowerAnswer.includes("no alternative")
    ) {
      return "You are transport incharge. No replacements available. Contact your administrator.";
    }
    return "You are transport incharge. Select who will cover during your leave. Reply with a number, name, or skip.";
  }

  // Asking for leave information
  if (
    lowerAnswer.includes("please provide") ||
    lowerAnswer.includes("missing information") ||
    (lowerAnswer.includes("need") &&
      (lowerAnswer.includes("date") || lowerAnswer.includes("leave type")))
  ) {
    if (lowerAnswer.includes("start date") || lowerAnswer.includes("end date")) {
      return "Please provide the start date and end date for your leave";
    }
    if (lowerAnswer.includes("leave type")) {
      return "Please specify the type of leave you want to apply for";
    }
    if (lowerAnswer.includes("reason") || lowerAnswer.includes("description")) {
      return "Please provide a reason or description for your leave";
    }
    return "Please provide the required leave information";
  }

  // Leave validation or summary
  if (
    lowerAnswer.includes("leave summary") ||
    lowerAnswer.includes("review") ||
    lowerAnswer.includes("confirm")
  ) {
    return "Please review your leave details and confirm if everything is correct";
  }

  // Success messages
  if (
    lowerAnswer.includes("successfully") &&
    lowerAnswer.includes("submitted")
  ) {
    return "Leave application submitted successfully. Your request has been sent for approval";
  }

  // Error messages
  if (lowerAnswer.includes("error") || lowerAnswer.includes("failed")) {
    if (
      lowerAnswer.includes("alternative incharge") ||
      lowerAnswer.includes("transport")
    ) {
      return "Please provide alternative transport incharge before submitting";
    }
    return "An error occurred. Please check your leave details and try again";
  }

  // Default: return first sentence or first 100 characters, cleaned
  const cleaned = answer
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/📝|✅|❌|⚠️|•/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const firstSentence = cleaned.split(/[.!?]/)[0].trim();
  if (firstSentence.length > 0 && firstSentence.length < 200) {
    return firstSentence;
  }

  return cleaned.substring(0, 150).trim() + (cleaned.length > 150 ? "..." : "");
}

/**
 * Run leave chat (API only).
 */
export async function runLeaveChat(params: {
  sessionId: string | null;
  userId: string;
  query: string;
  getErpContext: () => { academic_session: string; branch_token: string };
}): Promise<{
  success: boolean;
  data?: { answer?: string; leave_data?: unknown };
  error?: string;
}> {
  const authToken = localStorage.getItem("token");
  const { academic_session, branch_token } = params.getErpContext();
  try {
    const data = await aiAPI.leaveChat({
      session_id: params.sessionId || params.userId,
      user_id: params.userId,
      query: params.query,
      bearer_token: authToken || undefined,
      academic_session,
      branch_token,
    });
    if (data.status === "success" && data.data) {
      return { success: true, data: data.data };
    }
    return {
      success: false,
      error: data.message || LEAVE_ERR,
    };
  } catch {
    return { success: false, error: LEAVE_ERR };
  }
}

/**
 * Handle a user message in the leave flow: call API, update chat, TTS, exit/retry logic.
 */
export async function handleLeaveChat(params: LeaveChatParams): Promise<void> {
  const {
    userMessage,
    sessionId,
    userId,
    isVoiceTriggered,
    voiceInitiatedFlow,
    getErpContext,
    appendBotMessage,
    exitFlow,
    setProcessing,
    playTTS,
    getTTSSummary,
  } = params;

  const shouldPlayTTS = isVoiceTriggered || voiceInitiatedFlow;

  try {
    const result = await runLeaveChat({
      sessionId,
      userId,
      query: userMessage,
      getErpContext,
    });

    if (result.success && result.data) {
      const answer = result.data.answer || "";
      const leaveData = result.data.leave_data;

      appendBotMessage({ type: "bot", answer, activeTab: "answer" });

      if (shouldPlayTTS) {
        try {
          playTTS(-1, getTTSSummary(answer));
        } catch (ttsErr) {
          console.error("Leave TTS playback failed:", ttsErr);
        }
      }

      if (leaveData) {
        console.log("Leave application data:", leaveData);
      }

      // On error answer, stay in flow for retry (do not call exitFlow)
      if (shouldExitLeaveOnError(answer)) {
        console.log("⚠️ Leave submission error detected, staying in flow for retry");
      }

      // On success, exit the flow after a short delay
      if (shouldExitLeaveOnSuccess(answer)) {
        console.log("✅ Leave submitted successfully, exiting flow");
        setTimeout(exitFlow, 1000);
      }
    } else {
      const errMsg = result.error || LEAVE_ERR;
      appendBotMessage({ type: "bot", text: errMsg });
      if (shouldPlayTTS) {
        try {
          playTTS(-1, getTTSSummary(errMsg));
        } catch (ttsErr) {
          console.error("Leave TTS playback failed:", ttsErr);
        }
      }
      // Keep flow active for retry (caller keeps activeFlow as "leave")
    }
  } catch {
    appendBotMessage({ type: "bot", text: LEAVE_ERR });
    if (shouldPlayTTS) {
      try {
        playTTS(-1, getTTSSummary(LEAVE_ERR));
      } catch (ttsErr) {
        console.error("Leave TTS playback failed:", ttsErr);
      }
    }
    // Keep flow active for retry
  } finally {
    setProcessing(false);
  }
}
