import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TabType, FlowType } from "../types";
import { isExitResponse, generateQueryTTSSummary } from "../utils/chatbotUtils";
import {
  aiAPI,
  userAPI,
  leaveApprovalAPI,
  getAIHeaders,
} from "../../services/api";
import { API_BASE_URL } from "../../config/api";
import { WebRTCAudioService } from "../../services/webrtcAudio";
import { handleAssignmentChat } from "../flows/assignmentFlow";
import {
  handleAttendanceChat,
  handleAttendanceImageUpload,
  INITIAL_ATTENDANCE_STATE,
  generateAttendanceTTSSummary,
} from "../flows/attendanceFlow";
import type {
  AttendanceState,
  AttendanceFlowCallbacks,
  ClassInfo,
  AttendanceRecord,
} from "../flows/attendanceFlow";
import { handleLeaveChat } from "../flows/leaveApplicationFlow";
import type { RefObject } from "react";

export interface UseChatbotReturn {
  showClassInfoModal: boolean;
  handleClassInfoCancel: () => void;
  handleClassInfoConfirm: (classInfo: {
    class_: string;
    section: string;
    date: string;
  }) => Promise<void>;
  menuRef: RefObject<HTMLDivElement | null>;
  isMenuOpen: boolean;
  setIsMenuOpen: (v: boolean) => void;
  routerMode: "manual" | "auto" | "llm";
  setRouterMode: (v: "manual" | "auto" | "llm") => void;
  setAutoRouting: (v: boolean) => void;
  handleFlowExit: (options?: { newSession?: boolean }) => void;
  setUserOptionSelected: (v: boolean) => void;
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  activeFlow: FlowType;
  setActiveFlow: (v: FlowType) => void;
  attendanceStep: "class_info" | "student_details" | "completed";
  setAttendanceStep: (
    v: "class_info" | "student_details" | "completed",
  ) => void;
  setPendingClassInfo: (v: ClassInfo | null) => void;
  hoveredMenuItem: string | null;
  setHoveredMenuItem: (v: string | null) => void;
  hoverTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
  getErpContext: () => { academic_session: string; branch_token: string };
  sessionId: string;
  userId: string;
  activeFlowRef: RefObject<FlowType>;
  setIsProcessing: (v: boolean) => void;
  setLoadingLeaveRequests: (v: boolean) => void;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  setSelectedDeviceId: (v: string) => void;
  languages: { label: string; value: string }[];
  selectedLanguage: string;
  setSelectedLanguage: (v: string) => void;
  chatBoxRef: RefObject<HTMLDivElement | null>;
  chatHistory: any[];
  isProcessing: boolean;
  ttsLoading: number | null;
  editingMessageIndex: number | null;
  setEditingMessageIndex: (v: number | null) => void;
  attendanceData: AttendanceRecord[];
  setAttendanceData: (v: AttendanceRecord[]) => void;
  classInfo: ClassInfo | null;
  setClassInfo: (v: ClassInfo | null) => void;
  showCorrectionBox: number | null;
  setShowCorrectionBox: (v: number | null) => void;
  feedbackComment: { [idx: number]: string };
  setFeedbackComment: React.Dispatch<
    React.SetStateAction<{ [idx: number]: string }>
  >;
  correctionBoxRef: RefObject<HTMLDivElement | null>;
  handlePlayTTS: (
    idx: number,
    text: string,
    isQuery?: boolean,
  ) => Promise<void>;
  handleSendFeedback: (
    idx: number,
    type: "Approved" | "Rejected",
    comment?: string,
  ) => Promise<void>;
  handleAttendanceDataChange: (
    index: number,
    field: string,
    value: string,
  ) => void;
  handleAddStudent: () => void;
  handleRemoveStudent: (index: number) => void;
  handleSaveAttendance: (messageIndex: number) => void;
  handleUnifiedAttendanceApproval: (
    messageIndex?: number,
    attendanceType?: "text" | "image" | "voice",
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any,
  ) => Promise<void>;
  handleTextAttendanceRejection: () => void;
  leaveApprovalRequests: any[];
  setLeaveApprovalRequests: (v: any[]) => void;
  loadingLeaveRequests: boolean;
  rejectReason: { [key: string]: string };
  setRejectReason: (v: { [key: string]: string }) => void;
  inputText: string;
  setInputText: (v: string) => void;
  isRecording: boolean;
  fullVoiceMode: boolean;
  setFullVoiceMode: (v: boolean) => void;
  isVoiceActive: boolean;
  handleSubmit: (overrideMessage?: string) => Promise<void>;
  startStreaming: (useFullVoice?: boolean) => Promise<void>;
  stopStreaming: (skipSubmit?: boolean) => Promise<void>;
  pendingClassInfo: ClassInfo | null;
  attendanceFlowState: AttendanceState;
  getAttendanceFlowCallbacks: () => AttendanceFlowCallbacks;
  setPendingImageFile: (v: File | null) => void;
  setShowClassInfoModal: (v: boolean) => void;
  uploadFile: (file: File) => Promise<any>;
  activeVoiceButtonRef: RefObject<"audio" | "mic" | null>;
}

export function useChatbot({
  userId,
  roles,
  email,
}: {
  userId: string;
  roles: string;
  email: string;
}): UseChatbotReturn {
  const webrtcServiceRef = useRef<WebRTCAudioService | null>(null);
  const lastInterimTextRef = useRef<string>("");
  const finalTextRef = useRef<string>("");

  const isVoiceTriggeredRequestRef = useRef<boolean>(false);

  // ── suppressNextTTS: set true before handleFlowExit on user-triggered exit
  //    so the exit-confirmation TTS message is skipped.
  //    Used by leaveApplicationFlow's exitFlow callback.
  let suppressNextTTS = false;

  /**
   * Clears all frontend flow and session state.
   * Called when exit is detected from backend or query errors.
   */
  const handleFrontendExit = () => {
    handleFlowExit({ newSession: true });
  };

  const leaveVoiceInitiatedRef = useRef<boolean>(false);
  const attendanceVoiceInitiatedRef = useRef<boolean>(false);

  const [userOptionSelected, setUserOptionSelected] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeVoiceButtonRef = useRef<"audio" | "mic" | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputText, setInputText] = useState("");
  const [chatHistory, setChatHistory] = useState<
    {
      type: "user" | "bot";
      text?: string;
      answer?: string;
      references?: any[];
      mongodbquery?: string[];
      activeTab?: TabType;
      feedback?: "Approved" | "Rejected";
      feedbackMessage?: string;
      attendance_summary?: any[];
      class_info?: any;
      buttons?: { label: string; action: () => void }[];
      bulkattandance?: boolean;
      finish_collecting?: boolean;
      classSections?: any[];
      courseProgress?: any;
      classSection?: {
        classId: string;
        sectionId: string;
        className?: string;
        sectionName?: string;
      };
    }[]
  >([]);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const [ttsLoading, setTtsLoading] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState<{
    [idx: number]: string;
  }>({});
  const [showCorrectionBox, setShowCorrectionBox] = useState<number | null>(
    null,
  );
  const [activeFlow, setActiveFlow] = useState<FlowType>("none");
  const [sessionId, setSessionId] = useState<string>(
    () =>
      localStorage.getItem("sessionId") ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  );
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const attendanceDataRef = useRef<AttendanceRecord[]>([]);
  const [attendanceStep, setAttendanceStep] = useState<
    "class_info" | "student_details" | "completed"
  >("class_info");
  const [pendingClassInfo, setPendingClassInfo] = useState<ClassInfo | null>(
    null,
  );
  const [attendanceFlowState, setAttendanceFlowState] =
    useState<AttendanceState>(INITIAL_ATTENDANCE_STATE);
  const [, _setIsProcessingImage] = useState(false);

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const classInfoRef = useRef<ClassInfo | null>(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(
    null,
  );
  const [showClassInfoModal, setShowClassInfoModal] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [leaveApprovalRequests, setLeaveApprovalRequests] = useState<any[]>([]);
  const [loadingLeaveRequests, setLoadingLeaveRequests] = useState(false);
  const [rejectReason, setRejectReason] = useState<{ [key: string]: string }>(
    {},
  );

  const [autoRouting, setAutoRouting] = useState<boolean>(true);
  const [routerMode, setRouterMode] = useState<"manual" | "auto" | "llm">(
    "llm",
  );
  const [_detectedFlow, setDetectedFlow] = useState<string | null>(null);
  const [_classificationConfidence, setClassificationConfidence] =
    useState<number>(0);
  const [fullVoiceAutoSubmitTimer, setFullVoiceAutoSubmitTimer] =
    useState<ReturnType<typeof setTimeout> | null>(null);
  const [fullVoiceMode, setFullVoiceMode] = useState<boolean>(false);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const currentTTSAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsRequestIdRef = useRef<number>(0);
  const turnCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [_lastVoiceInputTime, setLastVoiceInputTime] = useState<number>(0);
  const activeFlowRef = useRef<FlowType>("none");

  const getErpContext = () => {
    const academic_session =
      localStorage.getItem("academic_session") || "2025-26";
    const branch_token = localStorage.getItem("branch_token") || "demo";
    return { academic_session, branch_token };
  };

  const languages = [
    { label: "Auto Detect", value: "auto" },
    { label: "English (US)", value: "en-US" },
    { label: "Hindi (India)", value: "hi-IN" },
    { label: "Marathi (India)", value: "mr-IN" },
  ];

  useEffect(() => {
    if (chatHistory.length === 0) {
      const welcomeMessage = {
        type: "bot" as const,
        answer:
          "Hello! I'm Sofisto, your school assistant.\nHow can I help you today?",
        activeTab: "answer" as const,
        feedback: undefined,
        references: undefined,
        mongodbquery: undefined,
      };
      setChatHistory([welcomeMessage]);
    }
  }, []);

  useEffect(() => {
    const fetchMicrophones = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      setDevices(mics);
      stream.getTracks().forEach((track) => track.stop());
    };
    fetchMicrophones();
  }, []);

  useEffect(() => {
    const fetchUserSession = async () => {
      try {
        const data = await userAPI.fetch({ email });
        if (data.status === "success" && data.session_id) {
          setSessionId(data.session_id);
        }
      } catch (err) {
        // ignore
      }
    };
    fetchUserSession();
  }, [userId]);

  useEffect(() => {
    activeFlowRef.current = activeFlow;
  }, [activeFlow]);

  useEffect(() => {
    attendanceDataRef.current = attendanceData;
  }, [attendanceData]);

  useEffect(() => {
    classInfoRef.current = classInfo;
  }, [classInfo]);

  const interruptTTS = () => {
    ttsRequestIdRef.current += 1;
    console.log(`TTS interrupted - new request ID: ${ttsRequestIdRef.current}`);

    if (currentTTSAudioRef.current) {
      const audio = currentTTSAudioRef.current;
      console.log("Interrupting TTS playback", {
        paused: audio.paused,
        currentTime: audio.currentTime,
        readyState: audio.readyState,
        ended: audio.ended,
        requestId: (audio as any)._requestId,
      });
      audio.pause();
      audio.currentTime = 0;

      const url = (audio as any)._ttsUrl;
      if (url) {
        URL.revokeObjectURL(url);
        (audio as any)._ttsUrl = null;
      }

      currentTTSAudioRef.current = null;
      webrtcServiceRef.current?.interruptBotAudio();
    }

    setTtsLoading(null);
  };

  /**
   * Centralized flow exit: interrupt TTS, clear flow-specific state, set activeFlow to none.
   * @param options.newSession - if true, generate new sessionId
   */
  const handleFlowExit = (options?: { newSession?: boolean }) => {
    const flow = activeFlowRef.current;
    console.log("handleFlowExit:", { flow, newSession: options?.newSession });

    interruptTTS();

    if (
      flow === "attendance" ||
      flow === "voice_attendance" ||
      flow === "full_voice_attendance"
    ) {
      setAttendanceStep("class_info");
      setAttendanceFlowState(INITIAL_ATTENDANCE_STATE);
      setAttendanceData([]);
      setClassInfo(null);
      setPendingClassInfo(null);
      setEditingMessageIndex(null);
      attendanceVoiceInitiatedRef.current = false;
      setAutoRouting(true);
    } else if (flow === "leave") {
      leaveVoiceInitiatedRef.current = false;
    } else if (flow === "leave_approval") {
      setLeaveApprovalRequests([]);
    }

    activeFlowRef.current = "none";
    setActiveFlow("none");
    setIsProcessing(false);

    if (options?.newSession) {
      const newSessionId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      localStorage.setItem("sessionId", newSessionId);
      console.log("New session ID on exit:", newSessionId);
    }
  };

  // ── UNIFIED EXIT COMMAND HANDLER ─────────────────────────────────────────
  // Called from BOTH manual text and voice paths when an exit keyword is detected.
  // Generates a new session ID synchronously, resets flow state, adds the
  // standard exit message to chat. Does NOT call the backend.
  const handleExitCommand = useCallback(
    (userText?: string) => {
      if (userText) {
        setChatHistory((prev) => [...prev, { type: "user", text: userText }]);
      }
      setInputText("");
      const newSessionId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      localStorage.setItem("sessionId", newSessionId);
      handleFlowExit({ newSession: false });
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "✅ Exited. How can I help you next?",
        },
      ]);
      console.log("Exit handled. New session ID:", newSessionId);
    },
    [handleFlowExit, setChatHistory, setSessionId],
  );

  const startStreaming = async (useFullVoice = false) => {
    activeVoiceButtonRef.current = "audio";
    console.log("Audio button - set mode to audio");
    try {
      lastInterimTextRef.current = "";
      finalTextRef.current = "";

      const webrtcService = new WebRTCAudioService();
      webrtcServiceRef.current = webrtcService;

      await webrtcService.connect(
        selectedLanguage,
        {
          onTranscript: (() => {
            let lastSubmittedInput = "";
            return (text: string, isFinal: boolean) => {
              const trimmed = text.trim();
              if (!trimmed) return;
              console.log(
                "Transcript in mode:",
                activeVoiceButtonRef.current,
                text,
              );

              if (useFullVoice) {
                interruptTTS();
              }

              if (isFinal) {
                finalTextRef.current = finalTextRef.current
                  ? finalTextRef.current + " " + trimmed
                  : trimmed;
                lastInterimTextRef.current = "";
                setInputText(finalTextRef.current);
              } else {
                lastInterimTextRef.current = trimmed;
                const displayText = finalTextRef.current
                  ? finalTextRef.current + " " + trimmed
                  : trimmed;
                setInputText(displayText);
              }

              const useFullVoiceTimer =
                activeFlow === "full_voice_attendance" ||
                (activeFlow === "assignment" && useFullVoice) ||
                (activeFlow === "leave" && useFullVoice);
              if (useFullVoiceTimer) {
                setLastVoiceInputTime(Date.now());

                if (fullVoiceAutoSubmitTimer) {
                  clearTimeout(fullVoiceAutoSubmitTimer);
                }

                const currentText = isFinal
                  ? finalTextRef.current
                  : finalTextRef.current + " " + trimmed;
                const timer = setTimeout(async () => {
                  const finalInput = currentText.trim();
                  if (
                    !finalInput ||
                    isProcessing ||
                    finalInput === lastSubmittedInput
                  )
                    return;
                  lastSubmittedInput = finalInput;
                  setFullVoiceAutoSubmitTimer(null);
                  setInputText(finalInput);
                  isVoiceTriggeredRequestRef.current = true;
                  try {
                    await handleSubmit(finalInput);
                  } finally {
                    isVoiceTriggeredRequestRef.current = false;
                  }
                }, 3000);
                setFullVoiceAutoSubmitTimer(timer);
              }
            };
          })(),
          onError: (error: Error) => {
            console.error("WebRTC error:", error);
            setIsRecording(false);
            setIsVoiceActive(false);
          },
          onConnected: () => {
            setIsRecording(true);
          },
          onDisconnected: () => {
            setIsRecording(false);
            setIsVoiceActive(false);
            console.log("WebRTC disconnected");
          },
          onTurnComplete: () => {
            if (!useFullVoice || !finalTextRef.current.trim() || isProcessing)
              return;
            const useFullVoiceTimer =
              activeFlow === "full_voice_attendance" ||
              (activeFlow === "assignment" && useFullVoice);
            if (useFullVoiceTimer) return;
            if (turnCompleteTimerRef.current)
              clearTimeout(turnCompleteTimerRef.current);
            turnCompleteTimerRef.current = setTimeout(async () => {
              turnCompleteTimerRef.current = null;
              const finalInput = finalTextRef.current.trim();
              if (!finalInput || isProcessing) return;
              lastInterimTextRef.current = "";
              finalTextRef.current = "";
              setInputText(finalInput);

              // ── VOICE EXIT CHECK ──────────────────────────────────────────
              // Intercept exit keywords BEFORE sending to backend.
              // Uses activeFlowRef (not activeFlow state) for current value in closure.
              const exitKw = [
                "exit",
                "quit",
                "stop",
                "cancel",
                "back",
                "close",
                "restart",
                "done",
              ];
              const normVoice = finalInput
                .toLowerCase()
                .replace(/^[.!?,;:'"]+|[.!?,;:'"]+$/g, "")
                .trim();
              if (
                exitKw.includes(normVoice) &&
                activeFlowRef.current !== "none" &&
                activeFlowRef.current !== "query"
              ) {
                console.log(
                  "Exit command detected in voice flow:",
                  activeFlowRef.current,
                );
                handleExitCommand(finalInput);
                return;
              }
              // ── END VOICE EXIT CHECK ──────────────────────────────────────

              isVoiceTriggeredRequestRef.current = true;
              try {
                await handleSubmit(finalInput);
              } finally {
                isVoiceTriggeredRequestRef.current = false;
              }
            }, 800);
          },
          onVoiceActivity: (isActive: boolean) => {
            setIsVoiceActive(isActive);
            if (isActive && useFullVoice) {
              interruptTTS();
            }
          },
        },
        useFullVoice,
      );
    } catch (error) {
      console.error("Failed to start WebRTC streaming:", error);
      setIsRecording(false);
      setIsVoiceActive(false);
    }
  };

  const stopStreaming = async (skipSubmit = false) => {
    activeVoiceButtonRef.current = null;
    if (turnCompleteTimerRef.current) {
      clearTimeout(turnCompleteTimerRef.current);
      turnCompleteTimerRef.current = null;
    }
    if (fullVoiceAutoSubmitTimer) {
      clearTimeout(fullVoiceAutoSubmitTimer);
      setFullVoiceAutoSubmitTimer(null);
    }
    if (webrtcServiceRef.current) {
      await webrtcServiceRef.current.disconnect();
      webrtcServiceRef.current = null;
    }

    lastInterimTextRef.current = "";
    finalTextRef.current = "";
    setIsRecording(false);
    setIsVoiceActive(false);

    if (skipSubmit) return;

    isVoiceTriggeredRequestRef.current = true;
    try {
      await handleSubmit();
    } finally {
      isVoiceTriggeredRequestRef.current = false;
    }
  };

  const uploadFile = async (file: File) => {
    if (activeFlow !== "attendance") throw new Error("Upload not allowed");

    if (file.type.startsWith("image/")) {
      throw new Error("Image processing requires class information");
    } else {
      return await uploadRegularFile(file);
    }
  };

  const uploadRegularFile = async (file: File) => {
    return await aiAPI.uploadFile({
      file,
      session_id: sessionId,
    });
  };

  // @ts-expect-error - Kept for future use
  const _uploadAttendanceImage = async (
    file: File,
    classInfo: { class_: string; section: string; date: string },
  ) => {
    try {
      const result = await aiAPI.processAttendanceImage({
        file,
        session_id: sessionId,
        class_: classInfo.class_,
        section: classInfo.section,
        date: classInfo.date,
      });

      if (result.status === "success" && result.data) {
        return {
          message: result.data.message,
          data: {
            attendance_summary: result.data.attendance_summary,
            class_info: result.data.class_info,
            ocr_text: result.data.ocr_text,
            bulkattandance: result.data.bulkattandance,
            finish_collecting: result.data.finish_collecting,
          },
        };
      } else {
        if (result.message && result.message.includes("vision-capable model")) {
          return {
            message:
              "Image processing is not available with the current model. Please provide attendance data as text instead.",
            data: {
              attendance_summary: [],
              class_info: classInfo,
              ocr_text: "",
              bulkattandance: false,
              finish_collecting: false,
              fallback_message:
                "Please type the attendance data directly. For example: 'Mark all present for Class 6 A on 2025-10-08' or list individual students.",
            },
          };
        }
        throw new Error(result.message || "Image processing failed");
      }
    } catch (err) {
      console.error("Error processing attendance image:", err);
      return {
        message:
          "Image processing failed. Please provide attendance data as text instead.",
        data: {
          attendance_summary: [],
          class_info: classInfo,
          ocr_text: "",
          bulkattandance: false,
          finish_collecting: false,
          fallback_message:
            "You can type the attendance data directly. For example: 'Mark all present for Class 6 A on 2025-10-08' or list individual students.",
        },
      };
    }
  };

  const classifyQuery = async (
    message: string,
  ): Promise<{
    flow: string;
    confidence: number;
    entities: any;
  }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/ai/classify-query`, {
        method: "POST",
        headers: getAIHeaders(),
        body: JSON.stringify({
          query: message,
          user_id: userId,
          user_roles: roles ? roles.split(",") : [],
        }),
      });

      const data = await response.json();

      if (data.status === "success") {
        const { flow, confidence, entities } = data.data;

        console.log("Query Classification:", {
          query: message,
          detectedFlow: flow,
          confidence: `${(confidence * 100).toFixed(0)}%`,
          entities,
        });

        return { flow, confidence, entities };
      }

      return { flow: "query", confidence: 0.8, entities: {} };
    } catch (error) {
      console.error("Classification error:", error);
      return { flow: "query", confidence: 0.8, entities: {} };
    }
  };

  const handleSubmit = async (overrideMessage?: string) => {
    const userMessage = (overrideMessage ?? inputText).trim();
    if (!userMessage) return;

    console.log("handleSubmit START:", {
      userMessage,
      activeFlow,
      userOptionSelected,
      autoRouting,
    });

    setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
    setInputText("");
    setIsProcessing(true);

    // ── MANUAL EXIT CHECK ─────────────────────────────────────────────────────
    // Intercept exit keywords BEFORE any API call.
    // Normalize: trim, collapse whitespace, lowercase, strip punctuation edges.
    const exitKeywords = ["exit", "cancel", "restart", "quit", "stop", "done"];
    const normalizedForExit = userMessage
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/^[.!?,;:'"]+|[.!?,;:'"]+$/g, "")
      .trim();
    const isExitCommand = exitKeywords.some(
      (keyword) => normalizedForExit === keyword,
    );

    if (isExitCommand && activeFlow !== "none" && activeFlow !== "query") {
      console.log("Exit command detected, exiting flow:", activeFlow);
      handleExitCommand(userMessage);
      setIsProcessing(false);
      return;
    }
    // ── END MANUAL EXIT CHECK ─────────────────────────────────────────────────

    let targetFlow = activeFlow;
    let classificationResult = null;

    const inAttendanceFlow =
      activeFlow === "attendance" &&
      attendanceStep === "student_details" &&
      pendingClassInfo;
    const inVoiceAttendanceFlow =
      activeFlow === "voice_attendance" &&
      attendanceStep === "student_details" &&
      pendingClassInfo;

    const newFlowKeywords = [
      "mark attendance",
      "take attendance",
      "attendance for",
      "apply leave",
      "apply for leave",
      "need leave",
      "want leave",
      "create assignment",
      "give assignment",
      "new assignment",
      "show me",
      "list all",
      "show",
      "list",
      "course progress",
      "syllabus",
      "view",
      "display",
    ];
    const looksLikeNewRequest = newFlowKeywords.some((keyword) =>
      userMessage.toLowerCase().includes(keyword),
    );

    const inLeave = activeFlowRef.current === "leave" || activeFlow === "leave";
    const inAssignment =
      activeFlowRef.current === "assignment" || activeFlow === "assignment";
    const inLeaveFlow = inLeave && !looksLikeNewRequest;
    const inAssignmentFlow = inAssignment && !looksLikeNewRequest;

    console.log("Auto-routing check:", {
      autoRouting,
      activeFlow,
      userOptionSelected,
      attendanceStep,
      pendingClassInfo,
      inAttendanceFlow,
      inVoiceAttendanceFlow,
      inLeaveFlow,
      inAssignmentFlow,
      looksLikeNewRequest,
      message: userMessage,
    });

    if (
      inAttendanceFlow ||
      inVoiceAttendanceFlow ||
      inLeaveFlow ||
      inAssignmentFlow
    ) {
      console.log("Staying in current flow (multi-step process active)");
      targetFlow = activeFlowRef.current;
      setDetectedFlow(null);
    } else if (autoRouting) {
      const simpleResponses = [
        "yes",
        "no",
        "ok",
        "okay",
        "skip",
        "approve",
        "reject",
        "continue",
        "sick",
        "casual",
        "earned",
        "medical",
        "urgent",
        "personal",
        "maternity",
        "paternity",
        "today",
        "tomorrow",
        "yesterday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ];
      const isSimpleResponse = simpleResponses.includes(
        userMessage.toLowerCase().trim(),
      );

      if (
        isSimpleResponse &&
        activeFlowRef.current !== "none" &&
        activeFlowRef.current !== "query"
      ) {
        console.log(
          "Simple response detected, keeping current flow:",
          activeFlowRef.current,
        );
        targetFlow = activeFlowRef.current;
      } else if (
        activeFlowRef.current !== "none" &&
        activeFlowRef.current !== "query" &&
        userMessage.length < 50 &&
        !looksLikeNewRequest
      ) {
        console.log(
          "Short response in active flow, staying in:",
          activeFlowRef.current,
        );
        targetFlow = activeFlowRef.current;
      } else {
        console.log("Running classification...");
        try {
          const normalized = userMessage
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .trim();
          const tokens = normalized.split(/\s+/).filter(Boolean);
          const hasLeaveToken =
            tokens.includes("leave") || tokens.includes("leaves");
          const approvalTokens = ["approval", "approve", "approvals"];
          const hasApprovalToken = approvalTokens.some((t) =>
            tokens.includes(t),
          );

          if (hasLeaveToken && hasApprovalToken) {
            console.log(
              "Lexical override: forcing leave_approval based on tokens",
              { tokens },
            );
            classificationResult = {
              flow: "leave_approval",
              confidence: 1,
            } as any;
            targetFlow = "leave_approval" as FlowType;
          } else {
            classificationResult = await classifyQuery(userMessage);
            console.log("Classification complete:", classificationResult);
            targetFlow = classificationResult.flow as FlowType;
          }

          if (targetFlow === ("assignment_create" as any)) {
            targetFlow = "assignment";
          } else if (targetFlow === ("assignment_submit" as any)) {
            targetFlow = "assignment";
          }
        } catch (error) {
          console.error("Classification error:", error);
          targetFlow = "query";
        }
      }

      console.log("Target flow determined:", targetFlow);
      setDetectedFlow(targetFlow);

      if (classificationResult) {
        setClassificationConfidence(classificationResult.confidence);

        if (classificationResult.confidence < 0.25) {
          console.warn("Low classification confidence, defaulting to query");
          targetFlow = "query";
        }
      }

      setUserOptionSelected(true);

      if (
        targetFlow === "attendance" ||
        targetFlow === "voice_attendance" ||
        targetFlow === "full_voice_attendance"
      ) {
        console.log("Initializing unified attendance flow state");
        setAttendanceStep("class_info");
        setPendingClassInfo(null);
        setAttendanceFlowState(INITIAL_ATTENDANCE_STATE);

        try {
          if (
            isVoiceTriggeredRequestRef.current === true &&
            (targetFlow === "attendance" ||
              targetFlow === "voice_attendance" ||
              targetFlow === "full_voice_attendance")
          ) {
            attendanceVoiceInitiatedRef.current = true;
          }
        } catch (ttsErr) {
          console.error("TTS initialization failed:", ttsErr);
        }
      }

      const isNewFlowInitialization =
        (classificationResult &&
          (activeFlow === "none" || activeFlow === "query") &&
          targetFlow !== "none" &&
          targetFlow !== "query") ||
        (classificationResult &&
          activeFlow !== targetFlow &&
          activeFlow !== "none" &&
          activeFlow !== "query" &&
          targetFlow !== activeFlow);

      if (targetFlow === "assignment" && isNewFlowInitialization) {
        console.log("Initializing assignment flow state");
        activeFlowRef.current = "assignment";
        setActiveFlow("assignment");
        setAttendanceData([]);
        attendanceDataRef.current = [];
        setAttendanceStep("class_info");
        setPendingClassInfo(null);
        setAttendanceFlowState(INITIAL_ATTENDANCE_STATE);
        setClassInfo(null);
        classInfoRef.current = null;
        setLeaveApprovalRequests([]);
        setLoadingLeaveRequests(false);
        setRejectReason({});
        if (!isVoiceTriggeredRequestRef.current) {
          setFullVoiceMode(false);
          setIsVoiceActive(false);
        }
        setPendingImageFile(null);
        setEditingMessageIndex(null);
        setShowClassInfoModal(false);
        setDetectedFlow(null);
        setRouterMode("llm");
        setAutoRouting(true);
        console.log("Processing first assignment message");
      }

      if (targetFlow === "leave" && isNewFlowInitialization) {
        console.log("Initializing leave flow state");
        activeFlowRef.current = "leave";
        setActiveFlow("leave");
        setAttendanceData([]);
        attendanceDataRef.current = [];
        setAttendanceStep("class_info");
        setPendingClassInfo(null);
        setAttendanceFlowState(INITIAL_ATTENDANCE_STATE);
        setClassInfo(null);
        classInfoRef.current = null;
        setLeaveApprovalRequests([]);
        setLoadingLeaveRequests(false);
        setRejectReason({});
        if (!isVoiceTriggeredRequestRef.current) {
          setFullVoiceMode(false);
          setIsVoiceActive(false);
        }
        setPendingImageFile(null);
        setEditingMessageIndex(null);
        setShowClassInfoModal(false);
        setDetectedFlow(null);
        setRouterMode("llm");
        setAutoRouting(true);
        if (isVoiceTriggeredRequestRef.current === true) {
          leaveVoiceInitiatedRef.current = true;
          console.log(
            "Leave flow voice-initiated: TTS will play for leave responses",
          );
        }
        isVoiceTriggeredRequestRef.current = false;
        console.log("Leave flow initialized, continuing to API call...");
      }
    } else {
      console.log("Using current activeFlow:", activeFlow);
    }

    if (!userOptionSelected && targetFlow === "none") {
      const promptText =
        "Please select an option from the menu, or I'll try to detect what you need automatically. Try asking something like 'Mark attendance for class 6A' or 'Apply for leave tomorrow'.";
      setChatHistory((prev) => [...prev, { type: "bot", text: promptText }]);
      try {
        if (isVoiceTriggeredRequestRef.current === true) {
          void handlePlayTTS(-1, generateQueryTTSSummary(promptText));
        }
      } catch (ttsErr) {
        console.error("TTS playback failed:", ttsErr);
      }
      setIsProcessing(false);
      return;
    }

    console.log("Routing to flow:", targetFlow);
    console.log("Current attendance step:", attendanceStep);
    console.log("Pending class info:", pendingClassInfo);

    if (autoRouting) {
      activeFlowRef.current = targetFlow;
      setActiveFlow(targetFlow);
    }

    if (
      targetFlow === "attendance" &&
      attendanceStep === "student_details" &&
      pendingClassInfo
    ) {
      console.log("Continuing attendance at student_details step");
    }

    if (targetFlow === "query") {
      let answerForTts = "";
      try {
        const data = await aiAPI.queryHandler({
          user_id: userId,
          user_roles: roles,
          query: userMessage,
        });
        if (data.status === "success" && data.data) {
          answerForTts = data.data?.answer ?? "";
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              answer: data.data?.answer,
              references: data.data?.references,
              mongodbquery: data.data?.mongodbquery,
              activeTab: "answer",
            },
          ]);
          if (isExitResponse(data.data)) {
            handleFrontendExit();
          } else if ((data.data as any)?.flow_name) {
            setActiveFlow((data.data as any).flow_name as FlowType);
          }
        } else if (data.status === "error" && data.message) {
          answerForTts = data.message;
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: data.message },
          ]);
          if (isExitResponse(data)) {
            handleFrontendExit();
          }
        } else {
          answerForTts = "No response from AI.";
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: "No response from AI." },
          ]);
          if (isExitResponse(data)) {
            handleFrontendExit();
          }
        }
        try {
          if (isVoiceTriggeredRequestRef.current === true && answerForTts) {
            void handlePlayTTS(-1, generateQueryTTSSummary(answerForTts), true);
          }
        } catch (ttsErr) {
          console.error("Query TTS playback failed:", ttsErr);
        }
      } catch (err) {
        const errorMessage = "Sorry, there was an error processing your query.";
        setChatHistory((prev) => [
          ...prev,
          { type: "bot", text: errorMessage },
        ]);
        try {
          if (isVoiceTriggeredRequestRef.current === true) {
            void handlePlayTTS(-1, generateQueryTTSSummary(errorMessage), true);
          }
        } catch (ttsErr) {
          console.error("Query TTS playback failed:", ttsErr);
        }
      } finally {
        setIsProcessing(false);
      }
    } else if (
      targetFlow === "attendance" ||
      targetFlow === "voice_attendance" ||
      targetFlow === "full_voice_attendance"
    ) {
      try {
        await handleAttendanceChat({
          userMessage,
          sessionId: sessionId,
          userId,
          isVoiceTriggered: attendanceVoiceInitiatedRef.current === true,
          callbacks: getAttendanceFlowCallbacks(),
        });
      } catch (err) {
        console.error("Attendance flow error:", err);
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: "Sorry, there was an error processing your attendance request. Please try again.",
          },
        ]);
        if (attendanceVoiceInitiatedRef.current) {
          void handlePlayTTS(
            -1,
            "Error processing attendance. Please try again.",
          );
        }
        setIsProcessing(false);
      }
    } else if (targetFlow === "leave") {
      let leaveMessageViaVoice = false;
      if (
        isVoiceTriggeredRequestRef.current === true ||
        leaveVoiceInitiatedRef.current === true
      ) {
        leaveMessageViaVoice = true;
        leaveVoiceInitiatedRef.current = true;
        isVoiceTriggeredRequestRef.current = false;
      }
      await handleLeaveChat({
        userMessage,
        sessionId,
        userId,
        isVoiceTriggered: leaveMessageViaVoice,
        getErpContext,
        appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
        exitFlow: () => {
          suppressNextTTS = true;
          handleFlowExit({ newSession: false });
        },
        setProcessing: setIsProcessing,
        playTTS: (idx, text, onEnd) => handlePlayTTS(idx, text, false, onEnd),
        setActiveFlow: (flow: string) => setActiveFlow(flow as FlowType),
      });
    } else if (targetFlow === "assignment") {
      await handleAssignmentChat({
        userMessage,
        sessionId,
        userId,
        isVoiceTriggered: isVoiceTriggeredRequestRef.current === true,
        getErpContext,
        appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
        exitFlow: () => handleFlowExit({ newSession: false }),
        setProcessing: setIsProcessing,
        playTTS: (idx, text) => void handlePlayTTS(idx, text),
        getTTSSummary: generateQueryTTSSummary,
      });
    } else if (targetFlow === "course_progress") {
      try {
        const authToken = localStorage.getItem("token");
        const { academic_session, branch_token } = getErpContext();

        const response = await aiAPI.courseProgressChat({
          session_id: sessionId,
          query: userMessage,
          bearer_token: authToken || undefined,
          academic_session,
          branch_token,
        });

        if (response.status === "success" && response.data) {
          const botMessage: any = {
            type: "bot",
            text:
              response.data.answer || "How can I help with course progress?",
          };

          if (response.data.course_progress) {
            botMessage.courseProgress = response.data.course_progress;
            botMessage.classSection = response.data.class_section;
          }

          if (
            response.data.class_sections &&
            response.data.class_sections.length > 0
          ) {
            botMessage.classSectionsOptions = response.data.class_sections;
          }

          setChatHistory((prev) => [...prev, botMessage]);

          if (
            isVoiceTriggeredRequestRef.current === true &&
            response.data.tts_text
          ) {
            try {
              void handlePlayTTS(-1, response.data.tts_text);
            } catch (ttsErr) {
              console.error("TTS playback failed:", ttsErr);
            }
          }
        } else {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text:
                response.message ||
                "Failed to process course progress request.",
            },
          ]);
        }
      } catch (err: any) {
        console.error("Error in course progress flow:", err);
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: `Error: ${err.message || "Unknown error occurred"}`,
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    } else if (targetFlow === "leave_approval") {
      if (leaveApprovalRequests.length === 0 && !loadingLeaveRequests) {
        try {
          setLoadingLeaveRequests(true);
          const authToken = localStorage.getItem("token");
          const { academic_session, branch_token } = getErpContext();

          const response = await leaveApprovalAPI.fetchPendingRequests({
            user_id: userId,
            page: 1,
            limit: 50,
            bearer_token: authToken || undefined,
            academic_session,
            branch_token,
          });

          if (response.status === 200 && response.data) {
            setLeaveApprovalRequests(response.data.leaveRequests || []);
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                answer: `📋 **Leave Approval Dashboard**\n\nFound **${response.data.leaveRequests.length}** pending leave request(s) for your approval.\n\nPlease review each request below and take action by either:\n- ✅ **Approve** - Click the green "Approve" button\n- ❌ **Reject** - Enter a rejection reason and click the red "Reject" button`,
                activeTab: "answer" as const,
              },
            ]);

            try {
              if (
                isVoiceTriggeredRequestRef.current === true &&
                targetFlow === "leave_approval"
              ) {
                const count = (response.data.leaveRequests || []).length || 0;
                let speech = "";
                if (count > 0) {
                  speech = `Leave Approval Dashboard. Found ${count} pending leave request${
                    count === 1 ? "" : "s"
                  } for your approval. Please review each request and take action.`;
                } else {
                  speech = `Leave Approval Dashboard. Found 0 pending leave requests for your approval.`;
                }
                void handlePlayTTS(-1, speech);
              }
            } catch (ttsErr) {
              console.error("TTS playback failed:", ttsErr);
            }
          } else {
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                answer: `✅ **No Pending Requests**\n\nThere are currently no pending leave requests requiring your approval.\n\nAll leave requests have been processed or there are no new requests at this time.`,
                activeTab: "answer" as const,
              },
            ]);
          }
        } catch (err: any) {
          console.error("Error fetching leave approval requests:", err);
          const errorMessage =
            err.message ||
            err.response?.data?.message ||
            "Unknown error occurred";
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: `❌ **Error Loading Leave Requests**\n\nSorry, there was an error fetching leave approval requests.\n\n**Error:** ${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
            },
          ]);
        } finally {
          setLoadingLeaveRequests(false);
          setIsProcessing(false);
        }
      } else {
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: "You're in the Leave Approval flow. Please use the approve/reject buttons on the leave requests above to take action.",
          },
        ]);
        setIsProcessing(false);
      }
    }
  };

  const handlePlayTTS = async (
    idx: number,
    text: string,
    _isQuery: boolean = false,
    onEnd?: () => void,
  ) => {
    if (suppressNextTTS) {
      suppressNextTTS = false;
      if (onEnd) onEnd();
      return;
    }
    interruptTTS();

    ttsRequestIdRef.current += 1;
    const thisRequestId = ttsRequestIdRef.current;

    console.log(
      `TTS Request #${thisRequestId} started for: "${text.substring(0, 50)}..."`,
    );

    setTtsLoading(idx);
    let audioUrl: string | null = null;
    try {
      const uniqueId = `tts_${Date.now()}_${thisRequestId}`;
      const reader = await aiAPI.textToSpeech({
        text,
        uuid_question: uniqueId,
        skip_insight: true,
      });

      if (ttsRequestIdRef.current !== thisRequestId) {
        console.log(
          `TTS Request #${thisRequestId} cancelled (newer request #${ttsRequestIdRef.current} exists)`,
        );
        setTtsLoading(null);
        return;
      }

      if (!reader) throw new Error("No stream");
      const audioChunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (value) audioChunks.push(value);
        done = streamDone;

        if (ttsRequestIdRef.current !== thisRequestId) {
          console.log(
            `TTS Request #${thisRequestId} cancelled during streaming`,
          );
          setTtsLoading(null);
          return;
        }
      }

      if (ttsRequestIdRef.current !== thisRequestId) {
        console.log(`TTS Request #${thisRequestId} cancelled before playback`);
        setTtsLoading(null);
        return;
      }

      const audioBlob = new Blob(audioChunks as BlobPart[], {
        type: "audio/wav",
      });
      audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      (audio as any)._ttsUrl = audioUrl;
      (audio as any)._requestId = thisRequestId;

      currentTTSAudioRef.current = audio;

      audio.onended = () => {
        if (currentTTSAudioRef.current === audio) {
          currentTTSAudioRef.current = null;
        }
        const url = (audio as any)._ttsUrl;
        if (url) {
          URL.revokeObjectURL(url);
          (audio as any)._ttsUrl = null;
        }
        setTtsLoading(null);
        if (onEnd) onEnd();
      };

      audio.onerror = (error) => {
        console.error("TTS audio error:", error);
        if (currentTTSAudioRef.current === audio) {
          currentTTSAudioRef.current = null;
        }
        const url = (audio as any)._ttsUrl;
        if (url) {
          URL.revokeObjectURL(url);
          (audio as any)._ttsUrl = null;
        }
        setTtsLoading(null);
      };

      if (ttsRequestIdRef.current !== thisRequestId) {
        console.log(
          `TTS Request #${thisRequestId} cancelled right before play`,
        );
        URL.revokeObjectURL(audioUrl);
        setTtsLoading(null);
        return;
      }

      console.log(`TTS Request #${thisRequestId} playing`);
      try {
        await audio.play();
      } catch (playError) {
        console.error("TTS playback error:", playError);
        if (currentTTSAudioRef.current === audio) {
          currentTTSAudioRef.current = null;
        }
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        setTtsLoading(null);
      }
    } catch (err) {
      console.error("TTS generation error:", err);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      currentTTSAudioRef.current = null;
      setTtsLoading(null);
      if (ttsRequestIdRef.current === thisRequestId) {
        console.error("Failed to play audio:", err);
      }
    }
  };

  const handleSendFeedback = async (
    idx: number,
    type: "Approved" | "Rejected",
    comment?: string,
  ) => {
    const feedbackCommentValue = comment ?? "";
    try {
      const data = await aiAPI.feedback({
        message_index: idx,
        feedback: type,
        comment: feedbackCommentValue,
      });
      setChatHistory((prev) =>
        prev.map((msg, i) =>
          i === idx && msg.type === "bot"
            ? { ...msg, feedback: type, feedbackMessage: data.message }
            : msg,
        ),
      );
      setFeedbackComment((prev) => ({ ...prev, [idx]: "" }));
      setShowCorrectionBox(null);
    } catch (err) {
      setChatHistory((prev) =>
        prev.map((msg, i) =>
          i === idx && msg.type === "bot"
            ? { ...msg, feedbackMessage: "Failed to send feedback." }
            : msg,
        ),
      );
    }
  };

  const getAttendanceFlowCallbacks = (): AttendanceFlowCallbacks => ({
    appendBotMessage: (msg) => {
      setChatHistory((prev) => [...prev, { ...msg, type: "bot" }]);
    },
    updateLastBotMessage: (msg) => {
      setChatHistory((prev) => {
        const lastIndex = prev.length - 1;
        if (lastIndex >= 0 && prev[lastIndex].type === "bot") {
          const updated = [...prev];
          updated[lastIndex] = { ...updated[lastIndex], ...msg };
          return updated;
        }
        return prev;
      });
    },
    setAttendanceState: (partial) => {
      setAttendanceFlowState((prev) => ({ ...prev, ...partial }));
    },
    getAttendanceState: () => attendanceFlowState,
    setGlobalAttendanceData: (data) => setAttendanceData(data),
    setGlobalClassInfo: (info) => setClassInfo(info),
    getGlobalAttendanceData: () => attendanceDataRef.current,
    getGlobalClassInfo: () => classInfoRef.current,
    setEditingMessageIndex: (index) => setEditingMessageIndex(index),
    getChatHistoryLength: () => chatHistory.length,
    exitFlow: () => handleFlowExit({ newSession: false }),
    setProcessing: setIsProcessing,
    playTTS: (index, text) => void handlePlayTTS(index, text),
  });

  const handleAttendanceDataChange = (
    index: number,
    field: string,
    value: string,
  ) => {
    const updatedData = [...attendanceData];
    updatedData[index] = { ...updatedData[index], [field]: value };
    setAttendanceData(updatedData);
  };

  const handleAddStudent = () => {
    const newStudent: AttendanceRecord = {
      student_name: "",
      attendance_status: "Present",
    };
    setAttendanceData([...attendanceData, newStudent]);
  };

  const handleRemoveStudent = (index: number) => {
    const updatedData = attendanceData.filter((_, i) => i !== index);
    setAttendanceData(updatedData);
  };

  const handleClassInfoConfirm = async (classInfo: {
    class_: string;
    section: string;
    date: string;
  }) => {
    if (pendingImageFile) {
      const classInfoObj: ClassInfo = {
        class_: classInfo.class_,
        section: classInfo.section,
        date: classInfo.date,
      };
      await handleAttendanceImageUpload({
        file: pendingImageFile,
        sessionId: sessionId || userId || "",
        userId,
        classInfo: classInfoObj,
        isVoiceTriggered: false,
        callbacks: getAttendanceFlowCallbacks(),
      });
    }
    setShowClassInfoModal(false);
    setPendingImageFile(null);
  };

  const handleClassInfoCancel = () => {
    setShowClassInfoModal(false);
    setPendingImageFile(null);
  };

  const getAttendanceDataForApproval = (
    messageIndex?: number,
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any,
  ) => {
    console.log("=== getAttendanceDataForApproval DEBUG ===");
    console.log("messageIndex:", messageIndex);
    console.log("fallbackAttendanceData:", fallbackAttendanceData);
    console.log("fallbackClassInfo:", fallbackClassInfo);
    console.log("chatHistory.length:", chatHistory.length);
    console.log("Global attendanceData:", attendanceData);
    console.log("Global attendanceData.length:", attendanceData.length);
    console.log("Global classInfo:", classInfo);
    console.log("editingMessageIndex:", editingMessageIndex);

    console.log("=== CHAT HISTORY DEBUG ===");
    chatHistory.forEach((msg, idx) => {
      console.log(`Message ${idx}:`, {
        type: msg.type,
        hasAttendanceSummary: !!msg.attendance_summary,
        attendanceSummaryLength: msg.attendance_summary?.length || 0,
        hasClassInfo: !!msg.class_info,
        classInfo: msg.class_info,
        hasButtons: !!(msg as any).buttons,
      });
    });

    if (
      messageIndex !== undefined &&
      messageIndex >= 0 &&
      messageIndex < chatHistory.length
    ) {
      const targetMessage = chatHistory[messageIndex];
      console.log(
        `Priority 0: Checking provided message index ${messageIndex} first:`,
        {
          type: targetMessage?.type,
          hasAttendanceSummary: !!targetMessage?.attendance_summary,
          attendanceSummaryLength:
            targetMessage?.attendance_summary?.length || 0,
          hasClassInfo: !!targetMessage?.class_info,
        },
      );

      if (
        targetMessage?.type === "bot" &&
        targetMessage?.attendance_summary &&
        targetMessage.attendance_summary.length > 0
      ) {
        console.log(
          `Priority 0: Found attendance data in provided message index ${messageIndex}:`,
          targetMessage.attendance_summary.length,
          "records",
        );
        return {
          attendanceData: targetMessage.attendance_summary,
          classInfo: targetMessage.class_info || classInfo,
          source: `message_${messageIndex}_saved`,
        };
      }
    }

    if (editingMessageIndex !== null && attendanceData.length > 0) {
      console.log("Priority 1: Using edited data from global state");
      return {
        attendanceData: attendanceData,
        classInfo: classInfo,
        source: "edited_global_state",
      };
    }

    console.log(
      "Priority 2: Searching for attendance data in chat history (from most recent)...",
    );
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (messageIndex !== undefined && i === messageIndex) {
        continue;
      }

      const msg = chatHistory[i];
      console.log(`Checking message ${i}:`, {
        type: msg.type,
        hasAttendanceSummary: !!msg.attendance_summary,
        attendanceSummaryLength: msg.attendance_summary?.length || 0,
        hasClassInfo: !!msg.class_info,
        classInfo: msg.class_info,
        hasButtons: !!(msg as any).buttons,
      });

      if (
        msg.type === "bot" &&
        msg.attendance_summary &&
        msg.attendance_summary.length > 0
      ) {
        console.log(
          `Priority 2: Found attendance data in message ${i}:`,
          msg.attendance_summary.length,
          "records",
        );
        return {
          attendanceData: msg.attendance_summary,
          classInfo: msg.class_info || classInfo,
          source: `message_${i}`,
        };
      }
    }

    console.log("Priority 3: Searching for messages with buttons...");
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (messageIndex !== undefined && i === messageIndex) {
        continue;
      }

      const msg = chatHistory[i];
      if (
        msg.type === "bot" &&
        (msg as any).buttons &&
        (msg as any).buttons.length > 0
      ) {
        console.log(
          `Found message with buttons at index ${i}:`,
          (msg as any).buttons,
        );
        if (msg.attendance_summary && msg.attendance_summary.length > 0) {
          console.log(
            `Priority 3: Using attendance data from button message ${i}:`,
            msg.attendance_summary.length,
            "records",
          );
          return {
            attendanceData: msg.attendance_summary,
            classInfo: msg.class_info || classInfo,
            source: `button_message_${i}`,
          };
        } else if (attendanceData.length > 0) {
          console.log(
            `Priority 3: Using global state for button message ${i}:`,
            attendanceData.length,
            "records",
          );
          return {
            attendanceData: attendanceData,
            classInfo: classInfo,
            source: `button_message_global_${i}`,
          };
        }
      }
    }

    if (attendanceData.length > 0) {
      console.log("Priority 4: Using global state as fallback");
      return {
        attendanceData: attendanceData,
        classInfo: classInfo || fallbackClassInfo,
        source: "global_state_fallback",
      };
    }

    if (fallbackAttendanceData && fallbackAttendanceData.length > 0) {
      console.log(
        "Priority 5: Using fallback attendance data:",
        fallbackAttendanceData.length,
        "records",
      );
      return {
        attendanceData: fallbackAttendanceData,
        classInfo: fallbackClassInfo || classInfo,
        source: "fallback_captured_data",
      };
    }

    try {
      const sessionAttendanceData = sessionStorage.getItem(
        "pendingAttendanceData",
      );
      const sessionClassInfo = sessionStorage.getItem("pendingClassInfo");

      if (sessionAttendanceData) {
        const parsedAttendanceData = JSON.parse(sessionAttendanceData);
        const parsedClassInfo = sessionClassInfo
          ? JSON.parse(sessionClassInfo)
          : null;

        console.log("Priority 6: Using session storage data:", {
          attendanceData: parsedAttendanceData.length,
          classInfo: parsedClassInfo,
        });

        return {
          attendanceData: parsedAttendanceData,
          classInfo: parsedClassInfo,
          source: "session_storage",
        };
      }
    } catch (err) {
      console.log("Error reading from session storage:", err);
    }

    console.log("No attendance data found in any priority");
    return null;
  };

  const handleUnifiedAttendanceApproval = async (
    messageIndex?: number,
    attendanceType: "text" | "image" | "voice" = "text",
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any,
  ) => {
    console.log(
      `${attendanceType.toUpperCase()} Attendance Approval clicked for message:`,
      messageIndex,
    );
    console.log(`Current global state:`, {
      attendanceData: attendanceData,
      attendanceDataLength: attendanceData.length,
      classInfo: classInfo,
      editingMessageIndex: editingMessageIndex,
      chatHistoryLength: chatHistory.length,
      fallbackAttendanceData: fallbackAttendanceData,
      fallbackClassInfo: fallbackClassInfo,
    });

    setChatHistory((prev) => [
      ...prev,
      {
        type: "bot",
        text: `⏳ Processing ${attendanceType} attendance approval...`,
      },
    ]);

    try {
      const dataToSave = getAttendanceDataForApproval(
        messageIndex,
        fallbackAttendanceData,
        fallbackClassInfo,
      );

      console.log(`Data to save result:`, dataToSave);

      if (!dataToSave) {
        console.error(
          `No attendance data found for ${attendanceType} approval`,
        );
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: `❌ No attendance data found. Please try ${
              attendanceType === "text" ? "entering" : "uploading"
            } the attendance information again.`,
          },
        ]);
        return;
      }

      console.log(`Sending ${attendanceType} attendance data to backend:`, {
        attendanceData: dataToSave.attendanceData,
        classInfo: dataToSave.classInfo,
        source: dataToSave.source,
        dataLength: dataToSave.attendanceData.length,
      });

      console.log(
        `Date being sent to backend: '${dataToSave.classInfo?.date}'`,
      );

      const data = await aiAPI.chat({
        session_id: sessionId || userId,
        query: `approve_attendance: ${JSON.stringify({
          attendance_summary: dataToSave.attendanceData,
          class_info: dataToSave.classInfo,
        })}`,
        user_id: userId,
      });

      if (data.status === "success") {
        setChatHistory((prev) => {
          const filtered = prev.filter(
            (msg) => !(msg.text && msg.text.includes("⏳ Processing")),
          );
          const successMessage = `✅ ${
            attendanceType.charAt(0).toUpperCase() + attendanceType.slice(1)
          } attendance saved successfully! ${
            data.data?.message || "Data has been saved to MongoDB."
          }`;
          return [
            ...filtered,
            {
              type: "bot",
              text: successMessage,
              answer: data.data?.answer || data.data?.message,
            },
          ];
        });

        try {
          if (attendanceVoiceInitiatedRef.current === true) {
            const speech = generateAttendanceTTSSummary(
              "Attendance marked successfully",
            );
            void handlePlayTTS(-1, speech);
            attendanceVoiceInitiatedRef.current = false;
          }
        } catch (ttsErr) {
          console.error("TTS playback failed:", ttsErr);
        }

        setEditingMessageIndex(null);
        setAttendanceData([]);
        setClassInfo(null);

        setTimeout(() => {
          handleFlowExit({ newSession: false });
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: "Attendance saved! LLM routing enabled. Using AI-powered flow detection.",
            },
          ]);
        }, 1000);
      } else {
        throw new Error(data.message || "Failed to save attendance");
      }
    } catch (err) {
      console.error(`Error saving ${attendanceType} attendance:`, err);
      const errorMessage = `❌ Failed to save ${attendanceType} attendance: ${(err as Error).message}`;
      setChatHistory((prev) => {
        const filtered = prev.filter(
          (msg) => !(msg.text && msg.text.includes("⏳ Processing")),
        );
        return [...filtered, { type: "bot", text: errorMessage }];
      });

      try {
        if (attendanceVoiceInitiatedRef.current === true) {
          const speech = generateAttendanceTTSSummary(errorMessage);
          void handlePlayTTS(-1, speech);
        }
      } catch (ttsErr) {
        console.error("TTS playback failed:", ttsErr);
      }
    }
  };

  // @ts-expect-error - Kept for future use
  const _handleTextAttendanceApproval = async (
    messageIndex: number,
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any,
  ) => {
    return handleUnifiedAttendanceApproval(
      messageIndex,
      "text",
      fallbackAttendanceData,
      fallbackClassInfo,
    );
  };

  const handleTextAttendanceRejection = () => {
    console.log("Text Attendance Rejection clicked");

    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);

    setChatHistory((prev) => [
      ...prev,
      {
        type: "bot",
        text: "❌ Attendance rejected. You can provide new attendance data or try a different approach.",
        buttons: [
          {
            label: "Try Again",
            action: () => {
              setChatHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  text: 'Please provide attendance data again. For example: "Mark all present for Class 6 A on 2025-10-08" or list individual students.',
                },
              ]);
            },
          },
          {
            label: "Upload Image",
            action: () => {
              const fileInput = document.querySelector(
                'input[type="file"]',
              ) as HTMLInputElement;
              if (fileInput) {
                fileInput.click();
              }
            },
          },
        ],
      },
    ]);
  };

  // @ts-expect-error - Kept for future use
  const _handleVoiceAttendanceApproval = async (
    messageIndex: number,
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any,
  ) => {
    return handleUnifiedAttendanceApproval(
      messageIndex,
      "voice",
      fallbackAttendanceData,
      fallbackClassInfo,
    );
  };

  // @ts-expect-error - Kept for future use
  const _handleVoiceAttendanceRejection = () => {
    console.log("Voice Attendance Rejection clicked");

    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);

    setChatHistory((prev) => [
      ...prev,
      {
        type: "bot",
        text: "❌ Voice attendance rejected. You can provide new attendance data via voice or try a different approach.",
        buttons: [
          {
            label: "Try Voice Again",
            action: () => {
              setChatHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  text: 'Please speak the attendance data again. For example: "Aarav present, Diya absent" or "Mark all present except John".',
                },
              ]);
            },
          },
          {
            label: "Switch to Text",
            action: () => {
              setActiveFlow("attendance");
              setAttendanceStep("student_details");
              setChatHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  text: "Switched to text-based attendance. Please type the student names and their attendance status.",
                },
              ]);
            },
          },
          {
            label: "Upload Image",
            action: () => {
              const fileInput = document.querySelector(
                'input[type="file"]',
              ) as HTMLInputElement;
              if (fileInput) {
                fileInput.click();
              }
            },
          },
        ],
      },
    ]);
  };

  const handleSaveAttendance = async (messageIndex: number) => {
    console.log("Save Attendance clicked for message:", messageIndex);
    console.log("Current global attendanceData:", attendanceData);
    console.log("Current global classInfo:", classInfo);
    console.log("Editing message index:", editingMessageIndex);

    try {
      const currentMessage = chatHistory[messageIndex];
      console.log("Current message:", currentMessage);
      console.log(
        "Message attendance_summary:",
        currentMessage?.attendance_summary,
      );

      const currentAttendanceData =
        attendanceData.length > 0
          ? attendanceData
          : currentMessage?.attendance_summary || [];
      const currentClassInfo = classInfo || currentMessage?.class_info;

      console.log("Data to save:", {
        currentAttendanceData,
        currentClassInfo,
        fromGlobal: attendanceData.length > 0,
        fromMessage: currentMessage?.attendance_summary?.length || 0,
      });

      if (currentAttendanceData && currentAttendanceData.length > 0) {
        setChatHistory((prev) => {
          const updatedHistory = prev.map((msg, idx) => {
            if (idx === messageIndex && msg.type === "bot") {
              return {
                ...msg,
                attendance_summary: [...currentAttendanceData],
                class_info: currentClassInfo,
                answer: `Attendance Summary Updated:\n\n| Student Name | Attendance Status |\n|--------------|------------------|\n${currentAttendanceData
                  .map(
                    (item) =>
                      `| ${item.student_name} | ${item.attendance_status} |`,
                  )
                  .join("\n")}\n\nClass: ${currentClassInfo?.class_} ${
                  currentClassInfo?.section
                } on ${currentClassInfo?.date}`,
              };
            }
            return msg;
          });
          return updatedHistory;
        });

        setAttendanceData([...currentAttendanceData]);
        setClassInfo(currentClassInfo);

        sessionStorage.setItem(
          "pendingAttendanceData",
          JSON.stringify(currentAttendanceData),
        );
        sessionStorage.setItem(
          "pendingClassInfo",
          JSON.stringify(currentClassInfo),
        );

        setEditingMessageIndex(null);

        setChatHistory((prev) => {
          const updatedHistory = [...prev];
          if (
            updatedHistory[messageIndex] &&
            updatedHistory[messageIndex].type === "bot"
          ) {
            (updatedHistory[messageIndex] as any).isBeingEdited = false;
            console.log(
              "Cleared isBeingEdited flag for message:",
              messageIndex,
            );
          }
          return updatedHistory;
        });

        const capturedSavedAttendanceData = [...currentAttendanceData];
        const capturedSavedClassInfo = currentClassInfo
          ? { ...currentClassInfo }
          : null;

        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: `✅ Attendance data saved successfully! The table has been updated with your changes. Current data: ${currentAttendanceData.length} students recorded. You can now review the final attendance summary before approving.`,
            buttons: [
              {
                label: "Edit Attendance",
                action: () => {
                  setChatHistory((prev) => {
                    const updatedHistory = [...prev];
                    const message = updatedHistory[messageIndex];
                    if (
                      message &&
                      message.type === "bot" &&
                      message.attendance_summary
                    ) {
                      setAttendanceData(message.attendance_summary);
                      setClassInfo(message.class_info);
                      setEditingMessageIndex(messageIndex);

                      if (updatedHistory[messageIndex]) {
                        (updatedHistory[messageIndex] as any).isBeingEdited =
                          true;
                      }
                      return updatedHistory;
                    }
                    return prev;
                  });

                  setChatHistory((prev) => [
                    ...prev,
                    {
                      type: "bot",
                      text: "✅ Edit mode activated! You can now modify the attendance data.",
                    },
                  ]);
                },
              },
              {
                label: "Approve",
                action: () => {
                  console.log(
                    "Approve button clicked after save - using captured data:",
                    {
                      capturedSavedAttendanceData:
                        capturedSavedAttendanceData.length,
                      capturedSavedClassInfo: capturedSavedClassInfo,
                      messageIndex: messageIndex,
                    },
                  );

                  let attendanceType: "text" | "image" | "voice" = "text";

                  handleUnifiedAttendanceApproval(
                    messageIndex,
                    attendanceType,
                    capturedSavedAttendanceData,
                    capturedSavedClassInfo,
                  );
                },
              },
              {
                label: "Reject",
                action: () => handleTextAttendanceRejection(),
              },
            ],
          },
        ]);
      } else {
        console.log("No attendance data found. Global state:", attendanceData);
        console.log("Message state:", currentMessage?.attendance_summary);
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: '❌ No attendance data to save. Please click "Edit Attendance" first to load the data, then make your changes and save again.',
          },
        ]);
      }
    } catch (err) {
      console.error("Error saving attendance:", err);
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: `❌ Failed to save attendance: ${(err as Error).message}`,
        },
      ]);
    }
  };

  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const correctionBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
        setHoveredMenuItem(null);
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };
  }, [isMenuOpen]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isInsideCorrectionBox = target.closest(".correction-box");
      const isActionButton = target.closest(".bot-action-btn");
      if (
        showCorrectionBox !== null &&
        !isInsideCorrectionBox &&
        !isActionButton
      ) {
        setShowCorrectionBox(null);
      }
    };

    if (showCorrectionBox !== null) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCorrectionBox]);

  return {
    showClassInfoModal,
    handleClassInfoCancel,
    handleClassInfoConfirm,
    menuRef,
    isMenuOpen,
    setIsMenuOpen,
    routerMode,
    setRouterMode,
    setAutoRouting,
    handleFlowExit,
    setUserOptionSelected,
    setChatHistory,
    activeFlow,
    setActiveFlow,
    attendanceStep,
    setAttendanceStep,
    setPendingClassInfo,
    hoveredMenuItem,
    setHoveredMenuItem,
    hoverTimeoutRef,
    getErpContext,
    sessionId,
    userId,
    activeFlowRef,
    setIsProcessing,
    setLoadingLeaveRequests,
    loadingLeaveRequests,
    rejectReason,
    setRejectReason,
    setLeaveApprovalRequests,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    languages,
    selectedLanguage,
    setSelectedLanguage,
    chatBoxRef,
    chatHistory,
    isProcessing,
    ttsLoading,
    editingMessageIndex,
    setEditingMessageIndex,
    attendanceData,
    setAttendanceData,
    classInfo,
    setClassInfo,
    showCorrectionBox,
    setShowCorrectionBox,
    feedbackComment,
    setFeedbackComment,
    correctionBoxRef,
    handlePlayTTS,
    handleSendFeedback,
    handleAttendanceDataChange,
    handleAddStudent,
    handleRemoveStudent,
    handleSaveAttendance,
    handleUnifiedAttendanceApproval,
    handleTextAttendanceRejection,
    leaveApprovalRequests,
    inputText,
    setInputText,
    isRecording,
    fullVoiceMode,
    setFullVoiceMode,
    isVoiceActive,
    handleSubmit,
    startStreaming,
    stopStreaming,
    pendingClassInfo,
    attendanceFlowState,
    getAttendanceFlowCallbacks,
    setPendingImageFile,
    setShowClassInfoModal,
    uploadFile,
    activeVoiceButtonRef,
  };
}
