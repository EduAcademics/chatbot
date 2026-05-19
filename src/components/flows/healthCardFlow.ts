import { aiAPI } from "../../services/api";

export interface HealthCardData {
  height: string;
  weight: string;
  leftVision: string;
  rightVision: string;
  vaccinationRequired: string;
  dentalExamination: string;
  observation: string;
  followupAdvice: string;
  remarks: string;
}

interface HealthCardFlowParams {
  userMessage: string;
  sessionId: string;
  userId: string;
  userRoles: string[];
  isVoiceTriggered: boolean;
  getErpContext: () => {
    academic_session: string;
    branch_token: string;
  };
  appendBotMessage: (msg: any) => void;
  exitFlow: () => void;
  exitFlowForManualExit: () => void;
  scheduleUnauthorizedExit?: () => void;
  setProcessing: (val: boolean) => void;
  playTTS: (idx: number, text: string) => void;
  getTTSSummary: (text: string) => string;
  setActiveFlow: (flow: string) => void;
}

export async function runHealthCardChat(params: {
  userMessage: string;
  sessionId: string | null;
  userId: string;
  userRoles: string[];
  isVoiceTriggered: boolean;
  getErpContext: () => { academic_session: string; branch_token: string };
}) {
  const authToken = localStorage.getItem("token");
  const { academic_session, branch_token } = params.getErpContext();
  try {
    const data = await aiAPI.healthCardChat({
      session_id: params.sessionId || params.userId,
      user_id: params.userId,
      query: params.userMessage,
      bearer_token: authToken || undefined,
      academic_session,
      branch_token,
      user_roles: params.userRoles,
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

export async function sendHealthCardSave(params: {
  studentUuid: string;
  healthCardData: HealthCardData;
  sessionId: string | null;
  userId: string;
  userRoles: string[];
  getErpContext: () => { academic_session: string; branch_token: string };
}) {
  const { studentUuid, healthCardData, sessionId, userId, getErpContext } =
    params;
  const effectiveSessionId = sessionId || userId;

  console.log("🏥 Health Card Save - Session Debug:", {
    studentUuid,
    providedSessionId: sessionId,
    userId,
    effectiveSessionId,
    usingFallback: !sessionId,
  });

  const query = `SAVE_HEALTH_CARD:${studentUuid}:${JSON.stringify(healthCardData)}`;

  return await runHealthCardChat({
    userMessage: query,
    sessionId: effectiveSessionId,
    userId,
    userRoles: params.userRoles,
    isVoiceTriggered: false,
    getErpContext,
  });
}

export async function handleHealthCardChat(params: HealthCardFlowParams) {
  const {
    userMessage,
    sessionId,
    userId,
    userRoles,
    isVoiceTriggered,
    getErpContext,
    appendBotMessage,
    exitFlow,
    exitFlowForManualExit,
    scheduleUnauthorizedExit,
    playTTS,
    getTTSSummary,
    setActiveFlow,
  } = params;

  try {
    const response = await runHealthCardChat({
      userMessage,
      sessionId,
      userId,
      userRoles,
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
    const ttsText = response.data.tts_text;
    const answerLower = answer.toLowerCase();

    // Unauthorized: handle first — single append, TTS, then one delayed exit
    if (answerLower.includes("not authorized to update health")) {
      appendBotMessage({
        type: "bot",
        answer,
        activeTab: "answer",
      });

      if (isVoiceTriggered && (ttsText || answer)) {
        const textToSpeak =
          (ttsText && ttsText.trim()) || getTTSSummary(answer) || "";
        if (textToSpeak) {
          playTTS(Date.now(), textToSpeak);
        }
      }

      if (scheduleUnauthorizedExit) {
        scheduleUnauthorizedExit();
      } else {
        setTimeout(() => {
          exitFlow();
        }, 5000);
      }

      return;
    }

    const healthCardTable = response.data.health_card_table || null;
    const healthCardSaved = response.data.health_card_saved || null;
    const healthCardSections = response.data.health_card_sections || null;

    const botMessage: any = {
      type: "bot",
      answer,
      activeTab: "answer",
      session_id: sessionId,
    };

    if (
      healthCardSections &&
      Array.isArray(healthCardSections) &&
      healthCardSections.length > 0
    ) {
      botMessage.health_card_sections = healthCardSections;
    }

    if (healthCardTable) {
      botMessage.health_card_table = healthCardTable;
    }

    if (healthCardSaved) {
      botMessage.health_card_saved = healthCardSaved;
    }

    appendBotMessage(botMessage);

    const playVoiceResponse = () => {
      if (!isVoiceTriggered || (!ttsText && !answer)) return;
      const idx = Date.now();
      const textToSpeak =
        ttsText != null && ttsText !== ""
          ? ttsText
          : getTTSSummary(answer);
      playTTS(idx, textToSpeak);
    };

    if (
      answerLower.includes("you've exited the health card") ||
      (answer.includes("✅") && answerLower.includes("exited"))
    ) {
      playVoiceResponse();
      (exitFlowForManualExit ?? exitFlow)();
      return;
    }

    playVoiceResponse();

    const isAllSaved = answerLower.includes(
      "all student health cards have been saved",
    );
    if (isAllSaved) {
      exitFlow();
      return;
    }

    const isIndividualSuccess =
      answer.includes("✅") &&
      answerLower.includes("health card") &&
      answerLower.includes("updated");

    if (isIndividualSuccess) {
      setActiveFlow("health_card");
      return;
    }

    if (!answer.includes("✅")) {
      setActiveFlow("health_card");
    }
  } catch (error) {
    console.error("Health card flow error:", error);
    appendBotMessage({
      type: "bot",
      answer: "❌ Something went wrong. Please try again.",
      activeTab: "answer",
    });
  }
}
