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
import { generateQueryTTSSummary } from "../utils/chatbotUtils";

const LEAVE_ERR = "Sorry, there was an error processing your leave request.";

// ============= TYPES =============

export type LeaveBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface LeaveFlowCallbacks {
  appendBotMessage: (msg: LeaveBotMessage) => void;
  exitFlow: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string, onEnd?: () => void) => void;
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
    setActiveFlow,
  } = params;

  try {
    // Always call backend for exit, do not hardcode exit message
    let exitDetected = false;
    if (shouldExitLeaveFlow(userMessage)) {
      exitDetected = true;
    }

    // No separate TTS welcome message; always play backend answer for TTS (see below)

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

      // TTS: always play backend answer, like assignment flow
      let ttsPlayed = false;
      if (isVoiceTriggered) {
        try {
          // If this is a successful leave submission, delay exit until TTS finishes
          if (shouldExitOnSuccess(answer)) {
            ttsPlayed = true;
            playTTS(-1, generateQueryTTSSummary(answer), () => {
              console.log("✅ Leave TTS finished, exiting flow");
              exitFlow();
              setProcessing(false);
            });
          } else {
            playTTS(-1, generateQueryTTSSummary(answer));
          }
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

      // If not voice-triggered, or TTS failed to play, exit as before
      if (shouldExitOnSuccess(answer) && (!isVoiceTriggered || !ttsPlayed)) {
        console.log("✅ Leave submitted successfully, exiting flow (no TTS)");
        setTimeout(() => {
          exitFlow();
          setProcessing(false);
        }, 1500);
      }
    } else {
      // Error response
      const errorMessage = result.error || LEAVE_ERR;
      appendBotMessage({ type: "bot", text: errorMessage });

      // TTS for error messages if voice-initiated
      if (isVoiceTriggered) {
        try {
          playTTS(-1, generateQueryTTSSummary(errorMessage));
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
        playTTS(-1, generateQueryTTSSummary(errorMessage));
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
