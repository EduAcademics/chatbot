import { aiAPI } from "../../services/api";

interface MarksFlowParams {
  userMessage: string;
  sessionId: string;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => {
    bearer_token: string;
    academic_session: string;
    branch_token: string;
  };
  appendBotMessage: (msg: any) => void;
  exitFlow: () => void;
  exitFlowForManualExit: () => void;
  setProcessing: (val: boolean) => void;
  playTTS: (idx: number, text: string) => void;
  getTTSSummary: (text: string) => string;
}

export async function runMarksChat(params: {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}) {
  const authToken = localStorage.getItem("token");
  const { academic_session, branch_token } = params.getErpContext();
  try {
    const data = await aiAPI.marksChat({
      session_id: params.sessionId || params.userId,
      user_id: params.userId,
      query: params.userMessage,
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
      error: data.message || "Something went wrong.",
    };
  } catch (err) {
    return { success: false, error: "Something went wrong." };
  }
}

export async function sendColumnSave(params: {
  columnTitle: string;
  studentData: Array<{
    uuid: string;
    mark: string | number;
    remarks: string;
  }>;
  sessionId: string;
  userId: string;
  getErpContext: () => any;
}) {
  const { columnTitle, studentData, sessionId, userId, getErpContext } = params;

  const query = `SAVE_COLUMN:${columnTitle}:${JSON.stringify(studentData)}`;

  return await runMarksChat({
    userMessage: query,
    sessionId,
    userId,
    isVoiceTriggered: false,
    getErpContext,
  });
}

export async function handleMarksChat(params: MarksFlowParams) {
  const {
    userMessage,
    sessionId,
    userId,
    isVoiceTriggered,
    getErpContext,
    appendBotMessage,
    exitFlow,
    exitFlowForManualExit,
    playTTS,
    getTTSSummary,
  } = params;

  try {
    const response = await runMarksChat({
      userMessage,
      sessionId,
      userId,
      isVoiceTriggered,
      getErpContext,
    });

    if (!response || !response.success || !response.data) {
      appendBotMessage({
        type: "bot",
        answer: "Something went wrong. Please try again.",
        activeTab: "answer",
      });
      return;
    }

    const answer = response.data.answer || "";
    const ttsText = response.data.tts_text || answer;
    const marksTable = response.data.marks_table || null;
    const columnSaved = response.data.column_saved || null;

    const botMessage: any = {
      type: "bot",
      answer,
      activeTab: "answer",
    };

    if (marksTable) {
      botMessage.marks_table = marksTable;
    }

    if (columnSaved) {
      botMessage.column_saved = columnSaved;
    }

    appendBotMessage(botMessage);

    // Play TTS if voice triggered
    if (isVoiceTriggered && ttsText) {
      const idx = Date.now();
      playTTS(idx, getTTSSummary(ttsText));
    }

    // Detect manual exit
    const isManualExit =
      answer.toLowerCase().includes("exited") ||
      answer.toLowerCase().includes("cancelled");
    if (isManualExit) {
      setTimeout(() => exitFlowForManualExit(), 500);
      return;
    }

    // Detect success completion
    const isSuccess =
      answer.includes("✅") && answer.toLowerCase().includes("all marks saved");
    if (isSuccess) {
      setTimeout(() => exitFlow(), 1000);
      return;
    }
  } catch (error) {
    console.error("Marks flow error:", error);
    appendBotMessage({
      type: "bot",
      answer: "❌ Something went wrong. Please try again.",
      activeTab: "answer",
    });
  }
}
