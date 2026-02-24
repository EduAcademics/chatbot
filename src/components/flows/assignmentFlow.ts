/**
 * Create-Assignment flow logic.
 * Extracted from AudioStreamerChatBot to keep the main component manageable.
 * Handles assignment chat API calls, file upload + attach, exit detection, and TTS.
 */

import { aiAPI } from "../../services/api";

const ASSIGNMENT_ERR = "Sorry, there was an error processing your assignment request.";

export type AssignmentBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface AssignmentFlowCallbacks {
  appendBotMessage: (msg: AssignmentBotMessage) => void;
  exitFlow: () => void;
  /** When provided, used for manual exit (user said "exit") - creates new session */
  exitFlowForManualExit?: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export interface AssignmentChatParams extends AssignmentFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

export interface AssignmentFileUploadParams {
  file: File;
  sessionId: string | null;
  userId: string;
  getErpContext: () => { academic_session: string; branch_token: string };
  appendBotMessage: (msg: AssignmentBotMessage) => void;
}

export function shouldExitAssignmentOnError(answer: string): boolean {
  // Don't exit when bot is re-asking with available options (e.g. after "Could not find class section")
  if (
    answer.includes("Available:") ||
    answer.includes("Options:") ||
    /Which (class|subject|type)/i.test(answer)
  ) {
    return false;
  }
  return (
    answer.includes("❌") ||
    answer.includes("error") ||
    answer.includes("failed")
  );
}

export function shouldExitAssignmentOnSuccess(answer: string): boolean {
  return (
    answer.includes("✅") &&
    answer.includes("successfully") &&
    answer.includes("created")
  );
}

/**
 * Run assignment chat (API only). Used by both text flow and file-attach flow.
 */
export async function runAssignmentChat(params: {
  sessionId: string | null;
  userId: string;
  query: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}): Promise<{
  success: boolean;
  data?: { answer?: string; assignment_data?: unknown; tts_text?: string };
  error?: string;
}> {
  const authToken = localStorage.getItem("token");
  const { academic_session, branch_token } = params.getErpContext();
  try {
    const data = await aiAPI.assignmentChat({
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
      error: data.message || ASSIGNMENT_ERR,
    };
  } catch (err) {
    return { success: false, error: ASSIGNMENT_ERR };
  }
}

/**
 * Handle a user message in the assignment flow: call API, update chat, TTS, exit logic.
 */
export async function handleAssignmentChat(params: AssignmentChatParams): Promise<void> {
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
    const result = await runAssignmentChat({
      sessionId,
      userId,
      query: userMessage,
      isVoiceTriggered,
      getErpContext,
    });

    if (result.success && result.data) {
      const answer = result.data.answer || "";
      const ttsText = result.data.tts_text;
      const assignmentData = result.data.assignment_data;

      appendBotMessage({ type: "bot", answer, activeTab: "answer" });

      if (isVoiceTriggered) {
        try {
          // Use backend tts_text (short, user-friendly) when provided; else summarize full answer
          const textToSpeak =
            ttsText != null && ttsText !== "" ? ttsText : getTTSSummary(answer);
          playTTS(-1, textToSpeak);
        } catch (ttsErr) {
          console.error("Assignment TTS playback failed:", ttsErr);
        }
      }

      if (assignmentData) {
        console.log("Assignment data:", assignmentData);
      }

      // If backend exit message detected, exit flow and create new session
      const isExitResponse =
        answer.toLowerCase().includes("you've exited the assignment") ||
        (answer.includes("✅") && answer.toLowerCase().includes("exited"));
      if (isExitResponse) {
        (exitFlowForManualExit ?? exitFlow)();
        setProcessing(false);
        return;
      }

      if (shouldExitAssignmentOnError(answer)) {
        console.log("⚠️ Assignment submission error detected, exiting flow");
        exitFlow();
      }

      if (shouldExitAssignmentOnSuccess(answer)) {
        console.log("✅ Assignment created successfully, exiting flow");
        setTimeout(exitFlow, 1000);
      }
    } else {
      const errMsg = result.error || ASSIGNMENT_ERR;
      appendBotMessage({ type: "bot", text: errMsg });
      if (isVoiceTriggered) {
        try {
          playTTS(-1, getTTSSummary(errMsg));
        } catch (ttsErr) {
          console.error("Assignment TTS playback failed:", ttsErr);
        }
      }
    }
  } catch {
    appendBotMessage({ type: "bot", text: ASSIGNMENT_ERR });
    if (params.isVoiceTriggered) {
      try {
        params.playTTS(-1, params.getTTSSummary(ASSIGNMENT_ERR));
      } catch (ttsErr) {
        console.error("Assignment TTS playback failed:", ttsErr);
      }
    }
  } finally {
    setProcessing(false);
  }
}

/**
 * Handle assignment file upload: upload file, add to chat, then attach via assignmentChat.
 */
export async function handleAssignmentFileUpload(
  params: AssignmentFileUploadParams
): Promise<void> {
  const { file, sessionId, userId, getErpContext, appendBotMessage } = params;

  try {
    const result = await aiAPI.uploadAssignmentFile(
      file,
      sessionId || userId
    );

    if (result.status !== "success") {
      const errMsg = (result as { message?: string }).message ?? "Unknown error";
      appendBotMessage({ type: "bot", text: `File upload failed: ${errMsg}` });
      return;
    }

    const fileUuid = result.data?.file_uuid;
    if (!fileUuid) {
      appendBotMessage({
        type: "bot",
        text: "⚠️ File uploaded but could not be attached. Please try uploading again.",
      });
      return;
    }

    const filename = result.data?.filename ?? file.name;

    appendBotMessage({
      type: "bot",
      text: `✅ File uploaded successfully: ${filename}\n\nType 'skip' to proceed or upload more files.`,
    });

    const fileMessage = `Add file ${fileUuid} to attachments`;
    setTimeout(async () => {
      try {
        const chatResult = await runAssignmentChat({
          sessionId,
          userId,
          query: fileMessage,
          isVoiceTriggered: false,
          getErpContext,
        });
        if (chatResult.success && chatResult.data?.answer) {
          appendBotMessage({
            type: "bot",
            answer: chatResult.data.answer,
            activeTab: "answer",
          });
        }
      } catch (err) {
        console.error("Error adding file to assignment:", err);
      }
    }, 500);
  } catch (err) {
    console.error("Assignment file upload error:", err);
    appendBotMessage({
      type: "bot",
      text: `File upload failed: ${(err as Error).message}`,
    });
  }
}
