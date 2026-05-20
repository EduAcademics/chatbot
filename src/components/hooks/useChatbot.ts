import React, { useEffect, useRef, useState } from "react";
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
import { handleSubmissionChat } from "../flows/submissionFlow";
import { handleReviewChat } from "../flows/reviewFlow";
import { handleTeacherDiaryChat } from "../flows/teacherDiaryFlow";
import { handleMarksChat, sendColumnSave } from "../flows/marksFlow";
import { handleHealthCardChat } from "../flows/healthCardFlow";
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
import {
  handleLeaveChat,
  generateLeaveTTSSummary,
} from "../flows/leaveApplicationFlow";
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
  setLeaveApprovalRequests: React.Dispatch<React.SetStateAction<any[]>>;
  setRejectReason: React.Dispatch<
    React.SetStateAction<{ [key: string]: string }>
  >;
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
  setAttendanceData: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
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
  handleSaveAttendance: (messageIndex: number) => Promise<void>;
  handleSaveColumn: (
    columnTitle: string,
    studentData: any[],
    sessionId?: string,
  ) => Promise<boolean>;
  handleUnifiedAttendanceApproval: (
    messageIndex?: number,
    attendanceType?: "text" | "image" | "voice",
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any,
  ) => Promise<void>;
  handleTextAttendanceRejection: () => void;
  leaveApprovalRequests: any[];
  loadingLeaveRequests: boolean;
  rejectReason: { [key: string]: string };
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  isRecording: boolean;
  fullVoiceMode: boolean;
  isFullVoiceConnecting: boolean;
  setFullVoiceMode: (v: boolean) => void;
  isVoiceActive: boolean;
  handleSubmit: (overrideMessage?: string) => Promise<void>;
  startStreaming: (useFullVoice?: boolean) => Promise<void>;
  stopStreaming: (skipSubmit?: boolean, keepWarmConnection?: boolean) => Promise<void>;
  pendingClassInfo: ClassInfo | null;
  attendanceFlowState: AttendanceState;
  getAttendanceFlowCallbacks: () => AttendanceFlowCallbacks;
  setPendingImageFile: (v: File | null) => void;
  setShowClassInfoModal: (v: boolean) => void;
  uploadFile: (file: File) => Promise<any>;
  activeVoiceButtonRef: RefObject<"audio" | "mic" | null>;
  speakHealthCardBotMessage: (text: string) => void;
}

export function useChatbot({
  userId,
  roles,
  loginId,
}: {
  userId: string;
  roles: string;
  loginId: string;
}): UseChatbotReturn {
  const webrtcServiceRef = useRef<WebRTCAudioService | null>(null);
  const lastInterimTextRef = useRef<string>(""); // Track last interim text to replace it with final
  const finalTextRef = useRef<string>(""); // Track accumulated final text (completed sentences)

  // Local lifecycle-scoped flag to mark a single request as voice-triggered.
  // This is intentionally a request-scoped ref (not global/shared) and will
  // only be set immediately before submitting a mic-originated request
  // and reset right after that request completes. It is used only to gate
  // TTS playback inside the leave-approval success handler.
  const isVoiceTriggeredRequestRef = useRef<boolean>(false);
  // Flag to remember that the current Course Progress flow was initiated
  // via the microphone. This persists across the selection click so we can
  // play the second-step TTS when the user clicks a class-section.
  // Removed unused: const courseProgressVoiceInitiatedRef = useRef<boolean>(false);

  /**
   * Clears all frontend flow and session state (clear flow state, new session).
   * Called when exit is detected from backend or query errors.
   * Preserves TTS so exit responses can speak.
   */
  const handleFrontendExit = () => {
    handleFlowExit({ newSession: true, skipTTSInterrupt: true });
  };
  // Flag to remember that the current Leave flow was initiated
  // via the microphone. This persists so we can play TTS for leave responses.
  const leaveVoiceInitiatedRef = useRef<boolean>(false);
  // Flag to remember that the current Attendance flow was initiated
  // via the microphone. This persists so we can play TTS for attendance responses.
  const attendanceVoiceInitiatedRef = useRef<boolean>(false);
  /** Prevents immediate handleFlowExit while unauthorized health-card TTS plays */
  const healthCardUnauthorizedExitTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const [userOptionSelected, setUserOptionSelected] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Step 1: Add voice mode tracker ref (fixes state timing issue)
  const activeVoiceButtonRef = useRef<"audio" | "mic" | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputText, setInputText] = useState("");
  const [chatHistory, setChatHistory] = useState<
    {
      type: "user" | "bot";
      text?: string;
      answer?: string;
      references?: any[]; // Accept any structure for references
      mongodbquery?: string[];
      activeTab?: TabType;
      feedback?: "Approved" | "Rejected";
      feedbackMessage?: string;
      attendance_summary?: any[];
      class_info?: any;
      buttons?: { label: string; action: () => void }[];
      bulkattandance?: boolean;
      finish_collecting?: boolean;
      classSections?: any[]; // For course progress flow
      courseProgress?: any; // For course progress data
      classSection?: {
        classId: string;
        sectionId: string;
        className?: string;
        sectionName?: string;
      }; // Selected class/section
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
  const [activeFlow, setActiveFlow] = useState<FlowType>("none"); // <-- add
  // Initialize sessionId from localStorage if available
  const [sessionId, setSessionId] = useState<string>(
    () =>
      localStorage.getItem("sessionId") ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  );
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]); // <-- add for editable attendance
  const attendanceDataRef = useRef<AttendanceRecord[]>([]); // Ref to access current attendanceData in closures
  const [attendanceStep, setAttendanceStep] = useState<
    "class_info" | "student_details" | "completed"
  >("class_info");
  const [pendingClassInfo, setPendingClassInfo] = useState<ClassInfo | null>(
    null,
  ); // <-- add for pending class info
  // Unified attendance flow state
  const [attendanceFlowState, setAttendanceFlowState] =
    useState<AttendanceState>(INITIAL_ATTENDANCE_STATE);
  const [, _setIsProcessingImage] = useState(false); // <-- add for image processing state
  // Debug wrapper for setAttendanceData

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null); // <-- add for class info
  const classInfoRef = useRef<ClassInfo | null>(null); // Ref to access current classInfo in closures
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(
    null,
  ); // Track which message is being edited
  const [showClassInfoModal, setShowClassInfoModal] = useState(false); // <-- add for class info modal
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null); // <-- add for pending image
  const [leaveApprovalRequests, setLeaveApprovalRequests] = useState<any[]>([]); // <-- add for leave approval requests
  const [loadingLeaveRequests, setLoadingLeaveRequests] = useState(false); // <-- add for loading state
  const [rejectReason, setRejectReason] = useState<{ [key: string]: string }>(
    {},
  ); // <-- add for reject reasons
  // Course progress is now fully backend-driven - no frontend state needed
  // The backend returns course_progress data in the response which is stored in chat messages

  // Auto-routing states merge on 17-12-2025 manvi + lakshmi

  const [autoRouting, setAutoRouting] = useState<boolean>(true);
  const [routerMode, setRouterMode] = useState<"manual" | "auto" | "llm">(
    "llm",
  );
  const [_detectedFlow, setDetectedFlow] = useState<string | null>(null);
  const [_classificationConfidence, setClassificationConfidence] =
    useState<number>(0);
  const [fullVoiceAutoSubmitTimer, setFullVoiceAutoSubmitTimer] =
    useState<ReturnType<typeof setTimeout> | null>(null); // <-- add for full voice auto-submit timer
  const [fullVoiceMode, setFullVoiceMode] = useState<boolean>(false); // Full Voice Mode (Hands-Free)
  const [isFullVoiceConnecting, setIsFullVoiceConnecting] =
    useState<boolean>(false);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false); // Voice activity indicator
  const currentTTSAudioRef = useRef<HTMLAudioElement | null>(null); // Track current TTS audio for interruption
  const ttsRequestIdRef = useRef<number>(0); // Track TTS request ID to cancel stale requests
  const warmDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const turnCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  ); // Debounce turn-complete
  const [_lastVoiceInputTime, setLastVoiceInputTime] = useState<number>(0);
  const activeFlowRef = useRef<FlowType>("none"); // Sync with activeFlow; use in stay-in-flow to avoid stale state // <-- add for tracking last voiceÃ‚Â inputÃ‚Â time

  const clearWarmDisconnectTimer = () => {
    if (warmDisconnectTimerRef.current) {
      clearTimeout(warmDisconnectTimerRef.current);
      warmDisconnectTimerRef.current = null;
    }
  };

  // Shared helper: get academic session and branch token dynamically
  const getErpContext = () => {
    const academic_session =
      localStorage.getItem("academic_session") || "2025-26";
    const branch_token = localStorage.getItem("branch_token") || "qa";
    return { academic_session, branch_token };
  };

  // const [autoRouting, setAutoRouting] = useState<boolean>(true); // Enable auto-routing by default
  // const [_detectedFlow, setDetectedFlow] = useState<string | null>(null); // Show detected flow to user
  // const [_classificationConfidence, setClassificationConfidence] =useState<number>(0);
  // const [fullVoiceAutoSubmitTimer, setFullVoiceAutoSubmitTimer] = useState<ReturnType<typeof setTimeout> | null>(null); // <-- add for full voice auto-submit timer
  // const [_lastVoiceInputTime, setLastVoiceInputTime] = useState<number>(0); // <-- add for tracking last voiceÃ‚Â inputÃ‚Â time
  // // Shared helper: get academic session and branch token dynamically
  // const getErpContext = () => {
  //   const academic_session =
  //     localStorage.getItem("academic_session") || "2025-26";
  //   const branch_token = localStorage.getItem("branch_token") || "demo";
  //   return { academic_session, branch_token };
  // };
  // const [autoRouting, setAutoRouting] = useState<boolean>(true);
  // const [routerMode, setRouterMode] = useState<"manual" | "auto" | "llm">(
  //   "auto"
  // );
  // const [detectedFlow, setDetectedFlow] = useState<string | null>(null);
  // const [classificationConfidence, setClassificationConfidence] =
  //   useState<number>(0);

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

      setChatHistory([welcomeMessage]); // replace instead of append
      // Don't set default flow or userOptionSelected - let auto-routing handle it
      // setActiveFlow("query");
      // setUserOptionSelected(true);
    }
  }, []); // run only once

  useEffect(() => {
    const fetchMicrophones = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      setDevices(mics);
      stream.getTracks().forEach((track) => track.stop()); // Cleanup
    };
    fetchMicrophones();
  }, []);

  useEffect(() => {
    return () => {
      clearWarmDisconnectTimer();
      if (webrtcServiceRef.current) {
        void webrtcServiceRef.current.disconnect();
        webrtcServiceRef.current = null;
      }
    };
  }, []);

  // Fetch user info and session id on mount (or when userId changes)
  useEffect(() => {
    const fetchUserSession = async () => {
      try {
        const data = await userAPI.fetch({ login_id: loginId });
        if (data.status === "success" && data.session_id) {
          setSessionId(data.session_id);
        }
      } catch (err) {
        // ignore
      }
    };

    fetchUserSession();
  }, [userId, loginId]);

  useEffect(() => {
    activeFlowRef.current = activeFlow;
  }, [activeFlow]);

  // Keep refs in sync with state for closure access
  useEffect(() => {
    attendanceDataRef.current = attendanceData;
  }, [attendanceData]);

  useEffect(() => {
    classInfoRef.current = classInfo;
  }, [classInfo]);

  // Helper function to interrupt any playing TTS and cancel in-flight requests
  const interruptTTS = () => {
    // Increment request ID to cancel any in-flight TTS requests
    ttsRequestIdRef.current += 1;
    console.log(
      `[TTS] Interrupted - new request ID: ${ttsRequestIdRef.current}`,
    );

    if (currentTTSAudioRef.current) {
      const audio = currentTTSAudioRef.current;
      // Always interrupt if audio exists - pause and reset
      console.log("[TTS] Interrupting playback", {
        paused: audio.paused,
        currentTime: audio.currentTime,
        readyState: audio.readyState,
        ended: audio.ended,
        requestId: (audio as any)._requestId,
      });
      audio.pause();
      audio.currentTime = 0;

      // Clean up URL if stored on audio element
      const url = (audio as any)._ttsUrl;
      if (url) {
        URL.revokeObjectURL(url);
        (audio as any)._ttsUrl = null;
      }

      // Clear the ref so we know TTS was interrupted
      currentTTSAudioRef.current = null;
      webrtcServiceRef.current?.interruptBotAudio();
    }

    // Clear loading state
    setTtsLoading(null);
  };

  /**
   * Centralized flow exit: clear flow-specific state, set activeFlow to none.
   * Call on user manual exit (e.g. "exit"/"quit") or when a flow completes.
   * @param options.newSession - if true, generate new sessionId (use for manual exit)
   * @param options.skipTTSInterrupt - if true, preserve in-flight TTS (for exit messages that should speak)
   */
  const clearHealthCardUnauthorizedExitTimer = () => {
    if (healthCardUnauthorizedExitTimerRef.current != null) {
      clearTimeout(healthCardUnauthorizedExitTimerRef.current);
      healthCardUnauthorizedExitTimerRef.current = null;
    }
  };

  const handleFlowExit = (options?: {
    newSession?: boolean;
    skipTTSInterrupt?: boolean;
  }) => {
    clearHealthCardUnauthorizedExitTimer();

    const flow = activeFlowRef.current;
    console.log("[Flow] handleFlowExit:", {
      flow,
      newSession: options?.newSession,
    });

    if (!options?.skipTTSInterrupt) {
      interruptTTS();
    }

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
    // assignment, course_progress, query, none: no extra state to clear

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
      console.log("✅ New session ID on exit:", newSessionId);
    }
  };

  const scheduleHealthCardUnauthorizedExit = () => {
    clearHealthCardUnauthorizedExitTimer();
    healthCardUnauthorizedExitTimerRef.current = setTimeout(() => {
      healthCardUnauthorizedExitTimerRef.current = null;
      handleFlowExit({ newSession: false, skipTTSInterrupt: true });
    }, 5000);
  };

  const healthCardExitFlow = () => {
    if (healthCardUnauthorizedExitTimerRef.current != null) {
      console.log(
        "[HealthCard] Skipping immediate exitFlow — delayed unauthorized exit already scheduled",
      );
      return;
    }
    handleFlowExit({ newSession: false });
  };

  const startStreaming = async (useFullVoice = false) => {
    // Step 2: AUDIO BUTTON click handler should set ref for immediate access
    activeVoiceButtonRef.current = "audio";
    console.log("[Voice] Audio button - set mode to audio");
    try {
      clearWarmDisconnectTimer();
      if (useFullVoice) {
        setIsFullVoiceConnecting(true);
      } else {
        setIsFullVoiceConnecting(false);
      }
      // Reset text tracking for new recording session
      lastInterimTextRef.current = "";
      finalTextRef.current = "";

      // Create WebRTC service instance
      const existingService = webrtcServiceRef.current;
      if (existingService?.getIsConnected()) {
        existingService.enableMic(true);
        setIsRecording(true);
        setIsFullVoiceConnecting(false);
        return;
      }

      const webrtcService = new WebRTCAudioService();
      webrtcServiceRef.current = webrtcService;

      // Connect with callbacks; pass useFullVoice for Full Voice Mode
      await webrtcService.connect(
        selectedLanguage,
        {
          onTranscript: (() => {
            // Track last submitted input to prevent duplicates
            let lastSubmittedInput = "";
            return (text: string, isFinal: boolean) => {
              const trimmed = text.trim();
              if (!trimmed) return;
              // Step 5: Debug log for transcript mode (use ref for immediate value)
              console.log(
                "Transcript in mode:",
                activeVoiceButtonRef.current,
                text,
              );

              if (currentTTSAudioRef.current) {
                return;
              }

              // Interrupt TTS immediately when user speaks (any transcript = user is speaking)
              if (useFullVoice) {
                interruptTTS();
              }

              if (isFinal) {
                // Final result: add to accumulated final text and clear interim
                finalTextRef.current = finalTextRef.current
                  ? finalTextRef.current + " " + trimmed
                  : trimmed;
                lastInterimTextRef.current = "";

                // Update input with final text only (no interim)
                setInputText(finalTextRef.current);
              } else {
                // Interim result: show final text + current interim
                lastInterimTextRef.current = trimmed;
                const displayText = finalTextRef.current
                  ? finalTextRef.current + " " + trimmed
                  : trimmed;

                // Update input in real-time with interim
                setInputText(displayText);
              }

              // Full-voice flows (attendance, assignment, leave): 3-second auto-submit
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
                  // Prevent duplicate submission of the same input
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
            setIsFullVoiceConnecting(false);
            setIsVoiceActive(false);
          },
          onConnected: () => {
            setIsRecording(true);
            setIsFullVoiceConnecting(false);
          },
          onDisconnected: () => {
            setIsRecording(false);
            setIsFullVoiceConnecting(false);
            setIsVoiceActive(false);
            console.log("WebRTC disconnected");
          },
          onTurnComplete: () => {
            if (!useFullVoice || !finalTextRef.current.trim() || isProcessing)
              return;
            // These flows use 3s timer only; skip turn-complete to avoid double submit
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
            // Interrupt TTS when voice activity is detected
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
      setIsFullVoiceConnecting(false);
      setIsVoiceActive(false);
    }
  };

  const stopStreaming = async (
    skipSubmit = false,
    keepWarmConnection = false,
  ) => {
    // Step 4: Reset voice mode tracker when stopping
    activeVoiceButtonRef.current = null;
    if (turnCompleteTimerRef.current) {
      clearTimeout(turnCompleteTimerRef.current);
      turnCompleteTimerRef.current = null;
    }
    if (fullVoiceAutoSubmitTimer) {
      clearTimeout(fullVoiceAutoSubmitTimer);
      setFullVoiceAutoSubmitTimer(null);
    }
    setIsFullVoiceConnecting(false);
    if (keepWarmConnection && webrtcServiceRef.current?.getIsConnected()) {
      webrtcServiceRef.current.enableMic(false);
      setIsRecording(false);
      setIsVoiceActive(false);

      clearWarmDisconnectTimer();
      warmDisconnectTimerRef.current = setTimeout(async () => {
        if (webrtcServiceRef.current) {
          await webrtcServiceRef.current.disconnect();
          webrtcServiceRef.current = null;
        }
        warmDisconnectTimerRef.current = null;
      }, 20000);

      if (skipSubmit) return;
    }

    if (webrtcServiceRef.current) {
      clearWarmDisconnectTimer();
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

  // --- Upload file handler for attendance flow ---
  const uploadFile = async (file: File) => {
    if (activeFlow !== "attendance") throw new Error("Upload not allowed");

    // Check if it's an image file for OCR processing
    if (file.type.startsWith("image/")) {
      // For images, we need class info first, so this shouldn't be called directly
      throw new Error("Image processing requires class information");
    } else {
      // Handle other file types (Excel, CSV, etc.)
      return await uploadRegularFile(file);
    }
  };

  // Upload regular files (Excel, CSV, etc.)
  const uploadRegularFile = async (file: File) => {
    return await aiAPI.uploadFile({
      file,
      session_id: sessionId,
    });
  };

  // Upload attendance image through OCR processing
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
          message: result.data.message, // Use the backend message which contains the markdown table
          data: {
            attendance_summary: result.data.attendance_summary,
            class_info: result.data.class_info,
            ocr_text: result.data.ocr_text,
            bulkattandance: result.data.bulkattandance,
            finish_collecting: result.data.finish_collecting,
          },
        };
      } else {
        // Handle the case where vision model is not available
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
      // Provide helpful fallback message
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

  /**
   * Classify user query to determine appropriate flow
   */
  const classifyQuery = async (
    message: string,
  ): Promise<{
    flow: string;
    confidence: number;
    entities: any;
    validation_status?: string;
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
        const { flow, confidence, entities,validation_status } = data.data;

        console.log("[Routing] Query classification:", {
          query: message,
          detectedFlow: flow,
          confidence: `${(confidence * 100).toFixed(0)}%`,
          entities,
        });

        return { flow, confidence, entities,validation_status };
      }

      // Fallback
      return { flow: "query", confidence: 0.8, entities: {} };
    } catch (error) {
      console.error("❌ Classification error:", error);
      return { flow: "query", confidence: 0.8, entities: {} };
    }
  };

  const handleSubmit = async (overrideMessage?: string) => {
    const userMessage = (overrideMessage ?? inputText).trim(); // captures user question here
    if (!userMessage) return;

    // Snapshot request-level voice source before any flow/exit handlers mutate refs.
    const isVoiceTriggeredForThisRequest =
      isVoiceTriggeredRequestRef.current === true;

    console.log("[Submit] handleSubmit START:", {
      userMessage,
      activeFlow,
      userOptionSelected,
      autoRouting,
    });

    setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
    setInputText("");
    setIsProcessing(true);

    // CHECK FOR EXIT KEYWORDS - Route to current flow's backend (same behavior as text mode)
    // Normalize like backend: trim, collapse whitespace, lowercase, strip leading/trailing punctuation
    // so voice "Exit", "Exit.", ". Exit" etc. are treated the same as typing "exit"
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

    // When exit command: capture current flow and route message to that flow's backend.
    // Do NOT call handleFlowExit here - it clears activeFlowRef and causes wrong routing
    // (e.g. "exit" in leave flow would get classified as course_progress and show wrong message).
    // Use activeFlow as fallback when activeFlowRef is stale (e.g. in leave_approval voice mode)
    const flowToExitOnCommand =
      isExitCommand && activeFlow !== "none" && activeFlow !== "query"
        ? activeFlowRef.current !== "none" && activeFlowRef.current !== "query"
          ? activeFlowRef.current
          : activeFlow
        : null;

    if (flowToExitOnCommand) {
      console.log(
        "🪟 Exit command detected, routing to current flow:",
        flowToExitOnCommand,
      );
    }

    // AUTO-ROUTING: Classify query if auto-routing is enabled and no manual flow selected
    let targetFlow = activeFlow;
    let classificationResult: {
      flow: string;
      confidence: number;
      entities: any;
      validation_status?: string;
    } | null = null;

    // Don't re-classify if we're in the middle of a multi-step flow
    const inAttendanceFlow =
      activeFlow === "attendance" &&
      attendanceStep === "student_details" &&
      pendingClassInfo;
    const inVoiceAttendanceFlow =
      activeFlow === "voice_attendance" &&
      attendanceStep === "student_details" &&
      pendingClassInfo;

    // For leave/assignment, check if message looks like a NEW request (indicates flow switch)
    // Keywords that DEFINITELY indicate starting a NEW flow
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
      "create diary",
      "diary entry",
      "teacher diary",
      "class diary",
      "show me",
      "list all",
      "show",
      "list",
      "course progress",
      "syllabus",
      "view",
      "display",
      "health card",
      "health cards",
      "update health",
      "health data",
      "vision test",
      "dental examination",
      "enter marks",
      "marks entry",
    ];
    const looksLikeNewRequest = newFlowKeywords.some((keyword) =>
      userMessage.toLowerCase().includes(keyword),
    );

    // Stay in active flow if user is responding (not starting new request)
    // If already in leave/assignment and message doesn't look like a new request, stay in flow
    // Don't check userOptionSelected - if activeFlow is set, we're in that flow
    const inLeave = activeFlowRef.current === "leave" || activeFlow === "leave";
    const inAssignment =
      activeFlowRef.current === "assignment" || activeFlow === "assignment";
    const inLeaveApproval =
      activeFlowRef.current === "leave_approval" ||
      activeFlow === "leave_approval";
    const inTeacherDiary =
      activeFlowRef.current === "teacher_diary" ||
      activeFlow === "teacher_diary";
    const inHealthCard =
      activeFlowRef.current === "health_card" ||
      activeFlow === "health_card";
    const inMarks =
      activeFlowRef.current === "marks" || activeFlow === "marks";
    const inLeaveFlow = inLeave && !looksLikeNewRequest;
    const inAssignmentFlow = inAssignment && !looksLikeNewRequest;
    const inLeaveApprovalFlow = inLeaveApproval && !looksLikeNewRequest;
    const inTeacherDiaryFlow = inTeacherDiary && !looksLikeNewRequest;
    const inHealthCardFlow = inHealthCard && !looksLikeNewRequest;
    const inMarksFlow = inMarks && !looksLikeNewRequest;

    console.log("[Routing] Auto-routing check:", {
      autoRouting,
      activeFlow,
      userOptionSelected,
      attendanceStep,
      pendingClassInfo,
      inAttendanceFlow,
      inVoiceAttendanceFlow,
      inLeaveFlow,
      inAssignmentFlow,
      inLeaveApprovalFlow,
      inTeacherDiaryFlow,
      inHealthCardFlow,
      inMarksFlow,
      looksLikeNewRequest,
      message: userMessage,
    });

    if (flowToExitOnCommand) {
      // Exit command: route to current flow's backend (leave-chat, course-progress-chat, etc.)
      // so we get the correct exit message and flow state is cleared by the backend
      targetFlow = flowToExitOnCommand;
      setDetectedFlow(null);
    } else if (
      inAttendanceFlow ||
      inVoiceAttendanceFlow ||
      inLeaveFlow ||
      inAssignmentFlow ||
      inLeaveApprovalFlow ||
      inTeacherDiaryFlow ||
      inHealthCardFlow ||
      inMarksFlow
    ) {
      // Stay in current flow if we're in the middle of a multi-step process
      console.log(
        "[Routing] Staying in current flow (multi-step process active)",
      );
      targetFlow =
        activeFlowRef.current !== "none" && activeFlowRef.current !== "query"
          ? activeFlowRef.current
          : activeFlow;
      // Don't show old detection when in multi-step flow
      setDetectedFlow(null);
    } else if (autoRouting) {
      // Skip classification for short confirmation words and common flow responses (save API call)
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
        // Keep current flow for simple confirmation words
        console.log(
          "[Routing] Simple response detected, keeping current flow:",
          activeFlowRef.current,
        );
        targetFlow = activeFlowRef.current;
      } else if (
        activeFlowRef.current !== "none" &&
        activeFlowRef.current !== "query" &&
        userMessage.length < 50 &&
        !looksLikeNewRequest
      ) {
        // Short message in an active flow (likely a response to a question) - stay in current flow
        console.log(
          "[Routing] Short response in active flow, staying in:",
          activeFlowRef.current,
        );
        targetFlow = activeFlowRef.current;
      } else {
        // Run classification for every new query when auto-routing is enabled
        console.log("[Routing] Running classification...");
        try {
          // Deterministic lexical override: if the normalized tokens contain
          // the token 'leave' (or 'leaves') AND at least one explicit
          // approval token, force the leave_approval flow and skip the
          // classifier. This prevents STT artifacts from misrouting.
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
              "[Routing] Lexical override: forcing leave_approval based on tokens",
              { tokens },
            );
            // Mark classificationResult so downstream logic treats this as a
            // detected/new flow (same shape as classifier result). We set a
            // high confidence to avoid low-confidence overrides later.
            classificationResult = {
              flow: "leave_approval",
              confidence: 1,
            } as any;
            targetFlow = "leave_approval" as FlowType;
          } else if (
            [
              "health card",
              "health cards",
              "update health",
              "health data",
              "vision test",
              "dental examination",
            ].some((keyword) => normalized.includes(keyword))
          ) {
            console.log(
              "[Routing] Lexical override: forcing health_card based on keywords",
            );
            classificationResult = {
              flow: "health_card",
              confidence: 1,
            } as any;
            targetFlow = "health_card" as FlowType;
          } else {
            classificationResult = await classifyQuery(userMessage);  
            console.log("✅ Classification complete:", classificationResult);
            targetFlow = classificationResult.flow as FlowType;  // the question now is classified  
          }

          // Map backend flow names to frontend flow types
          if (targetFlow === ("assignment_create" as any)) {
            targetFlow = "assignment";
          } else if (targetFlow === ("assignment_submit" as any)) {
            targetFlow = "submission";
          } else if (targetFlow === ("review_submission" as any)) {
            targetFlow = "review";
          } else if (targetFlow === ("marks_entry" as any)) {
            targetFlow = "marks";
          } else if (targetFlow === ("health_card" as any)) {
            targetFlow = "health_card";
          }
        } catch (error) {
          console.error("❌ Classification error:", error);
          targetFlow = "query"; // Fallback to query on error
        }
      }

      console.log("[Routing] Target flow determined:", targetFlow);

      // Update UI to show detected flow
      setDetectedFlow(targetFlow);

      // Only update confidence if we actually ran classification
      if (classificationResult) {
        setClassificationConfidence(classificationResult.confidence);

        // Low confidence warning (but still proceed)
        if (classificationResult.confidence < 0.25) {
          console.warn(
            "[Routing] Low classification confidence, defaulting to query",
          );
          targetFlow = "query";
        }
      }

      // Set userOptionSelected to true when auto-routing detects a flow
      setUserOptionSelected(true);

      // IMPORTANT: Initialize flow state when detected (same as manual mode)
      if (
        targetFlow === "attendance" ||
        targetFlow === "voice_attendance" ||
        targetFlow === "full_voice_attendance"
      ) {
        console.log("[Routing] Initializing unified attendance flow state");
        setAttendanceStep("class_info");
        setPendingClassInfo(null);
        // Initialize unified attendance flow state
        setAttendanceFlowState(INITIAL_ATTENDANCE_STATE);

        // If this Attendance request was initiated via microphone,
        // mark that the attendance flow was voice-initiated so the
        // subsequent responses can also trigger TTS.
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

        // Don't show welcome message here - let the backend response handle it
        // The backend will either auto-fetch class info or ask for it
      }

      // Always treat as new flow initialization if last flow was exited (activeFlow is none),
      // Only treat as new flow initialization if last flow was exited (activeFlow is none),
      // Only treat as new flow initialization if last flow was exited (activeFlow is none or query),
      // or if flow type changes (from a different flow to this one)
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

      // Initialize assignment flow
      if (targetFlow === "assignment" && isNewFlowInitialization) {
        console.log("[Routing] Initializing assignment flow state");
        console.log("[Routing] Setting activeFlow to 'assignment'");

        // Only reset state, do NOT fetch or reset sessionId unless user explicitly exits
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
        // Do not switch to push-to-talk if user started this flow by voice (full voice mode stays on)
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
        console.log("[Routing] Processing first assignment message");
      }

      // Initialize submission flow
      if (targetFlow === "submission" && isNewFlowInitialization) {
        console.log("🔤 Initializing submission flow state");
        console.log("🔤 Setting activeFlow to 'submission'");

        // Only reset state, do NOT fetch or reset sessionId unless user explicitly exits
        activeFlowRef.current = "submission";
        setActiveFlow("submission");
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
        // Do not switch to push-to-talk if user started this flow by voice (full voice mode stays on)
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
        console.log("🔤 Processing first submission message");
      }

      // Initialize review flow
      if (targetFlow === "review" && isNewFlowInitialization) {
        activeFlowRef.current = "review";
        setActiveFlow("review");
      }

      // Initialize teacher diary flow
      if (targetFlow === "teacher_diary" && isNewFlowInitialization) {
        activeFlowRef.current = "teacher_diary";
        setActiveFlow("teacher_diary");
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
      }

      // Initialize leave flow
      if (targetFlow === "leave" && isNewFlowInitialization) {
        console.log("[Routing] Initializing leave flow state");

        // Only reset state, do NOT fetch or reset sessionId unless user explicitly exits
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
        // Do not switch to push-to-talk if user started this flow by voice (full voice mode stays on)
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
        // If this leave flow was started by voice, mark it so TTS plays for all leave responses
        if (isVoiceTriggeredRequestRef.current === true) {
          leaveVoiceInitiatedRef.current = true;
          console.log(
            "[Voice] Leave flow voice-initiated: TTS will play for leave responses",
          );
        }
        // Consume trigger so it doesn't leak to later requests
        isVoiceTriggeredRequestRef.current = false;
        // Don't return - let the flow continue to make the API call.
        // The backend leave agent will return the initial prompt (Step 1: Half Day / Full Day / Long Leave).
        console.log(
          "[Routing] Leave flow initialized, continuing to API call...",
        );
      }
    } else {
      console.log("[Routing] Using current activeFlow:", activeFlow);
    }

    // IMPORTANT: Always route marks messages to marks handler, including
    // explicit "exit" while already in marks flow (no fresh classification run).
    if (activeFlowRef.current === "marks" || targetFlow === "marks") {
      if (targetFlow === "marks" && activeFlowRef.current !== "marks") {
        activeFlowRef.current = "marks";
        setActiveFlow("marks");
      }

      try {
        await handleMarksChat({
          userMessage,
          sessionId,
          userId,
          isVoiceTriggered: isVoiceTriggeredRequestRef.current === true,
          getErpContext,
          appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
          exitFlow: () => handleFlowExit({ newSession: false }),
          exitFlowForManualExit: () =>
            handleFlowExit({ newSession: true, skipTTSInterrupt: true }),
          setProcessing: setIsProcessing,
          playTTS: (idx, text) => void handlePlayTTS(idx, text),
          getTTSSummary: generateQueryTTSSummary,
          setActiveFlow: (flow: string) => setActiveFlow(flow as FlowType),
        });
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (activeFlowRef.current === "health_card" || targetFlow === "health_card") {
      if (
        targetFlow === "health_card" &&
        activeFlowRef.current !== "health_card"
      ) {
        activeFlowRef.current = "health_card";
        setActiveFlow("health_card");
      }

      try {
        clearHealthCardUnauthorizedExitTimer();
        await handleHealthCardChat({
          userMessage,
          sessionId,
          userId,
          userRoles: roles ? roles.split(",").map((r) => r.trim()).filter(Boolean) : [],
          isVoiceTriggered: isVoiceTriggeredRequestRef.current === true,
          getErpContext,
          appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
          exitFlow: healthCardExitFlow,
          exitFlowForManualExit: () => {
            clearHealthCardUnauthorizedExitTimer();
            handleFlowExit({ newSession: true, skipTTSInterrupt: true });
          },
          scheduleUnauthorizedExit: scheduleHealthCardUnauthorizedExit,
          setProcessing: setIsProcessing,
          playTTS: (idx, text) => void handlePlayTTS(idx, text),
          getTTSSummary: generateQueryTTSSummary,
          setActiveFlow: (flow: string) => setActiveFlow(flow as FlowType),
        });
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // If still no flow selected after classification, prompt user
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

    console.log("[Routing] Routing to flow:", targetFlow);
    console.log("[Routing] Current attendance step:", attendanceStep);
    console.log("[Routing] Pending class info:", pendingClassInfo);

    // Update active flow for next message (unless manually overridden)
    if (autoRouting) {
      activeFlowRef.current = targetFlow;
      setActiveFlow(targetFlow);
    }

    // If we're already in attendance flow at student_details step, stay there
    // Don't reset to class_info when user is providing student attendance data
    if (
      targetFlow === "attendance" &&
      attendanceStep === "student_details" &&
      pendingClassInfo
    ) {
      console.log("[Routing] Continuing attendance at student_details step");
      // Keep the current step - don't reset
    }

    if (targetFlow === "query" || targetFlow === "faq") {  // the code checcks if the intent is query or faq and then calls the query handler API
      // Query handler API
      try {
        const data = await aiAPI.queryHandler({    // this is where suitcase is built using model.py structure and sent to backend server(supriyo). the code combines the ID, Question and label into one package 
          user_id: userId,
          user_roles: roles,
          query: userMessage,
          flow: targetFlow,
          validation_status: classificationResult?.validation_status 
        });
        if (data.status === "success" && data.data) {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              answer: data.data?.answer,   // the answer comes from backend and the frontend displays it(supriyo)
              references: data.data?.references,
              mongodbquery: data.data?.mongodbquery,
              activeTab: "answer", // Set initial active tab
              visualization: data.data?.visualization,
            },
          ]);
          // Ã¢Â­Â NEW: Check for exit response
          if (isExitResponse(data.data)) {
            handleFrontendExit();
          } else if ((data.data as any)?.flow_name) {
            setActiveFlow((data.data as any).flow_name as FlowType);
          }
          // Information-based query: play summarized TTS (backend generates voice-friendly summary)
          const shouldPlayQueryTTS =
            isVoiceTriggeredForThisRequest ||
            fullVoiceMode ||
            activeVoiceButtonRef.current !== null;
          if (shouldPlayQueryTTS) {
            try {
              const answerText = data.data?.answer ?? "";
              void handlePlayTTS(-1, answerText, true);
            } catch (ttsErr) {
              console.error("Query TTS playback failed:", ttsErr);
            }
          }
        } else if (data.status === "error" && data.message) {
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: data.message },
          ]);
          // Ã¢Â­Â NEW: Check for exit response
          if (isExitResponse(data)) {
            handleFrontendExit();
          }
          const shouldPlayQueryErrorTTS =
            isVoiceTriggeredForThisRequest ||
            fullVoiceMode ||
            activeVoiceButtonRef.current !== null;
          if (shouldPlayQueryErrorTTS) {
            try {
              void handlePlayTTS(-1, data.message, true);
            } catch (ttsErr) {
              console.error("Query TTS playback failed:", ttsErr);
            }
          }
        } else {
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: "No response from AI." },
          ]);
          // Ã¢Â­Â NEW: Check for exit response
          if (isExitResponse(data)) {
            handleFrontendExit();
          }
          const shouldPlayNoResponseTTS =
            isVoiceTriggeredForThisRequest ||
            fullVoiceMode ||
            activeVoiceButtonRef.current !== null;
          if (shouldPlayNoResponseTTS) {
            try {
              void handlePlayTTS(-1, "No response from AI.", true);
            } catch (ttsErr) {
              console.error("Query TTS playback failed:", ttsErr);
            }
          }
        }
      } catch (err) {
        const errorMessage = "Sorry, there was an error processing your query.";
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: errorMessage,
          },
        ]);
        try {
          const shouldPlayQueryExceptionTTS =
            isVoiceTriggeredForThisRequest ||
            fullVoiceMode ||
            activeVoiceButtonRef.current !== null;
          if (shouldPlayQueryExceptionTTS) {
            void handlePlayTTS(-1, errorMessage, true);
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
      // ============= UNIFIED ATTENDANCE FLOW =============
      // Handles text, voice, and image-based attendance in a single unified flow
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
      const leaveMessageViaVoice = isVoiceTriggeredRequestRef.current === true;
      if (leaveMessageViaVoice) {
        leaveVoiceInitiatedRef.current = true;
        isVoiceTriggeredRequestRef.current = false;
      }
      // Use leaveVoiceInitiatedRef so first response TTS plays (ref is set above before we consume isVoiceTriggeredRequestRef)
      const shouldPlayTTSForLeave =
        leaveMessageViaVoice || leaveVoiceInitiatedRef.current;
      await handleLeaveChat({
        userMessage,
        sessionId,
        userId,
        isVoiceTriggered: shouldPlayTTSForLeave,
        getErpContext,
        appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
        exitFlow: () => handleFlowExit({ newSession: false }),
        exitFlowForManualExit: () =>
          handleFlowExit({ newSession: true, skipTTSInterrupt: true }),
        setProcessing: setIsProcessing,
        playTTS: (idx, text) => void handlePlayTTS(idx, text),
        getTTSSummary: generateLeaveTTSSummary,
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
        exitFlowForManualExit: () =>
          handleFlowExit({ newSession: true, skipTTSInterrupt: true }),
        setProcessing: setIsProcessing,
        playTTS: (idx, text) => void handlePlayTTS(idx, text),
        getTTSSummary: generateQueryTTSSummary,
      });
    } else if (targetFlow === "submission") {
      await handleSubmissionChat({
        userMessage,
        sessionId,
        userId,
        isVoiceTriggered: isVoiceTriggeredRequestRef.current === true,
        getErpContext,
        appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
        exitFlow: () => handleFlowExit({ newSession: false }),
        exitFlowForManualExit: () =>
          handleFlowExit({ newSession: true, skipTTSInterrupt: true }),
        setProcessing: setIsProcessing,
        playTTS: (idx, text) => void handlePlayTTS(idx, text),
        getTTSSummary: generateQueryTTSSummary,
      });
    } else if (targetFlow === "review") {
      await handleReviewChat({
        userMessage,
        sessionId,
        userId,
        isVoiceTriggered: isVoiceTriggeredRequestRef.current === true,
        getErpContext,
        appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
        exitFlow: () => handleFlowExit({ newSession: false }),
        exitFlowForManualExit: () =>
          handleFlowExit({ newSession: true, skipTTSInterrupt: true }),
        setProcessing: setIsProcessing,
        playTTS: (idx, text) => void handlePlayTTS(idx, text),
        getTTSSummary: generateQueryTTSSummary,
      });
    } else if (targetFlow === "teacher_diary") {
      await handleTeacherDiaryChat({
        userMessage,
        sessionId,
        userId,
        isVoiceTriggered: isVoiceTriggeredRequestRef.current === true,
        getErpContext,
        appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
        exitFlow: () => handleFlowExit({ newSession: false }),
        exitFlowForManualExit: () =>
          handleFlowExit({ newSession: true, skipTTSInterrupt: true }),
        setProcessing: setIsProcessing,
        playTTS: (idx, text) => void handlePlayTTS(idx, text),
        getTTSSummary: generateQueryTTSSummary,
      });
    } else if (targetFlow === "course_progress") {
      // Course progress flow - fully backend-driven
      // Send user message to backend and render the response
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
          const answer =
            response.data.answer || "How can I help with course progress?";
          const botMessage: any = {
            type: "bot",
            text: answer,
          };

          // If backend returns course progress data, include it for rendering
          if (response.data.course_progress) {
            botMessage.courseProgress = response.data.course_progress;
            botMessage.classSection = response.data.class_section;
          }

          // If backend returns class sections list, include it for rendering
          if (
            response.data.class_sections &&
            response.data.class_sections.length > 0
          ) {
            botMessage.classSectionsOptions = response.data.class_sections;
          }

          setChatHistory((prev) => [...prev, botMessage]);

          // If backend returned exit message, exit the flow and create new session
          const isExitResponse =
            (answer.toLowerCase().includes("exited") &&
              answer.toLowerCase().includes("course progress")) ||
            (answer.includes("✅") && answer.toLowerCase().includes("exited"));
          if (isExitResponse) {
            handleFlowExit({ newSession: true, skipTTSInterrupt: true });
          }

          // Play TTS if voice-initiated
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
            text: `❌ Error: ${err.message || "Unknown error occurred"}`,
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    } else if (targetFlow === "leave_approval") {
      // Exit command: handle exit immediately (no backend for leave approval)
      if (
        flowToExitOnCommand === "leave_approval" ||
        (isExitCommand && targetFlow === "leave_approval")
      ) {
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: "✅ Exited. How can I help you next?",
          },
        ]);
        handleFlowExit({ newSession: true, skipTTSInterrupt: true });
        setIsProcessing(false);
        try {
          if (isVoiceTriggeredRequestRef.current === true) {
            void handlePlayTTS(
              -1,
              "You've exited the leave approval flow. How can I help you next?",
            );
          }
        } catch (ttsErr) {
          console.error("TTS playback failed:", ttsErr);
        }
        return;
      }

      // Leave approval flow - only fetch if we don't have requests already
      // The fetch should happen when flow is activated from dropdown, not on every message
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

            // TTS: voice-only, strictly gated. Do NOT speak when input was typed
            // or for any other flow. This uses the request-scoped ref that is set
            // only when the microphone-based submission finalizes.
            try {
              if (
                isVoiceTriggeredRequestRef.current === true &&
                targetFlow === "leave_approval"
              ) {
                const count = (response.data.leaveRequests || []).length || 0;
                let speech = "";
                if (count > 0) {
                  speech = `📋 Leave Approval Dashboard. Found ${count} pending leave request${
                    count === 1 ? "" : "s"
                  } for your approval. Please review each request below and take action by either: ✅ Approve - Click the green \"Approve\" button. ❌ Reject - Enter a rejection reason and click the red \"Reject\" button`;
                } else {
                  speech = `Leave Approval Dashboard. Found 0 pending leave request(s) for your approval.`;
                }

                // Use the component's TTS helper to play speech. Pass a non-disruptive index.
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
        // If requests are already loaded, just acknowledge the message
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

  // TTS playback function - supports interruption in Full Voice Mode
  // Uses request ID to ensure only the latest TTS request plays
  // `isQuery` marks whether this is a query-flow TTS (true) or an
  // action-flow / system message TTS (false). Backend uses this flag
  // to decide whether to generate a summarized TTS or speak raw text.
  const handlePlayTTS = async (
    idx: number,
    text: string,
    _isQuery: boolean = false,
  ) => {
    // Interrupt any currently playing TTS before starting new one
    interruptTTS();

    // Increment request ID - this marks any previous in-flight requests as stale
    ttsRequestIdRef.current += 1;
    const thisRequestId = ttsRequestIdRef.current;

    console.log(
      `[TTS] Request #${thisRequestId} started for: "${text.substring(0, 50)}..."`,
    );

    setTtsLoading(idx);
    let audioUrl: string | null = null;
    try {
      // Generate unique ID to prevent backend cache from returning wrong audio
      const uniqueId = `tts_${Date.now()}_${thisRequestId}`;
      const reader = await aiAPI.textToSpeech({
        text,
        uuid_question: uniqueId,
        skip_insight: !_isQuery,
      });

      // Check if this request is still the latest (not cancelled by a newer request)
      if (ttsRequestIdRef.current !== thisRequestId) {
        console.log(
          `[TTS] Request #${thisRequestId} cancelled (newer request #${ttsRequestIdRef.current} exists)`,
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

        // Check again during streaming if request is still valid
        if (ttsRequestIdRef.current !== thisRequestId) {
          console.log(
            `[TTS] Request #${thisRequestId} cancelled during streaming`,
          );
          setTtsLoading(null);
          return;
        }
      }

      // Final check before creating audio
      if (ttsRequestIdRef.current !== thisRequestId) {
        console.log(
          `[TTS] Request #${thisRequestId} cancelled before playback`,
        );
        setTtsLoading(null);
        return;
      }

      const audioBlob = new Blob(audioChunks as BlobPart[], {
        type: "audio/wav",
      });
      audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      // Store URL and request ID on audio element for cleanup
      (audio as any)._ttsUrl = audioUrl;
      (audio as any)._requestId = thisRequestId;

      // Store audio reference for interruption
      currentTTSAudioRef.current = audio;

      // Handle cleanup when audio ends naturally
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
      };

      // Handle errors during playback
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

      // Final check right before playing
      if (ttsRequestIdRef.current !== thisRequestId) {
        console.log(
          `[TTS] Request #${thisRequestId} cancelled right before play`,
        );
        URL.revokeObjectURL(audioUrl);
        setTtsLoading(null);
        return;
      }

      // Play audio and handle play promise rejection
      console.log(`[TTS] Request #${thisRequestId} playing`);
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
      // Don't show alert for cancelled requests
      if (ttsRequestIdRef.current === thisRequestId) {
        console.error("Failed to play audio:", err);
      }
    }
  };

  const speakHealthCardBotMessage = (text: string) => {
    const shouldSpeak =
      fullVoiceMode ||
      isVoiceActive ||
      activeVoiceButtonRef.current !== null;
    if (!shouldSpeak || !text?.trim()) return;
    const cleaned = generateQueryTTSSummary(text);
    if (cleaned) void handlePlayTTS(-1, cleaned);
  };

  // Feedback handler: update feedback in chatHistory for the correct bot message
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

  // Removed unused inline editing functions - using main approval buttons instead

  // ============= UNIFIED ATTENDANCE FLOW CALLBACKS =============
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
    getGlobalAttendanceData: () => attendanceDataRef.current, // Use ref for current value in closures
    getGlobalClassInfo: () => classInfoRef.current, // Use ref for current value in closures
    setEditingMessageIndex: (index) => setEditingMessageIndex(index),
    getChatHistoryLength: () => chatHistory.length,
    exitFlow: () => handleFlowExit({ newSession: false }),
    exitFlowWithNewSession: () =>
      handleFlowExit({ newSession: true, skipTTSInterrupt: true }),
    setProcessing: setIsProcessing,
    playTTS: (index, text) => void handlePlayTTS(index, text),
    submitMessage: (message: string) => handleSubmit(message),
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

  // Handle class info modal confirmation Ã¢â‚¬â€ delegates to unified attendance flow
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

  // Unified attendance data manager
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

    // Debug: Show all messages in chat history
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

    // Priority 0: If messageIndex is provided, check that specific message FIRST (highest priority for saved/edited data)
    if (
      messageIndex !== undefined &&
      messageIndex >= 0 &&
      messageIndex < chatHistory.length
    ) {
      const targetMessage = chatHistory[messageIndex];
      console.log(
        `Ã°Å¸â€Â Priority 0: Checking provided message index ${messageIndex} first (highest priority for saved/edited data):`,
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
          `✅ Priority 0: Found attendance data in provided message index ${messageIndex} (saved/edited data):`,
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

    // Priority 1: If we're currently editing, use the global state (edited data)
    if (editingMessageIndex !== null && attendanceData.length > 0) {
      console.log("✅ Priority 1: Using edited data from global state");
      return {
        attendanceData: attendanceData,
        classInfo: classInfo,
        source: "edited_global_state",
      };
    }

    // Priority 2: Search chat history from most recent to oldest for messages with attendance_summary
    console.log(
      "Ã°Å¸â€Â Priority 2: Searching for attendance data in chat history (from most recent)...",
    );
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      // Skip the message at messageIndex if it was already checked in Priority 0
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
          `✅ Priority 2: Found attendance data in message ${i}:`,
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

    // Priority 3: Try to find any message with buttons (attendance message)
    console.log("Ã°Å¸â€Â Priority 3: Searching for messages with buttons...");
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      // Skip the message at messageIndex if it was already checked in Priority 0
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
        // Try to get data from this message or use global state
        if (msg.attendance_summary && msg.attendance_summary.length > 0) {
          console.log(
            `✅ Priority 3: Using attendance data from button message ${i}:`,
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
            `✅ Priority 3: Using global state for button message ${i}:`,
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

    // Priority 4: Use global state as fallback (if not editing)
    if (attendanceData.length > 0) {
      console.log("✅ Priority 4: Using global state as fallback");
      return {
        attendanceData: attendanceData,
        classInfo: classInfo || fallbackClassInfo,
        source: "global_state_fallback",
      };
    }

    // Priority 5: Use fallbackAttendanceData and fallbackClassInfo if provided (captured from button closure)
    if (fallbackAttendanceData && fallbackAttendanceData.length > 0) {
      console.log(
        "✅ Priority 5: Using fallback attendance data (captured from button closure):",
        fallbackAttendanceData.length,
        "records",
      );
      return {
        attendanceData: fallbackAttendanceData,
        classInfo: fallbackClassInfo || classInfo,
        source: "fallback_captured_data",
      };
    }

    // Priority 6: Last resort - try to get data from session storage
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

        console.log("✅ Priority 6: Using session storage data:", {
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

    console.log("❌ No attendance data found in any priority");
    return null;
  };

  // Unified attendance approval handler
  const handleUnifiedAttendanceApproval = async (
    messageIndex?: number,
    attendanceType: "text" | "image" | "voice" = "text",
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any,
  ) => {
    console.log(
      `Ã°Å¸Å¡â‚¬ ${attendanceType.toUpperCase()} Attendance Approval clicked for message:`,
      messageIndex,
    );
    console.log(`Ã°Å¸Å¡â‚¬ Current global state:`, {
      attendanceData: attendanceData,
      attendanceDataLength: attendanceData.length,
      classInfo: classInfo,
      editingMessageIndex: editingMessageIndex,
      chatHistoryLength: chatHistory.length,
      fallbackAttendanceData: fallbackAttendanceData,
      fallbackClassInfo: fallbackClassInfo,
    });

    // Add loading state to prevent multiple clicks
    setChatHistory((prev) => [
      ...prev,
      {
        type: "bot",
        text: `Ã¢ÂÂ³ Processing ${attendanceType} attendance approval...`,
      },
    ]);

    try {
      // Get attendance data using unified method with fallback data
      const dataToSave = getAttendanceDataForApproval(
        messageIndex,
        fallbackAttendanceData,
        fallbackClassInfo,
      );

      console.log(`Ã°Å¸Å¡â‚¬ Data to save result:`, dataToSave);

      if (!dataToSave) {
        console.error(
          `❌ No attendance data found for ${attendanceType} approval`,
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
        `Ã°Å¸Å½Â¯ Date being sent to backend: '${dataToSave.classInfo?.date}'`,
      );

      // Send approval message to backend with the current data
      const data = await aiAPI.chat({
        session_id: sessionId || userId,
        query: `approve_attendance: ${JSON.stringify({
          attendance_summary: dataToSave.attendanceData,
          class_info: dataToSave.classInfo,
        })}`, // Send the current attendance data
        user_id: userId, // Pass user_id for context
      });
      if (data.status === "success") {
        // Remove the loading message and show success message
        setChatHistory((prev) => {
          const filtered = prev.filter(
            (msg) => !(msg.text && msg.text.includes("Ã¢ÂÂ³ Processing")),
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

        // TTS for success message if voice-initiated
        try {
          if (attendanceVoiceInitiatedRef.current === true) {
            const speech = generateAttendanceTTSSummary(
              "Attendance marked successfully",
            );
            void handlePlayTTS(-1, speech);
            // Clear the ref after successful completion
            attendanceVoiceInitiatedRef.current = false;
          }
        } catch (ttsErr) {
          console.error("TTS playback failed:", ttsErr);
        }

        // Clear the editing state
        setEditingMessageIndex(null);
        setAttendanceData([]);
        setClassInfo(null);

        // Return to LLM routing after completion; use centralized exit to clear state + TTS
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
      const errorMessage = `❌ Failed to save ${attendanceType} attendance: ${
        (err as Error).message
      }`;
      setChatHistory((prev) => {
        const filtered = prev.filter(
          (msg) => !(msg.text && msg.text.includes("Ã¢ÂÂ³ Processing")),
        );
        return [
          ...filtered,
          {
            type: "bot",
            text: errorMessage,
          },
        ];
      });

      // TTS for error message if voice-initiated
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

  // Handle text-based attendance approval - save to MongoDB
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

  // Handle text-based attendance rejection - send "reject" to backend so it clears state; backend response prompts for new data
  const handleTextAttendanceRejection = () => {
    console.log("Text Attendance Rejection clicked");
    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);
    // Send "reject" to backend so session state is cleared; next user message will be treated as new attendance data
    void handleSubmit("reject");
  };

  // Handle voice-based attendance approval - save to MongoDB
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

  // Handle voice-based attendance rejection - clear data and show options
  // @ts-expect-error - Kept for future use
  const _handleVoiceAttendanceRejection = () => {
    console.log("Voice Attendance Rejection clicked");

    // Clear the attendance data
    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);

    // Show rejection message with options
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

  // Handle save attendance - save edited information and update the table
  const handleSaveAttendance = async (messageIndex: number) => {
    console.log("Save Attendance clicked for message:", messageIndex);
    console.log("Current global attendanceData:", attendanceData);
    console.log("Current global classInfo:", classInfo);
    console.log("Editing message index:", editingMessageIndex);

    try {
      // Get the current message to check if it has data
      const currentMessage = chatHistory[messageIndex];
      console.log("Current message:", currentMessage);
      console.log(
        "Message attendance_summary:",
        currentMessage?.attendance_summary,
      );

      // Use global state if we're editing, otherwise use message data
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
        // Update the specific message's attendance_summary with the edited data
        setChatHistory((prev) => {
          const updatedHistory = prev.map((msg, idx) => {
            if (idx === messageIndex && msg.type === "bot") {
              return {
                ...msg,
                attendance_summary: [...currentAttendanceData], // Update with edited data
                class_info: currentClassInfo,
                // Update the answer text to reflect the changes
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

        // Update global state with the edited data so it's available for approval
        setAttendanceData([...currentAttendanceData]);
        setClassInfo(currentClassInfo);

        // Store in session storage for persistence
        sessionStorage.setItem(
          "pendingAttendanceData",
          JSON.stringify(currentAttendanceData),
        );
        sessionStorage.setItem(
          "pendingClassInfo",
          JSON.stringify(currentClassInfo),
        );

        // Exit edit mode AFTER updating global state
        // This ensures that when user clicks Approve, Priority 1.5 will use the updated global state
        setEditingMessageIndex(null);

        // Clear the isBeingEdited flag from the message
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

        // Capture the edited data at the time of save to pass to approval button
        // This ensures the button closure has the most current edited data
        const capturedSavedAttendanceData = [...currentAttendanceData];
        const capturedSavedClassInfo = currentClassInfo
          ? { ...currentClassInfo }
          : null;

        // Show success message with updated buttons (no Save button since we're now in read-only mode)
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: `✅ Attendance data saved successfully! The table has been updated with your changes. Current data: ${currentAttendanceData.length} students recorded. You can now review the final attendance summary before approving.`,
            buttons: [
              {
                label: "Edit Attendance",
                action: () => {
                  // Use the captured data or load from the message
                  setChatHistory((prev) => {
                    const updatedHistory = [...prev];
                    const message = updatedHistory[messageIndex];
                    if (
                      message &&
                      message.type === "bot" &&
                      message.attendance_summary
                    ) {
                      // Load the updated data from the message back into global state for editing
                      setAttendanceData(message.attendance_summary);
                      setClassInfo(message.class_info);
                      setEditingMessageIndex(messageIndex);

                      // Mark message as being edited
                      if (updatedHistory[messageIndex]) {
                        (updatedHistory[messageIndex] as any).isBeingEdited =
                          true;
                      }
                      return updatedHistory;
                    }
                    return prev;
                  });

                  // Add edit mode message
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
                    "✅ Approve button clicked after save - using captured data:",
                    {
                      capturedSavedAttendanceData:
                        capturedSavedAttendanceData.length,
                      capturedSavedClassInfo: capturedSavedClassInfo,
                      messageIndex: messageIndex,
                    },
                  );

                  // Determine attendance type based on the source (default to text)
                  let attendanceType: "text" | "image" | "voice" = "text";

                  // Pass the captured edited data as fallback parameters
                  // This ensures the edited data is used even if chatHistory hasn't updated yet
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

  const handleSaveColumn = async (
    columnTitle: string,
    studentData: any[],
    saveSessionId?: string,
  ) => {
    try {
      const result = await sendColumnSave({
        columnTitle,
        studentData,
        sessionId: saveSessionId || sessionId,
        userId,
        getErpContext,
      });
      const answerText = String(result?.data?.answer || "");
      const columnSavedText = String(result?.data?.column_saved || "");
      const isExpectedSaveResponse =
        columnSavedText.trim().toLowerCase() ===
          columnTitle.trim().toLowerCase() ||
        answerText.toLowerCase().includes("saved for all students");

      if (isExpectedSaveResponse && answerText) {
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            answer: answerText,
            activeTab: "answer",
          },
        ]);
      } else if (!isExpectedSaveResponse) {
        // Suppress unexpected flow prompts (e.g., class/term question) from appearing
        // during table save; keep the table context stable.
        console.warn("Ignored unexpected marks-save response", {
          columnTitle,
          answerText,
          columnSavedText,
        });
      }

      // Marks save can happen from table clicks while voice mode is active,
      // so explicitly speak backend-provided TTS for save confirmations.
      const shouldSpeakSaveMessage =
        fullVoiceMode || isVoiceActive || activeVoiceButtonRef.current !== null;
      if (shouldSpeakSaveMessage && isExpectedSaveResponse) {
        const ttsFromBackend = result?.data?.tts_text;
        const textToSpeakRaw =
          ttsFromBackend != null && ttsFromBackend !== ""
            ? ttsFromBackend
            : answerText
              ? generateQueryTTSSummary(answerText)
              : "";
        const textToSpeak = textToSpeakRaw
          .replace(/\|/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (textToSpeak) {
          void handlePlayTTS(-1, textToSpeak);
        }
      }

      return Boolean(result?.success) && isExpectedSaveResponse;
    } catch (error) {
      console.error("Save column error:", error);
      return false;
    }
  };

  // Scroll chat to bottom on new message
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const correctionBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Close menu when clicking outside
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Close correction box when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if click is inside a correction box
      const isInsideCorrectionBox = target.closest(".correction-box");

      // Check if click is on any action button (to allow toggling)
      const isActionButton = target.closest(".bot-action-btn");

      // If click is outside correction box and not on an action button, close it
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
    setLeaveApprovalRequests,
    setRejectReason,
    setLoadingLeaveRequests,
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
    handleSaveColumn,
    handleUnifiedAttendanceApproval,
    handleTextAttendanceRejection,
    leaveApprovalRequests,
    loadingLeaveRequests,
    rejectReason,
    inputText,
    setInputText,
    isRecording,
    fullVoiceMode,
    isFullVoiceConnecting,
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
    speakHealthCardBotMessage,
  };
}
