/**
 * Leave Application Flow - Interactive Dialog System
 * Handles leave application requests for employees with step-by-step guidance
 *
 * This extracts the leave application logic from AudioStreamerChatBot
 * to keep the main component manageable and follows the same pattern
 * as assignmentFlow.ts
 *
 * State management is handled entirely by the backend (SimpleLeaveAgent).
 * The frontend only handles:
 * - API calls
 * - TTS playback
 * - Exit/success detection
 *
 * Interactive Dialog Flow (backend-driven):
 * 1. choose_duration  → Ask: "Half Day, Full Day, or Long Leave?"
 * 2. date collection  → Collect date(s) based on choice
 * 3. leave_type       → Show leave quotas, pick one
 * 4. transport_check  → Check if user is transport incharge
 * 5. select_alternative → If transport incharge, select alternative
 * 6. reason           → Ask "What's the reason for your leave?"
 * 7. confirm          → Show summary, Yes/No to submit
 */

import { aiAPI } from "../../services/api";

const LEAVE_ERR = "Sorry, there was an error processing your leave request.";

// ============= TYPES =============

export type LeaveBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface LeaveFlowCallbacks {
  appendBotMessage: (msg: LeaveBotMessage) => void;
  exitFlow: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
  setActiveFlow: (flow: string) => void;
}

export interface LeaveChatParams extends LeaveFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

// ============= FLOW DETECTION =============

/**
 * Check if message indicates user wants to exit the leave flow
 */
export function shouldExitLeaveFlow(message: string): boolean {
  const exitPatterns = /^(exit|quit|stop|cancel|back|close|restart|done)$/i;
  return exitPatterns.test(message.trim());
}

/**
 * Check if leave submission had an error
 */
export function shouldStayInFlowOnError(answer: string): boolean {
  return (
    answer.includes("❌") ||
    answer.toLowerCase().includes("error") ||
    answer.toLowerCase().includes("failed") ||
    answer.toLowerCase().includes("couldn't submit") ||
    answer.toLowerCase().includes("could not submit")
  );
}

/**
 * Check if leave submission was successful
 */
export function shouldExitOnSuccess(answer: string): boolean {
  const lowerAnswer = answer.toLowerCase();
  return (
    (answer.includes("✅") && lowerAnswer.includes("submitted")) ||
    lowerAnswer.includes("request id") ||
    (lowerAnswer.includes("leave") && lowerAnswer.includes("successfully"))
  );
}

/**
 * Check if message is a leave application intent
 */
export function isLeaveApplicationIntent(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  const patterns = [
    "apply leave",
    "apply for leave",
    "need leave",
    "want leave",
    "leave application",
    "take leave",
    "request leave",
    "sick leave",
    "casual leave",
    "earned leave",
    "half day",
    "full day",
    "long leave",
  ];
  return patterns.some((p) => lowerMsg.includes(p));
}

// ============= TTS HELPERS =============

/**
 * Voice message constants for leave application flow
 * Used for TTS playback at different stages
 */
const LEAVE_VOICE_MESSAGES = {
  // Voice mode activation
  ACTIVATION: "Leave application flow activated.",

  // Initial prompt
  INITIAL_PROMPT:
    "Available leave quota and past applied leaves are shown. To apply for leave, please provide the start date, end date, and leave type.",

  // Duration choice
  DURATION_PROMPT: "You want to apply Half Day, Full Day, or Long Leave?",

  // Date prompts
  HALF_DAY_DATE: "Which date is the half-day leave for?",
  FULL_DAY_DATE: "Which date is the leave for?",
  LONG_LEAVE_DATES:
    "Please provide the start date and end date for your long leave.",

  // Leave type
  LEAVE_TYPE: "Please select the leave type.",

  // Alternative incharge
  ALTERNATIVE_INCHARGE:
    "Please select an alternative incharge from the list. You can select by typing the number or the name.",

  // Reason
  REASON: "What's the reason for your leave?",

  // Confirmation
  CONFIRM:
    "Please review the leave summary and say yes to submit or no to cancel.",

  // Success
  SUCCESS: "Your leave request has been submitted for approval.",

  // Error
  ERROR_GENERIC: "An error occurred. Please try again.",

  // Cancelled
  CANCELLED: "Leave application cancelled.",
};

/**
 * Sanitize text for speech synthesis
 * Removes markdown, emojis, and formatting artifacts
 */
function sanitizeForSpeech(text: string): string {
  if (!text) return "";
  let t = String(text);

  // Remove markdown emphasis and bullets
  t = t.replace(/\*\*/g, "");
  t = t.replace(/\*/g, "");
  t = t.replace(/•/g, "");
  t = t.replace(/\|/g, ""); // Remove table pipes
  t = t.replace(/-{2,}/g, ""); // Remove table separators

  // Remove common UI emojis used in responses
  t = t.replace(/✅|📝|🗓️|🚀|❌|⚠️|📋/g, "");

  // Slightly friendlier numeric prompts for speech
  t = t.replace(/Reply 1\/2\/3\./g, "Reply one, two, or three.");

  // Collapse whitespace
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

/**
 * Get appropriate voice message for bot response
 * Returns the TTS-friendly version of the response
 */
function getVoiceMessageForResponse(botText: string): string | null {
  const text = botText || "";
  const lowerText = text.toLowerCase();

  // Check for initial activation
  if (
    text.includes("Leave Application Flow Activated") ||
    text.includes("leave quota")
  ) {
    return (
      LEAVE_VOICE_MESSAGES.ACTIVATION +
      " " +
      LEAVE_VOICE_MESSAGES.INITIAL_PROMPT
    );
  }

  // SUCCESS - Check first as it's a terminal state
  if (
    text.includes("✅") &&
    (lowerText.includes("submitted") || lowerText.includes("request id"))
  ) {
    return LEAVE_VOICE_MESSAGES.SUCCESS;
  }

  // SUMMARY / CONFIRMATION - Check BEFORE leave type since summary contains "Leave Type"
  if (
    lowerText.includes("leave summary") ||
    lowerText.includes("submit this request") ||
    (lowerText.includes("station status") &&
      lowerText.includes("leave type") &&
      lowerText.includes("reason"))
  ) {
    // Generate a spoken summary from the actual content
    return generateSpokenSummary(text);
  }

  // Duration prompt
  if (
    lowerText.includes("half day, full day, or long leave") ||
    lowerText.includes("half day / full day / long leave")
  ) {
    return LEAVE_VOICE_MESSAGES.DURATION_PROMPT;
  }

  // Half or Full day question (new smart flow)
  if (lowerText.includes("is this a half day or full day")) {
    return "Is this a Half Day or Full Day leave?";
  }

  // Station status question
  if (
    lowerText.includes("in station or out station") ||
    (lowerText.includes("in station") &&
      lowerText.includes("out station") &&
      lowerText.includes("1.") &&
      lowerText.includes("2."))
  ) {
    return "Will you be In Station or Out Station during this leave?";
  }

  // Date prompts
  if (lowerText.includes("which date is the half-day leave for")) {
    return LEAVE_VOICE_MESSAGES.HALF_DAY_DATE;
  }
  if (
    lowerText.includes("which date is the leave for") ||
    lowerText.includes("which date is the full day leave for")
  ) {
    return LEAVE_VOICE_MESSAGES.FULL_DAY_DATE;
  }
  if (
    lowerText.includes("start date") &&
    lowerText.includes("end date") &&
    lowerText.includes("provide")
  ) {
    return LEAVE_VOICE_MESSAGES.LONG_LEAVE_DATES;
  }

  // Leave type prompt - must be asking to CHOOSE, not showing in summary
  if (
    (lowerText.includes("choose one of these options") ||
      lowerText.includes("type the leave type")) &&
    !lowerText.includes("leave summary")
  ) {
    return LEAVE_VOICE_MESSAGES.LEAVE_TYPE;
  }

  // Alternative incharge prompt - with bus/backup keywords
  if (
    (lowerText.includes("alternative incharge") ||
      lowerText.includes("bus incharge") ||
      lowerText.includes("backup")) &&
    (lowerText.includes("select") ||
      lowerText.includes("choose") ||
      lowerText.includes("reply"))
  ) {
    return LEAVE_VOICE_MESSAGES.ALTERNATIVE_INCHARGE;
  }

  // Selected backup confirmation - speak it naturally
  if (lowerText.includes("selected") && lowerText.includes("as backup")) {
    // Extract the name and speak it
    const match = text.match(/Selected\s+\*?\*?([^*]+)\*?\*?\s+as backup/i);
    if (match) {
      const name = match[1].trim();
      // Check if reason prompt follows
      if (lowerText.includes("provide the reason")) {
        return `Selected ${name} as backup. Please provide the reason for your leave.`;
      }
      // Check if confirmation follows
      if (lowerText.includes("leave summary")) {
        return `Selected ${name} as backup. ` + generateSpokenSummary(text);
      }
      return `Selected ${name} as backup.`;
    }
  }

  // Reason prompt
  if (
    lowerText.includes("provide the reason for leave") ||
    lowerText.includes("what's the reason for your leave") ||
    lowerText.includes("reason for your leave")
  ) {
    return LEAVE_VOICE_MESSAGES.REASON;
  }

  // Errors
  if (
    lowerText.includes("couldn't submit") ||
    lowerText.includes("could not submit") ||
    lowerText.includes("error occurred") ||
    lowerText.includes("failed")
  ) {
    return LEAVE_VOICE_MESSAGES.ERROR_GENERIC;
  }

  // Fallback: sanitize and return
  const fallback = sanitizeForSpeech(text);
  return fallback || null;
}

/**
 * Generate a spoken summary from the leave confirmation text
 */
function generateSpokenSummary(text: string): string {
  const parts: string[] = [];

  // Extract key information
  const stationMatch = text.match(/Station Status\s*:\s*([^\n•*]+)/i);
  const typeMatch = text.match(/Leave Type\s*:\s*([^\n•*]+)/i);
  const dateMatch = text.match(/Leave Date\s*:\s*([^\n•*]+)/i);
  const reasonMatch = text.match(/Reason\s*:\s*([^\n•*]+)/i);
  const backupMatch = text.match(/Backup In-Charge\s*:\s*([^\n•*]+)/i);

  parts.push("Leave Summary.");

  if (typeMatch) {
    parts.push(`Leave type: ${typeMatch[1].trim()}.`);
  }
  if (dateMatch) {
    parts.push(`Date: ${dateMatch[1].trim()}.`);
  }
  if (stationMatch) {
    parts.push(`Station: ${stationMatch[1].trim()}.`);
  }
  if (reasonMatch) {
    parts.push(`Reason: ${reasonMatch[1].trim()}.`);
  }
  if (backupMatch) {
    parts.push(`Backup: ${backupMatch[1].trim()}.`);
  }

  parts.push("Say Yes to submit or No to cancel.");

  return parts.join(" ");
}

/**
 * Generate concise TTS summary for leave messages
 * Converts verbose bot responses into speakable summaries
 */
export function generateLeaveTTSSummary(answer: string): string {
  // First try to get a specific voice message
  const voiceMessage = getVoiceMessageForResponse(answer);
  if (voiceMessage) {
    return voiceMessage;
  }

  const lowerAnswer = answer.toLowerCase();

  // Transport incharge alternative selection
  if (
    lowerAnswer.includes("transport vehicle incharge") ||
    lowerAnswer.includes("alternative incharge")
  ) {
    if (
      lowerAnswer.includes("available employees") ||
      lowerAnswer.includes("you can select")
    ) {
      return "You are assigned as a transport vehicle incharge so please select alternative person who can handle your duty in your absence from below";
    }
    if (
      lowerAnswer.includes("no suggested alternative") ||
      lowerAnswer.includes("no alternative employees")
    ) {
      return "You are assigned as a transport vehicle incharge but no alternative employees are available. Please contact your administrator";
    }
    return "You are assigned as a transport vehicle incharge so please select alternative person who can handle your duty in your absence";
  }

  // Asking for leave information
  if (
    lowerAnswer.includes("please provide") ||
    lowerAnswer.includes("missing information") ||
    (lowerAnswer.includes("need") &&
      (lowerAnswer.includes("date") || lowerAnswer.includes("leave type")))
  ) {
    if (
      lowerAnswer.includes("start date") ||
      lowerAnswer.includes("end date")
    ) {
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
  const cleaned = sanitizeForSpeech(answer);

  // Try to get first sentence
  const firstSentence = cleaned.split(/[.!?]/)[0].trim();
  if (firstSentence.length > 0 && firstSentence.length < 200) {
    return firstSentence;
  }

  // Fallback to first 150 characters
  return cleaned.substring(0, 150).trim() + (cleaned.length > 150 ? "..." : "");
}

// ============= MAIN FLOW HANDLER =============

/**
 * Run leave chat API call
 */
export async function runLeaveChat(params: {
  sessionId: string | null;
  userId: string;
  query: string;
  getErpContext: () => { academic_session: string; branch_token: string };
}): Promise<{
  success: boolean;
  data?: { answer?: string; leave_data?: any };
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
  } catch (err) {
    console.error("Leave chat API error:", err);
    return { success: false, error: LEAVE_ERR };
  }
}

/**
 * Handle a user message in the leave application flow
 * Calls API, updates chat, handles TTS, and manages exit logic
 *
 * The backend (SimpleLeaveAgent) handles the interactive dialog steps:
 * - Duration choice (half day / full day / long leave)
 * - Date collection
 * - Leave type selection
 * - Transport incharge check
 * - Alternative incharge selection
 * - Reason collection
 * - Confirmation
 */
export async function handleLeaveChat(params: LeaveChatParams): Promise<void> {
  const {
    userMessage,
    sessionId,
    userId,
    isVoiceTriggered,
    getErpContext,
    appendBotMessage,
    exitFlow,
    setProcessing,
    playTTS,
    getTTSSummary,
    setActiveFlow,
  } = params;

  try {
    // Always call backend for exit, do not hardcode exit message
    let exitDetected = false;
    if (shouldExitLeaveFlow(userMessage)) {
      exitDetected = true;
    }

    // TTS for leave flow is handled from the API response only (same as assignment flow).
    // No separate welcome TTS here to avoid double-speaking the same prompt.

    // Always call backend, even for exit
    const result = await runLeaveChat({
      sessionId,
      userId,
      query: userMessage,
      getErpContext,
    });

    if (result.success && result.data) {
      const answer = result.data.answer || "";
      const leaveData = result.data.leave_data;

      // Append bot message with answer
      appendBotMessage({ type: "bot", answer, activeTab: "answer" });

      // Log leave data if present
      if (leaveData) {
        console.log("Leave application data:", leaveData);
      }

      // TTS: voice-only, same as assignment flow — use backend tts_text when provided, else getTTSSummary
      if (isVoiceTriggered) {
        try {
          const ttsText = result.data.tts_text;
          const textToSpeak =
            ttsText != null && ttsText !== "" ? ttsText : getTTSSummary(answer);
          playTTS(-1, textToSpeak);
        } catch (ttsErr) {
          console.error("Leave TTS playback failed:", ttsErr);
        }
      }

      // If backend exit message detected, exit flow
      if (
        answer
          .toLowerCase()
          .includes("you've exited the leave application flow")
      ) {
        exitFlow();
        setProcessing(false);
        return;
      }

      // Handle flow state based on response
      if (shouldStayInFlowOnError(answer)) {
        console.log(
          "⚠️ Leave submission error detected, staying in flow for retry",
        );
        setActiveFlow("leave");
      }

      if (shouldExitOnSuccess(answer)) {
        console.log("✅ Leave submitted successfully, exiting flow");
        setTimeout(exitFlow, 1500);
      }
    } else {
      // Error response
      const errorMessage = result.error || LEAVE_ERR;
      appendBotMessage({ type: "bot", text: errorMessage });

      // TTS for error messages if voice-initiated (use getTTSSummary for errors)
      if (isVoiceTriggered) {
        try {
          playTTS(-1, getTTSSummary(errorMessage));
        } catch (ttsErr) {
          console.error("Leave TTS playback failed:", ttsErr);
        }
      }

      // Keep the leave flow active for retry
      setActiveFlow("leave");
    }
  } catch (err) {
    console.error("Leave flow error:", err);
    const errorMessage = LEAVE_ERR;
    appendBotMessage({ type: "bot", text: errorMessage });

    // TTS for error messages if voice-initiated
    if (isVoiceTriggered) {
      try {
        playTTS(-1, getTTSSummary(errorMessage));
      } catch (ttsErr) {
        console.error("Leave TTS playback failed:", ttsErr);
      }
    }

    // Keep the leave flow active for retry
    setActiveFlow("leave");
  } finally {
    setProcessing(false);
  }
}

// ============= WELCOME MESSAGE =============

/**
 * Get the welcome message for leave application flow
 * This is shown when the flow is first activated
 */
export function getLeaveWelcomeMessage(): string {
  return `📝 **Leave Application Flow Activated**

I'll help you apply for leave step by step.

You want to apply **Half Day**, **Full Day**, or **Long Leave**?

_(Type your choice or say the duration)_`;
}

/**
 * Get the TTS version of the welcome message
 */
export function getLeaveWelcomeTTS(): string {
  return "Leave application flow activated. You want to apply Half Day, Full Day, or Long Leave?";
}
