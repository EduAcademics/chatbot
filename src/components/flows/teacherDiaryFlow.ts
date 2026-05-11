/**
 * Teacher diary flow logic.
 * Handles teacher diary chat API calls, exit detection, and TTS.
 */

import { aiAPI } from "../../services/api";

const TEACHER_DIARY_ERR =
  "Sorry, there was an error processing your diary request.";

export type TeacherDiaryBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface TeacherDiaryFlowCallbacks {
  appendBotMessage: (msg: TeacherDiaryBotMessage) => void;
  exitFlow: () => void;
  /** When provided, used for manual exit (user said "exit") - creates new session */
  exitFlowForManualExit?: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export interface TeacherDiaryChatParams extends TeacherDiaryFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

export function shouldExitTeacherDiaryOnSuccess(answer: string): boolean {
  return (
    answer.includes("✅") &&
    answer.toLowerCase().includes("diary") &&
    answer.toLowerCase().includes("saved successfully")
  );
}

export async function runTeacherDiaryChat(params: {
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
      error: data.message || TEACHER_DIARY_ERR,
    };
  } catch (err) {
    return { success: false, error: TEACHER_DIARY_ERR };
  }
}

export async function handleTeacherDiaryChat(
  params: TeacherDiaryChatParams,
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
    const result = await runTeacherDiaryChat({
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

      if (isVoiceTriggered || shouldExitTeacherDiaryOnSuccess(answer)) {
        try {
          const textToSpeak =
            ttsText != null && ttsText !== "" ? ttsText : getTTSSummary(answer);
          playTTS(-1, textToSpeak);
        } catch (ttsErr) {
          console.error("Teacher diary TTS playback failed:", ttsErr);
        }
      }

      const isExitResponse =
        answer.toLowerCase().includes("you've exited the teacher_diary") ||
        answer.toLowerCase().includes("you've exited the teacher diary") ||
        (answer.includes("✅") && answer.toLowerCase().includes("exited"));
      if (isExitResponse) {
        (exitFlowForManualExit ?? exitFlow)();
        setProcessing(false);
        return;
      }

      if (shouldExitTeacherDiaryOnSuccess(answer)) {
        setTimeout(exitFlow, 1000);
      }
    } else {
      const errMsg = result.error || TEACHER_DIARY_ERR;
      appendBotMessage({ type: "bot", text: errMsg });
      if (isVoiceTriggered) {
        try {
          playTTS(-1, getTTSSummary(errMsg));
        } catch (ttsErr) {
          console.error("Teacher diary TTS playback failed:", ttsErr);
        }
      }
    }
  } catch {
    appendBotMessage({ type: "bot", text: TEACHER_DIARY_ERR });
    if (params.isVoiceTriggered) {
      try {
        params.playTTS(-1, params.getTTSSummary(TEACHER_DIARY_ERR));
      } catch (ttsErr) {
        console.error("Teacher diary TTS playback failed:", ttsErr);
      }
    }
  } finally {
    setProcessing(false);
  }
}
