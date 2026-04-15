/**
 * Submit-Homework flow logic.
 * Extracted from AudioStreamerChatBot to keep the main component manageable.
 * Handles diary chat API calls, file upload + attach, exit detection, and TTS.
 */

import { aiAPI } from "../../services/api";

const DIARY_ERR =
  "Sorry, there was an error processing your teacher diary request.";

export type DiaryBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface DiaryFlowCallbacks {
  appendBotMessage: (msg: DiaryBotMessage) => void;
  exitFlow: () => void;
  /** When provided, used for manual exit (user said "exit") - creates new session */
  exitFlowForManualExit?: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export interface DiaryChatParams extends DiaryFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

export function shouldExitDiaryOnError(answer: string): boolean {
  return (
    answer.includes("❌ Save failed") && !answer.includes("Please try again")
  );
}

export function shouldExitDiaryOnSuccess(answer: string): boolean {
  return answer.includes("✅") && answer.includes("saved successfully");
}

/**
 * Run diary chat (API only). Used by both text flow and file-attach flow.
 */
export async function runDiaryChat(params: {
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
    const data = await aiAPI.teacherDiaryChat({
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
      error: data.message || DIARY_ERR,
    };
  } catch (err) {
    return { success: false, error: DIARY_ERR };
  }
}

/**
 * Handle a user message in the diary flow: call API, update chat, TTS, exit logic.
 */
export async function handleDiaryChat(params: DiaryChatParams): Promise<void> {
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
    const result = await runDiaryChat({
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
          console.error("Diary TTS playback failed:", ttsErr);
        }
      }

      const isExitResponse =
        answer.toLowerCase().includes("exited the teacher_diary") ||
        (answer.includes("✅") && answer.toLowerCase().includes("exited"));
      if (isExitResponse) {
        (exitFlowForManualExit ?? exitFlow)();
        setProcessing(false);
        return;
      }

      if (shouldExitDiaryOnError(answer)) {
        console.log("⚠️ Teacher diary error detected, exiting flow");
        exitFlow();
      }

      if (shouldExitDiaryOnSuccess(answer)) {
        console.log("✅ Teacher diary saved successfully, exiting flow");
        const spokenText =
          ttsText != null && ttsText !== "" ? ttsText : getTTSSummary(answer);
        const exitDelayMs = Math.min(
          12000,
          Math.max(5000, spokenText.length * 55 + 3000),
        );
        setTimeout(exitFlow, exitDelayMs);
      }
    } else {
      const errMsg = result.error || DIARY_ERR;
      appendBotMessage({ type: "bot", text: errMsg });
      if (isVoiceTriggered) {
        try {
          playTTS(-1, getTTSSummary(errMsg));
        } catch (ttsErr) {
          console.error("Diary TTS playback failed:", ttsErr);
        }
      }
    }
  } catch {
    appendBotMessage({ type: "bot", text: DIARY_ERR });
    if (params.isVoiceTriggered) {
      try {
        params.playTTS(-1, params.getTTSSummary(DIARY_ERR));
      } catch (ttsErr) {
        console.error("Diary TTS playback failed:", ttsErr);
      }
    }
  } finally {
    setProcessing(false);
  }
}
