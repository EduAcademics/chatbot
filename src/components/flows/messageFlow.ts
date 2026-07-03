/**
 * Create-Message flow logic.
 * Extracted from AudioStreamerChatBot to keep the main component manageable.
 * Handles message chat API calls, file upload + attach, exit detection, and TTS.
 */

import { aiAPI } from "../../services/api";

const MESSAGE_ERR =
  "Sorry, there was an error processing your message request.";

/** Delay flow exit so TTS can finish (voice mode needs network + playback slack). */
export function getMessageExitDelayMs(
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

export type MessageBotMessage =
  | { type: "bot"; answer: string; activeTab: "answer" }
  | { type: "bot"; text: string };

export interface MessageFlowCallbacks {
  appendBotMessage: (msg: MessageBotMessage) => void;
  exitFlow: () => void;
  /** Exit without interrupting in-flight TTS (success/cancel in voice mode). */
  exitFlowPreserveTTS?: () => void;
  /** When provided, used for manual exit (user said "exit") - creates new session */
  exitFlowForManualExit?: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export interface MessageChatParams extends MessageFlowCallbacks {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}

export interface MessageFileUploadParams {
  file: File;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered?: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
  appendBotMessage: (msg: MessageBotMessage) => void;
  playTTS?: (index: number, text: string) => void;
  getTTSSummary?: (text: string) => string;
}

export function shouldExitMessageOnError(answer: string): boolean {
  if (
    answer.includes("Which department") ||
    answer.includes("Who should receive") ||
    answer.includes("Which class-section") ||
    /^\d+\. /m.test(answer)
  ) {
    return false;
  }
  return (
    answer.toLowerCase().includes("error") ||
    answer.toLowerCase().includes("failed")
  );
}

export function shouldExitMessageOnSuccess(answer: string): boolean {
  const lower = answer.toLowerCase();
  return (
    lower.includes("successfully") &&
    (lower.includes("sent") || lower.includes("created"))
  );
}

/**
 * Run message chat (API only). Used by both text flow and file-attach flow.
 */
export async function runMessageChat(params: {
  sessionId: string | null;
  userId: string;
  query: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}): Promise<{
  success: boolean;
  data?: { answer?: string; message_data?: unknown; tts_text?: string };
  error?: string;
}> {
  const authToken = localStorage.getItem("token");
  const { academic_session, branch_token } = params.getErpContext();
  try {
    const data = await aiAPI.messageChat({
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
      error: data.message || MESSAGE_ERR,
    };
  } catch (err) {
    return { success: false, error: MESSAGE_ERR };
  }
}

/**
 * Handle a user message in the message flow: call API, update chat, TTS, exit logic.
 */
export async function handleMessageChat(
  params: MessageChatParams,
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
    const delayMs = getMessageExitDelayMs(spokenText, isVoiceTriggered);
    const doExit = isVoiceTriggered
      ? (exitFlowPreserveTTS ?? exitFlow)
      : exitFlow;
    setTimeout(doExit, delayMs);
  };

  try {
    const result = await runMessageChat({
      sessionId,
      userId,
      query: userMessage,
      isVoiceTriggered,
      getErpContext,
    });

    if (result.success && result.data) {
      const answer = result.data.answer || "";
      const ttsText = result.data.tts_text;
      const messageData = result.data.message_data;

      appendBotMessage({ type: "bot", answer, activeTab: "answer" });

      if (isVoiceTriggered) {
        try {
          const textToSpeak =
            ttsText != null && ttsText !== "" ? ttsText : getTTSSummary(answer);
          playTTS(-1, textToSpeak);
        } catch (ttsErr) {
          console.error("Message TTS playback failed:", ttsErr);
        }
      }

      if (messageData) {
        console.log("Message data:", messageData);
      }

      const isExitResponse =
        answer.toLowerCase().includes("you've exited the message") ||
        (answer.includes("✅") && answer.toLowerCase().includes("exited"));
      if (isExitResponse) {
        (exitFlowForManualExit ?? exitFlow)();
        setProcessing(false);
        return;
      }

      if (
        answer.includes("Message cancelled") ||
        answer.includes("I've cancelled this message")
      ) {
        console.log("Message cancelled by user, exiting flow");
        const spoken =
          ttsText != null && ttsText !== ""
            ? ttsText
            : "Message cancelled.";
        scheduleFlowExit(spoken);
        return;
      }

      if (shouldExitMessageOnError(answer)) {
        console.log("⚠️ Message submission error detected, exiting flow");
        exitFlow();
      }

      if (shouldExitMessageOnSuccess(answer)) {
        console.log("✅ Message sent successfully, exiting flow");
        const spoken =
          ttsText != null && ttsText !== ""
            ? ttsText
            : getTTSSummary(answer);
        scheduleFlowExit(spoken);
      }
    } else {
      const errMsg = result.error || MESSAGE_ERR;
      appendBotMessage({ type: "bot", text: errMsg });
      if (isVoiceTriggered) {
        try {
          playTTS(-1, getTTSSummary(errMsg));
        } catch (ttsErr) {
          console.error("Message TTS playback failed:", ttsErr);
        }
      }
    }
  } catch {
    appendBotMessage({ type: "bot", text: MESSAGE_ERR });
    if (params.isVoiceTriggered) {
      try {
        params.playTTS(-1, params.getTTSSummary(MESSAGE_ERR));
      } catch (ttsErr) {
        console.error("Message TTS playback failed:", ttsErr);
      }
    }
  } finally {
    setProcessing(false);
  }
}

/**
 * Handle message file upload: upload file, add to chat, then attach via messageChat.
 */
export async function handleMessageFileUpload(
  params: MessageFileUploadParams,
): Promise<void> {
  const {
    file,
    sessionId,
    userId,
    isVoiceTriggered = false,
    getErpContext,
    appendBotMessage,
    playTTS,
    getTTSSummary,
  } = params;

  try {
    const result = await aiAPI.uploadMessageFile(file, sessionId || userId);

    if (result.status !== "success") {
      const errMsg =
        (result as { message?: string }).message ?? "Unknown error";
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

    const fileMessage = `Add file ${fileUuid} to attachments`;
    setTimeout(async () => {
      try {
        const chatResult = await runMessageChat({
          sessionId,
          userId,
          query: fileMessage,
          isVoiceTriggered: false,
          getErpContext,
        });
        if (chatResult.success && chatResult.data?.answer) {
          const answer = chatResult.data.answer;
          const ttsText = chatResult.data.tts_text;
          appendBotMessage({
            type: "bot",
            answer,
            activeTab: "answer",
          });
          if (isVoiceTriggered && playTTS) {
            try {
              const textToSpeak =
                ttsText != null && ttsText !== ""
                  ? ttsText
                  : getTTSSummary
                    ? getTTSSummary(answer)
                    : answer;
              playTTS(-1, textToSpeak);
            } catch (ttsErr) {
              console.error("Message upload TTS playback failed:", ttsErr);
            }
          }
        }
      } catch (err) {
        console.error("Error adding file to message:", err);
      }
    }, 500);
  } catch (err) {
    console.error("Message file upload error:", err);
    appendBotMessage({
      type: "bot",
      text: `File upload failed: ${(err as Error).message}`,
    });
  }
}
