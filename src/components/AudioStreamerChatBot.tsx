import { useEffect, useRef, useState } from "react";
import { memo } from "react";
import { motion } from "framer-motion";
import {
  FiHeadphones,
  FiMic,
  FiMicOff,
  FiMoreVertical,
  FiSend,
  FiThumbsDown,
  FiThumbsUp,
  FiUpload,
  FiVolume2,
} from "react-icons/fi";
import { SlBubbles } from "react-icons/sl";
import "./markdown-tables.css";

// Added icons
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ClassInfoModal from "./ClassInfoModal";
import {
  aiAPI,
  userAPI,
  leaveApprovalAPI,
  getAIHeaders,
} from "../services/api";
import { API_BASE_URL } from "../config/api";
import { WebRTCAudioService } from "../services/webrtcAudio";
import {
  handleAssignmentChat,
  handleAssignmentFileUpload,
} from "./flows/assignmentFlow";
import {
  handleAttendanceChat,
  handleAttendanceImageUpload,
  INITIAL_ATTENDANCE_STATE,
  generateAttendanceTTSSummary,
} from "./flows/attendanceFlow";
import {
  handleLeaveChat,
  generateLeaveTTSSummary,
} from "./flows/leaveFlow";
import type {
  AttendanceState,
  AttendanceFlowCallbacks,
  ClassInfo,
  AttendanceRecord,
} from "./flows/attendanceFlow";
import { handleLeaveChat } from "./flows/leaveApplicationFlow";
// Removed separate editable component - using inline editing instead
type TabType = "answer" | "references" | "query";
type FlowType =
  | "none"
  | "query"
  | "attendance"
  | "voice_attendance"
  | "full_voice_attendance"
  | "leave"
  | "leave_approval"
  | "assignment"
  | "course_progress"
  // Legacy types - kept for backward compatibility but not used
  | "_legacy_attendance_disabled"
  | "_legacy_voice_attendance_disabled";
const AudioStreamerChatBot = ({
  userId,
  roles,
  email,
}: {
  userId: string;
  roles: string;
  email: string;
}) => {
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
  const courseProgressVoiceInitiatedRef = useRef<boolean>(false);
  // Flag to remember that the current Leave flow was initiated
  // via the microphone. This persists so we can play TTS for leave responses.
  const leaveVoiceInitiatedRef = useRef<boolean>(false);
  // Flag to remember that the current Attendance flow was initiated
  // via the microphone. This persists so we can play TTS for attendance responses.
  const attendanceVoiceInitiatedRef = useRef<boolean>(false);

  const [userOptionSelected, setUserOptionSelected] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [sessionId, setSessionId] = useState<string | null>(null); // <-- add
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
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false); // Voice activity indicator
  const currentTTSAudioRef = useRef<HTMLAudioElement | null>(null); // Track current TTS audio for interruption
  const ttsRequestIdRef = useRef<number>(0); // Track TTS request ID to cancel stale requests
  const turnCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  ); // Debounce turn-complete
  const [_lastVoiceInputTime, setLastVoiceInputTime] = useState<number>(0);
  const activeFlowRef = useRef<FlowType>("none"); // Sync with activeFlow; use in stay-in-flow to avoid stale state // <-- add for tracking last voice input time

  // Shared helper: get academic session and branch token dynamically
  const getErpContext = () => {
    const academic_session =
      localStorage.getItem("academic_session") || "2025-26";
    const branch_token = localStorage.getItem("branch_token") || "demo";
    return { academic_session, branch_token };
  };

  // const [autoRouting, setAutoRouting] = useState<boolean>(true); // Enable auto-routing by default
  // const [_detectedFlow, setDetectedFlow] = useState<string | null>(null); // Show detected flow to user
  // const [_classificationConfidence, setClassificationConfidence] =useState<number>(0);
  // const [fullVoiceAutoSubmitTimer, setFullVoiceAutoSubmitTimer] = useState<ReturnType<typeof setTimeout> | null>(null); // <-- add for full voice auto-submit timer
  // const [_lastVoiceInputTime, setLastVoiceInputTime] = useState<number>(0); // <-- add for tracking last voice input time
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

  // Fetch user info and session id on mount (or when userId changes)
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
      `🛑 TTS interrupted - new request ID: ${ttsRequestIdRef.current}`,
    );

    if (currentTTSAudioRef.current) {
      const audio = currentTTSAudioRef.current;
      // Always interrupt if audio exists - pause and reset
      console.log("🛑 Interrupting TTS playback", {
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

  const startStreaming = async (useFullVoice = false) => {
    try {
      // Reset text tracking for new recording session
      lastInterimTextRef.current = "";
      finalTextRef.current = "";

      // Create WebRTC service instance
      const webrtcService = new WebRTCAudioService();
      webrtcServiceRef.current = webrtcService;

      // Connect with callbacks; pass useFullVoice for Full Voice Mode
      await webrtcService.connect(
        selectedLanguage,
        {
          onTranscript: (text: string, isFinal: boolean) => {
            const trimmed = text.trim();
            if (!trimmed) return;

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

            // Full-voice flows (attendance, assignment): 3-second auto-submit
            const useFullVoiceTimer =
              activeFlow === "full_voice_attendance" ||
              (activeFlow === "assignment" && useFullVoice);
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
                if (!finalInput || isProcessing) return;
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
          },
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
      setIsVoiceActive(false);
    }
  };

  const stopStreaming = async (skipSubmit = false) => {
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
      session_id: sessionId || userId,
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
        session_id: sessionId || userId,
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

        console.log("🔍 Query Classification:", {
          query: message,
          detectedFlow: flow,
          confidence: `${(confidence * 100).toFixed(0)}%`,
          entities,
        });

        return { flow, confidence, entities };
      }

      // Fallback
      return { flow: "query", confidence: 0.8, entities: {} };
    } catch (error) {
      console.error("❌ Classification error:", error);
      return { flow: "query", confidence: 0.8, entities: {} };
    }
  };

  const handleSubmit = async (overrideMessage?: string) => {
    const userMessage = (overrideMessage ?? inputText).trim();
    if (!userMessage) return;

    console.log("🚀 handleSubmit START:", {
      userMessage,
      activeFlow,
      userOptionSelected,
      autoRouting,
    });

    setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
    setInputText("");
    setIsProcessing(true);

    // CHECK FOR EXIT KEYWORDS - Exit current flow immediately
    // Strip trailing punctuation (voice transcription often adds "." or "?" or "!")
    const exitKeywords = ["exit", "cancel", "restart", "quit", "stop", "done"];
    const normalizedForExit = userMessage
      .toLowerCase()
      .trim()
      .replace(/[.!?,;:'"]+$/, "");
    const isExitCommand = exitKeywords.some(
      (keyword) => normalizedForExit === keyword,
    );

    if (isExitCommand && activeFlow !== "none" && activeFlow !== "query") {
      console.log("🚪 Exit command detected, exiting flow:", activeFlow);
      if (activeFlow === "leave") {
        leaveVoiceInitiatedRef.current = false;
      }
      if (activeFlow === "course_progress") {
        courseProgressVoiceInitiatedRef.current = false;
      }
      if (activeFlow === "attendance" || activeFlow === "voice_attendance") {
        attendanceVoiceInitiatedRef.current = false;
      }
      if (
        activeFlow === "full_voice_attendance" ||
        activeFlow === "assignment"
      ) {
        if (fullVoiceAutoSubmitTimer) {
          clearTimeout(fullVoiceAutoSubmitTimer);
          setFullVoiceAutoSubmitTimer(null);
        }
      }
      activeFlowRef.current = "none";
      setActiveFlow("none");
      setAttendanceStep("class_info");
      setPendingClassInfo(null);
      const exitMessage = `✅ Exited from ${activeFlow} flow.\nWelcome back! You can ask me anything`;
      setChatHistory((prev) => [
        ...prev,
        { type: "bot", text: exitMessage },
      ]);
      try {
        if (isVoiceTriggeredRequestRef.current === true) {
          void handlePlayTTS(-1, generateQueryTTSSummary(exitMessage));
        }
      } catch (ttsErr) {
        console.error("Exit TTS playback failed:", ttsErr);
      }
      setIsProcessing(false);
      setDetectedFlow(null);
      return;
    }

    // AUTO-ROUTING: Classify query if auto-routing is enabled and no manual flow selected
    let targetFlow = activeFlow;
    let classificationResult = null;

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

    // Stay in active flow if user is responding (not starting new request)
    // If already in leave/assignment and message doesn't look like a new request, stay in flow
    // Don't check userOptionSelected - if activeFlow is set, we're in that flow
    const inLeave = activeFlowRef.current === "leave" || activeFlow === "leave";
    const inAssignment =
      activeFlowRef.current === "assignment" || activeFlow === "assignment";
    const inLeaveFlow = inLeave && !looksLikeNewRequest;
    const inAssignmentFlow = inAssignment && !looksLikeNewRequest;

    console.log("🔧 Auto-routing check:", {
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
      // Stay in current flow if we're in the middle of a multi-step process
      console.log("📍 Staying in current flow (multi-step process active)");
      targetFlow = activeFlowRef.current;
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
          "📍 Simple response detected, keeping current flow:",
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
          "📍 Short response in active flow, staying in:",
          activeFlowRef.current,
        );
        targetFlow = activeFlowRef.current;
      } else {
        // Run classification for every new query when auto-routing is enabled
        console.log("📍 Running classification...");
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
              "📍 Lexical override: forcing leave_approval based on tokens",
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
          } else {
            classificationResult = await classifyQuery(userMessage);
            console.log("✅ Classification complete:", classificationResult);
            targetFlow = classificationResult.flow as FlowType;
          }

          // Map backend flow names to frontend flow types
          if (targetFlow === ("assignment_create" as any)) {
            targetFlow = "assignment";
          } else if (targetFlow === ("assignment_submit" as any)) {
            targetFlow = "assignment"; // For now, both map to same flow
          }
        } catch (error) {
          console.error("❌ Classification error:", error);
          targetFlow = "query"; // Fallback to query on error
        }
      }

      console.log("📍 Target flow determined:", targetFlow);

      // Update UI to show detected flow
      setDetectedFlow(targetFlow);

      // Only update confidence if we actually ran classification
      if (classificationResult) {
        setClassificationConfidence(classificationResult.confidence);

        // Low confidence warning (but still proceed)
        if (classificationResult.confidence < 0.25) {
          console.warn("⚠️ Low classification confidence, defaulting to query");
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
        console.log("📍 Initializing unified attendance flow state");
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

      // Check if this is a new flow initialization (user just switched flows)
      const isNewFlowInitialization =
        classificationResult &&
        (activeFlow === "none" ||
          activeFlow === "query" ||
          activeFlow !== targetFlow);

      // Initialize assignment flow
      if (targetFlow === "assignment" && isNewFlowInitialization) {
        console.log("📍 Initializing assignment flow state");
        console.log("📍 Setting activeFlow to 'assignment'");

        // IMPORTANT: Set activeFlow (and ref) BEFORE processing the message
        activeFlowRef.current = "assignment";
        setActiveFlow("assignment");

        console.log("📍 Processing first assignment message");
        // Don't return here - let the user's message be processed by the API
        // This avoids duplicate prompts for the assignment name
      }

      // Initialize leave flow
      if (targetFlow === "leave" && isNewFlowInitialization) {
        console.log("📍 Initializing leave flow state");

        // IMPORTANT: Set activeFlow (and ref) BEFORE processing the message
        activeFlowRef.current = "leave";
        setActiveFlow("leave");

        // If this leave flow was started by voice, mark it so TTS plays for all leave responses
        if (isVoiceTriggeredRequestRef.current === true) {
          leaveVoiceInitiatedRef.current = true;
          console.log("🎤 Leave flow voice-initiated: TTS will play for leave responses");
        }
        // Consume trigger so it doesn't leak to later requests
        isVoiceTriggeredRequestRef.current = false;

        // Don't return - let the flow continue to make the API call.
        // The backend leave agent will return the initial prompt (Step 1: Half Day / Full Day / Long Leave).
        console.log("📍 Leave flow initialized, continuing to API call...");
      }
    } else {
      console.log("📍 Using current activeFlow:", activeFlow);
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

    console.log("📍 Routing to flow:", targetFlow);
    console.log("📍 Current attendance step:", attendanceStep);
    console.log("📍 Pending class info:", pendingClassInfo);

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
      console.log("📍 Continuing attendance at student_details step");
      // Keep the current step - don't reset
    }

    if (targetFlow === "query") {
      // Query handler API
      try {
        const data = await aiAPI.queryHandler({
          user_id: userId,
          user_roles: roles,
          query: userMessage,
        });
        let answerForTts = "";
        if (data.status === "success" && data.data) {
          const answer = data.data?.answer ?? "";
          answerForTts = answer;
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              answer: data.data?.answer,
              references: data.data?.references,
              mongodbquery: data.data?.mongodbquery,
              activeTab: "answer", // Set initial active tab
            },
          ]);
        } else if (data.status === "error" && data.message) {
          answerForTts = data.message;
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: data.message },
          ]);
        } else {
          answerForTts = "No response from AI.";
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: "No response from AI." },
          ]);
        }
        // TTS when user spoke (voice-triggered) so output is also in voice
        try {
          if (isVoiceTriggeredRequestRef.current === true) {
            const speech = generateQueryTTSSummary(answerForTts);
            // Mark as QUERY flow so backend can generate/query-specific TTS
            void handlePlayTTS(-1, speech, true);
          }
        } catch (ttsErr) {
          console.error("Query TTS playback failed:", ttsErr);
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
          if (isVoiceTriggeredRequestRef.current === true) {
            // Treat query error as QUERY flow for TTS
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
      // ============= UNIFIED ATTENDANCE FLOW =============
      // Handles text, voice, and image-based attendance in a single unified flow
      try {
        await handleAttendanceChat({
          userMessage,
          sessionId: sessionId || userId,
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
      await handleLeaveChat({
        userMessage,
        sessionId,
        userId,
        isVoiceTriggered: leaveMessageViaVoice,
        voiceInitiatedFlow: leaveVoiceInitiatedRef.current,
        getErpContext,
        appendBotMessage: (msg) =>
          setChatHistory((prev) => [...prev, msg]),
        exitFlow: () => {
          leaveVoiceInitiatedRef.current = false;
          activeFlowRef.current = "none";
          setActiveFlow("none");
        },
        setProcessing: setIsProcessing,
        playTTS: (idx, text) => void handlePlayTTS(idx, text),
        setActiveFlow: (flow) => setActiveFlow(flow as FlowType),
      });
    } else if (targetFlow === "assignment") {
      await handleAssignmentChat({
        userMessage,
        sessionId,
        userId,
        isVoiceTriggered: isVoiceTriggeredRequestRef.current === true,
        getErpContext,
        appendBotMessage: (msg) => setChatHistory((prev) => [...prev, msg]),
        exitFlow: () => {
          activeFlowRef.current = "none";
          setActiveFlow("none");
        },
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
          session_id: sessionId || `session_${userId}`,
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

  // Memoized answer component to prevent refresh on re-renders
  const MemoizedAnswer = memo(
    ({ answer, messageIdx }: { answer: string; messageIdx: number }) => {
      return (
        <div
          key={`answer-${messageIdx}-${answer.slice(0, 20)}`}
          className="markdown-content"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Wrap tables in a scrollable container
              table: ({ node, ...props }) => (
                <div className="markdown-table-container">
                  <table {...props} />
                </div>
              ),
            }}
          >
            {answer || ""}
          </ReactMarkdown>
        </div>
      );
    },
    (prevProps, nextProps) => {
      // Only re-render if answer actually changed
      return (
        prevProps.answer === nextProps.answer &&
        prevProps.messageIdx === nextProps.messageIdx
      );
    },
  );

  // Helper for query-flow TTS: strip markdown and truncate for voice playback
  const generateQueryTTSSummary = (answer: string): string => {
    if (!answer || !answer.trim()) return "No response.";
    const cleaned = answer
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`[^`]*`/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/📝|✅|❌|⚠️|•|🎯|📋|🔍|#/g, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const max = 300;
    return cleaned.length <= max
      ? cleaned
      : cleaned.substring(0, max).trim() + "...";
  };

  // TTS playback function - supports interruption in Full Voice Mode
  // Uses request ID to ensure only the latest TTS request plays
  // `isQuery` marks whether this is a query-flow TTS (true) or an
  // action-flow / system message TTS (false). Backend uses this flag
  // to decide whether to generate a summarized TTS or speak raw text.
  const handlePlayTTS = async (idx: number, text: string, isQuery: boolean = false) => {
    // Interrupt any currently playing TTS before starting new one
    interruptTTS();

    // Increment request ID - this marks any previous in-flight requests as stale
    ttsRequestIdRef.current += 1;
    const thisRequestId = ttsRequestIdRef.current;

    console.log(
      `🔊 TTS Request #${thisRequestId} started for: "${text.substring(0, 50)}..."`,
    );

    setTtsLoading(idx);
    let audioUrl: string | null = null;
    try {
      // Generate unique ID to prevent backend cache from returning wrong audio
      const uniqueId = `tts_${Date.now()}_${thisRequestId}`;
      const reader = await aiAPI.textToSpeech({
        text,
        uuid_question: uniqueId,
        skip_insight: true,
      });

      // Check if this request is still the latest (not cancelled by a newer request)
      if (ttsRequestIdRef.current !== thisRequestId) {
        console.log(
          `🔇 TTS Request #${thisRequestId} cancelled (newer request #${ttsRequestIdRef.current} exists)`,
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
            `🔇 TTS Request #${thisRequestId} cancelled during streaming`,
          );
          setTtsLoading(null);
          return;
        }
      }

      // Final check before creating audio
      if (ttsRequestIdRef.current !== thisRequestId) {
        console.log(
          `🔇 TTS Request #${thisRequestId} cancelled before playback`,
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
          `🔇 TTS Request #${thisRequestId} cancelled right before play`,
        );
        URL.revokeObjectURL(audioUrl);
        setTtsLoading(null);
        return;
      }

      // Play audio and handle play promise rejection
      console.log(`🔊 TTS Request #${thisRequestId} playing`);
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

  // Helper for feedback color classes
  const getThumbsUpClass = (msg: any) =>
    msg.feedback === "Approved"
      ? "bot-action-btn thumbs-up-active"
      : "bot-action-btn";
  const getThumbsDownClass = (msg: any) =>
    msg.feedback === "Rejected"
      ? "bot-action-btn thumbs-down-active"
      : "bot-action-btn";

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
    exitFlow: () => {
      activeFlowRef.current = "none";
      setActiveFlow("none");
      setAttendanceStep("class_info");
      setAttendanceFlowState(INITIAL_ATTENDANCE_STATE);
      setAttendanceData([]);
      setClassInfo(null);
      setPendingClassInfo(null);
      setEditingMessageIndex(null);
      attendanceVoiceInitiatedRef.current = false;
      setAutoRouting(true);
    },
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

  // Handle class info modal confirmation — delegates to unified attendance flow
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
        `🔍 Priority 0: Checking provided message index ${messageIndex} first (highest priority for saved/edited data):`,
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
      "🔍 Priority 2: Searching for attendance data in chat history (from most recent)...",
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
    console.log("🔍 Priority 3: Searching for messages with buttons...");
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
      `🚀 ${attendanceType.toUpperCase()} Attendance Approval clicked for message:`,
      messageIndex,
    );
    console.log(`🚀 Current global state:`, {
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
        text: `⏳ Processing ${attendanceType} attendance approval...`,
      },
    ]);

    try {
      // Get attendance data using unified method with fallback data
      const dataToSave = getAttendanceDataForApproval(
        messageIndex,
        fallbackAttendanceData,
        fallbackClassInfo,
      );

      console.log(`🚀 Data to save result:`, dataToSave);

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
        `🎯 Date being sent to backend: '${dataToSave.classInfo?.date}'`,
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

        // Return to LLM routing after completion
        setTimeout(() => {
          activeFlowRef.current = "none";
          setActiveFlow("none");
          setAutoRouting(true);
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
          (msg) => !(msg.text && msg.text.includes("⏳ Processing")),
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

  // Handle text-based attendance rejection - clear data and show options
  const handleTextAttendanceRejection = () => {
    console.log("Text Attendance Rejection clicked");

    // Clear the attendance data
    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);

    // Show rejection message with options
    setChatHistory((prev) => [
      ...prev,
      {
        type: "bot",
        text: "❌ Attendance rejected. You can provide new attendance data or try a different approach.",
        buttons: [
          {
            label: "Try Again",
            action: () => {
              // Clear the message and let user type manually
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
              // Trigger file input click
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

  // Add these styles to your existing styles
  const additionalStyles = `
    .tab-container {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid rgba(212, 165, 116, 0.15);
      flex-wrap: wrap;
    }
    .tab-button {
      padding: 0.5rem 1rem;
      border-radius: 12px;
      border: 1.5px solid rgba(212, 165, 116, 0.2);
      font-size: clamp(0.75rem, 2vw, 0.875rem);
      cursor: pointer;
      background: rgba(255, 255, 255, 0.9);
      color: #8B7355;
      transition: all 0.3s ease;
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(212, 165, 116, 0.1);
      flex: 1;
      min-width: max-content;
      text-align: center;
    }
    .tab-button:hover {
      background: rgba(255, 255, 255, 1);
      border-color: rgba(212, 165, 116, 0.4);
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(212, 165, 116, 0.15);
    }
    .tab-button.active {
      background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
      color: #fff;
      border-color: #D4A574;
      box-shadow: 0 2px 8px rgba(212, 165, 116, 0.3);
      font-weight: 600;
    }
    .tab-button.active:hover {
      background: linear-gradient(135deg, #C9A882 0%, #D4A574 100%);
      box-shadow: 0 4px 12px rgba(212, 165, 116, 0.35);
    }
    .reference-item {
      padding: clamp(0.625rem, 2vw, 0.875rem);
      margin: 0.5rem 0;
      border-radius: 12px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 254, 251, 0.95) 100%);
      font-size: clamp(0.8rem, 2vw, 0.9rem);
      border: 1px solid rgba(212, 165, 116, 0.2);
      color: #8B7355;
      box-shadow: 0 2px 6px rgba(212, 165, 116, 0.12);
      transition: all 0.3s ease;
      word-break: break-word;
    }
    .reference-item:hover {
      box-shadow: 0 4px 10px rgba(212, 165, 116, 0.18);
      transform: translateY(-1px);
      border-color: rgba(212, 165, 116, 0.3);
    }
    .query-container {
      position: relative;
      max-height: min(300px, 60vh);
      overflow-y: auto;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 254, 251, 0.95) 100%);
      border-radius: 12px;
      padding: clamp(0.75rem, 2vw, 1rem);
      font-size: clamp(0.8rem, 2vw, 0.9rem);
      border: 1px solid rgba(212, 165, 116, 0.2);
      color: #8B7355;
      box-shadow: 0 2px 6px rgba(212, 165, 116, 0.12);
      word-break: break-word;
    }
    .query-actions {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      display: flex;
      gap: 0.5rem;
    }
    .query-button {
      background: rgba(255, 255, 255, 0.9);
      color: #8B7355;
      border: 1px solid rgba(212, 165, 116, 0.25);
      border-radius: 8px;
      padding: 0.4rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 1px 3px rgba(212, 165, 116, 0.1);
    }
    .query-button:hover {
      background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
      color: #fff;
      border-color: #D4A574;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(212, 165, 116, 0.25);
    }
    .copied-tooltip {
      position: absolute;
      top: -25px;
      right: 0;
      background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
      color: #fff;
      padding: 0.4rem 0.7rem;
      border-radius: 8px;
      font-size: 0.8rem;
      box-shadow: 0 2px 8px rgba(212, 165, 116, 0.3);
    }
    .bot-actions {
      display: flex;
      gap: clamp(0.4rem, 1.5vw, 0.7rem);
      align-items: center;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }
    .bot-actions-bottom {
      display: flex;
      gap: clamp(0.25rem, 1vw, 0.5rem);
      align-items: flex-end;
      justify-content: flex-end;
      margin-top: 0.75rem;
      margin-bottom: 0.1rem;
      position: relative;
      flex-wrap: wrap;
    }
    .bot-action-btn {
      background: transparent;
      border: 1px solid rgba(212, 165, 116, 0.2);
      border-radius: 50%;
      width: clamp(28px, 4vw, 32px);
      height: clamp(28px, 4vw, 32px);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: clamp(0.85em, 2vw, 0.95em);
      transition: all 0.2s ease;
      position: relative;
      color: #8B7355;
      padding: 0;
      min-width: clamp(28px, 4vw, 32px);
      min-height: clamp(28px, 4vw, 32px);
    }
    .bot-action-btn:hover {
      background: rgba(212, 165, 116, 0.1);
      color: #D4A574;
      border-color: rgba(212, 165, 116, 0.4);
      transform: scale(1.05);
    }
    .bot-action-btn.thumbs-up-active {
      background: rgba(34, 197, 94, 0.1);
      color: #22c55e;
      border-color: #22c55e;
    }
    .bot-action-btn.thumbs-down-active {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border-color: #ef4444;
    }
    .bot-action-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      background: rgba(224, 201, 166, 0.3);
      color: #8B7355;
      transform: none;
      border-color: rgba(212, 165, 116, 0.15);
    }
    .feedback-sent-tooltip {
      display: none;
    }
    .correction-box {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 254, 251, 0.95) 100%);
      color: #8B7355;
      border-radius: 10px;
      box-shadow: 0 2px 12px rgba(212, 165, 116, 0.2);
      padding: 0.5rem 0.625rem;
      min-width: 200px;
      max-width: min(280px, 85vw);
      width: max-content;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      z-index: 100;
      border: 1px solid rgba(212, 165, 116, 0.25);
      font-size: 0.8rem;
      backdrop-filter: blur(8px);
      margin-top: 0.25rem;
    }
    .correction-title {
      font-weight: 600;
      font-size: 0.8rem;
      margin-bottom: 0.1rem;
      color: #8B7355;
    }
    .correction-input {
      padding: 0.375rem 0.5rem;
      border-radius: 6px;
      border: 1.5px solid rgba(212, 165, 116, 0.3);
      font-size: 0.8rem;
      background: rgba(255, 255, 255, 0.95);
      color: #8B7355;
      margin-bottom: 0.2rem;
      outline: none;
      transition: all 0.3s ease;
      width: 100%;
      box-sizing: border-box;
    }
    .correction-input:focus {
      border-color: #D4A574;
      background: rgba(255, 255, 255, 1);
      box-shadow: 0 0 0 2px rgba(212, 165, 116, 0.15), 0 1px 4px rgba(212, 165, 116, 0.1);
    }
    .correction-btn {
      padding: 0.375rem 0.75rem;
      border-radius: 6px;
      border: none;
      background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
      color: #fff;
      font-weight: 500;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.3s ease;
      margin-left: auto;
      box-shadow: 0 1px 6px rgba(212, 165, 116, 0.25);
    }
    .correction-btn:hover {
      background: linear-gradient(135deg, #C9A882 0%, #b89772 100%);
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(212, 165, 116, 0.35);
    }
    .correction-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      background: rgba(224, 201, 166, 0.5);
    }
    .feedback-status-msg {
      margin-top: 0.5rem;
      font-size: 0.9rem;
      color: #D4A574;
      font-weight: 500;
      text-align: right;
    }
    /* Add markdown table styles */
    .chatbot-msg-bubble.bot table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5em 0;
      font-size: 0.95em;
      background: #ffffff;
    }
    .chatbot-msg-bubble.bot th,
    .chatbot-msg-bubble.bot td {
      border: 1px solid rgba(0, 0, 0, 0.08);
      padding: 8px 12px;
      text-align: left;
    }
    .chatbot-msg-bubble.bot th {
      background: #f5f5f5;
      font-weight: 600;
      color: #8B7355;
    }
    .chatbot-msg-bubble.bot tr:nth-child(even) {
      background: #fafafa;
    }
    .chatbot-msg-bubble.bot tr:hover {
      background: #f0f0f0;
    }
  `;

  return (
    <>
      {/* Class Info Modal */}
      <ClassInfoModal
        isOpen={showClassInfoModal}
        onClose={handleClassInfoCancel}
        onConfirm={handleClassInfoConfirm}
      />

      <style>
        {`
        * {
          box-sizing: border-box;
        }

        .bot-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .bot-text-btn {
          padding: 0.75rem 1.5rem;
          border-radius: 20px;
          background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
          color: #fff;
          border: none;
          cursor: pointer;
          min-width: 120px;
          flex: 1 1 auto;
          white-space: normal;
          word-break: break-word;
          text-align: center;
          transition: all 0.3s ease;
          font-weight: 500;
          font-size: 0.95rem;
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.25);
        }

        .bot-text-btn:hover {
          background: linear-gradient(135deg, #C9A882 0%, #b89772 100%);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(212, 165, 116, 0.35);
        }

        .bot-text-btn:active {
          transform: translateY(0);
        }

        .chatbot-root {
          width: 100vw;
          height: 100vh;
          min-height: 100vh;
          min-width: 100vw;
          background: linear-gradient(to bottom, #f8f6f3, #faf8f6, #efeae4);
          display: flex;
          flex-direction: column;
          justify-content: stretch;
          align-items: stretch;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
          transition: background 0.4s;
          padding: 0;
          margin: 0;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }
        .chatbot-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(rgba(212,165,116,0.02) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(212,165,116,0.02) 1px, transparent 1px);
          background-size: 50px 50px;
          pointer-events: none;
          opacity: 0.5;
        }
        .chatbot-topbar {
          position: absolute;
          top: 1rem;
          right: 1rem;
          display: flex;
          gap: 0.75rem;
          z-index: 11;
          flex-wrap: wrap;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 0.875rem 1.25rem;
          border-radius: 20px;
          box-shadow: 0 4px 20px rgba(212, 165, 116, 0.15), 0 0 0 1px rgba(212, 165, 116, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .chatbot-dropdown-group-topbar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 90px;
        }
        .chatbot-label-topbar {
          font-size: 1.25rem;
          color: #D4A574;
          display: flex;
          align-items: center;
          filter: drop-shadow(0 1px 2px rgba(212, 165, 116, 0.3));
          transition: all 0.3s ease;
        }
        .chatbot-label-topbar:hover {
          color: #C9A882;
          transform: scale(1.1);
        }
        .chatbot-select-topbar {
          width: 130px;
          padding: 0.625rem 0.875rem;
          border-radius: 12px;
          border: 1.5px solid rgba(212, 165, 116, 0.3);
          background: rgba(255, 255, 255, 0.95);
          color: #8B7355;
          font-size: 0.875rem;
          font-weight: 500;
          outline: none;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 1px 3px rgba(212, 165, 116, 0.1);
        }
        .chatbot-select-topbar:hover {
          border-color: rgba(212, 165, 116, 0.5);
          background: rgba(255, 255, 255, 1);
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.2);
          transform: translateY(-1px);
        }
        .chatbot-select-topbar:focus {
          border-color: #D4A574;
          box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15), 0 2px 8px rgba(212, 165, 116, 0.2);
        }
        .chatbot-container {
          width: 100%;
          height: 100vh;
          background: transparent;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }
        .chatbot-header {
          color: #8B7355;
          font-size: clamp(1rem, 2vw, 1.4rem);
          margin: 1.5rem auto 2rem auto;
          letter-spacing: -0.5px;
          text-align: center;
          opacity: 0.9;
          font-weight: 500;
        }
        .chatbot-dropdowns {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .chatbot-dropdown-group {
          flex: 1 1 180px;
          min-width: 140px;
        }
        .chatbot-label {
          color: #8B7355;
          font-weight: 600;
          margin-bottom: 0.25rem;
          display: block;
        }
        .chatbot-select {
          width: 100%;
          padding: 0.6rem;
          border-radius: 8px;
          border: 1.5px solid rgba(212, 165, 116, 0.3);
          background-color: rgba(255, 255, 255, 0.9);
          color: #8B7355;
          font-size: 1rem;
          font-weight: 500;
          outline: none;
          margin-top: 0.15rem;
        }
        .chatbot-chatbox {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          border: none;
          border-radius: 0;
          padding: 1.5rem 1rem;
          background: transparent;
          box-shadow: none;
          transition: background 0.4s;
          display: flex;
          flex-direction: column;
          margin-bottom: 0;
          min-height: 0;
          flex-shrink: 1;
        }

        .chatbot-chatbox::-webkit-scrollbar {
          width: 6px;
        }

        .chatbot-chatbox::-webkit-scrollbar-track {
          background: transparent;
        }

        .chatbot-chatbox::-webkit-scrollbar-thumb {
          background: rgba(255, 140, 0, 0.25);
          border-radius: 10px;
        }

        .chatbot-chatbox::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 140, 0, 0.4);
        }
        .chatbot-messages {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding-bottom: 1rem;
        }
        .chatbot-msg-row {
          display: flex;
          margin-bottom: 0;
          align-items: flex-end;
          animation: messageSlideIn 0.3s ease-out;
        }

        @keyframes messageSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chatbot-msg-row.user {
          flex-direction: row;
        }
        .chatbot-msg-bubble {
          display: inline-block;
          padding: 0.875rem 1.125rem;
          border-radius: 18px;
          max-width: min(75vw, 600px);
          word-break: break-word;
          font-size: clamp(0.95rem, 2vw, 1.05rem);
          line-height: 1.5;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .chatbot-msg-bubble.user {
          background: linear-gradient(135deg, #ffffff 0%, #fffefb 100%);
          color: #8B7355;
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.2), 0 0 0 1px rgba(212, 165, 116, 0.1);
          border: 1px solid rgba(212, 165, 116, 0.25);
          margin-left: auto;
          transition: all 0.3s ease;
        }
        .chatbot-msg-bubble.user:hover {
          box-shadow: 0 4px 12px rgba(212, 165, 116, 0.25), 0 0 0 1px rgba(212, 165, 116, 0.15);
          transform: translateY(-1px);
        }
        .chatbot-msg-bubble.bot {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 254, 251, 0.95) 100%);
          color: #8B7355;
          border: 1px solid rgba(212, 165, 116, 0.2);
          margin-right: auto;
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.15), 0 0 0 1px rgba(212, 165, 116, 0.08);
          transition: all 0.3s ease;
        }
        .chatbot-msg-bubble.bot:hover {
          box-shadow: 0 4px 12px rgba(212, 165, 116, 0.2), 0 0 0 1px rgba(212, 165, 116, 0.12);
          transform: translateY(-1px);
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .chatbot-msg-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 0.5rem;
          font-size: 1.4em;
          opacity: 0.7;
          color: #D4A574;
        }
        .chatbot-msg-row.user .chatbot-msg-icon {
          margin-left: 0.5rem;
          margin-right: 0;
        }
        .chatbot-msg-row.bot .chatbot-msg-icon {
          margin-right: 0.5rem;
          margin-left: 0;
        }
        .chatbot-input-area {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-top: auto;
          padding: 0.625rem 1.25rem;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-top: 1px solid rgba(212, 165, 116, 0.15);
          flex-wrap: wrap;
          position: relative;
          z-index: 100;
          box-shadow: 0 -2px 10px rgba(212, 165, 116, 0.08);
          width: 100%;
          flex-shrink: 0;
        }
        .chatbot-input {
          flex: 1;
          min-width: 0;
          padding: 0.50rem 1.25rem;
          border-radius: 24px;
          border: 1.5px solid rgba(212, 165, 116, 0.25);
          font-size: clamp(0.95rem, 2vw, 1.05rem);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 254, 251, 0.95) 100%);
          color: #8B7355;
          outline: none;
          box-shadow: 0 1px 3px rgba(212, 165, 116, 0.1), inset 0 1px 2px rgba(212, 165, 116, 0.05);
          transition: all 0.3s ease;
        }
        .chatbot-input:focus {
          background: linear-gradient(135deg, #ffffff 0%, #fffefb 100%);
          border-color: #D4A574;
          box-shadow: 0 0 0 4px rgba(212, 165, 116, 0.15), 0 2px 8px rgba(212, 165, 116, 0.2), inset 0 1px 2px rgba(212, 165, 116, 0.05);
          transform: translateY(-1px);
        }
        .chatbot-input::placeholder {
          color: rgba(139, 115, 85, 0.5);
        }
        .chatbot-btn {
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          min-width: 40px;
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          cursor: pointer;
          font-size: 18px;
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.25);
          transition: all 0.3s ease;
          background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
        }
        .chatbot-btn:hover {
          transform: scale(1.08) translateY(-2px);
          box-shadow: 0 4px 16px rgba(212, 165, 116, 0.35);
          background: linear-gradient(135deg, #C9A882 0%, #D4A574 100%);
        }
        .chatbot-btn:active {
          transform: scale(0.95);
        }
        .chatbot-btn.mic {
          background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
        }
        .chatbot-btn.mic.recording {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
          }
          50% {
            box-shadow: 0 4px 16px rgba(239, 68, 68, 0.5), 0 0 0 6px rgba(239, 68, 68, 0.1);
          }
        }
        .chatbot-btn.send {
          background: linear-gradient(135deg, #C9A882 0%, #b89772 100%);
          color: #fff;
          opacity: 1;
          transition: all 0.3s ease;
        }
        .chatbot-btn.send:hover {
          background: linear-gradient(135deg, #b89772 0%, #C9A882 100%);
          transform: scale(1.08) translateY(-2px);
        }
        .chatbot-btn.send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          background: rgba(224, 201, 166, 0.5);
        }
        .chatbot-btn.send:disabled:hover {
          transform: none;
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.15);
        }
        .chatbot-btn.upload-btn {
          background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
          color: #fff;
          opacity: 1;
          transition: all 0.3s ease;
        }
        .chatbot-btn.upload-btn:hover {
          background: linear-gradient(135deg, #C9A882 0%, #b89772 100%);
          transform: scale(1.08) translateY(-2px);
        }
        .chatbot-btn.upload-btn:disabled,
        .chatbot-btn.upload-btn[disabled] {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          background: rgba(224, 201, 166, 0.5);
        }
        .chatbot-btn.upload-btn:disabled:hover,
        .chatbot-btn.upload-btn[disabled]:hover {
          transform: none;
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.15);
        }
        /* Header Section */
        .chatbot-header-section {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 0.625rem 1.25rem;
          border-bottom: 1px solid rgba(212, 165, 116, 0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 2px 10px rgba(212, 165, 116, 0.08);
        }

        .chatbot-header-title {
          font-size: clamp(1.2rem, 2.5vw, 1.4rem);
          font-weight: 700;
          background: linear-gradient(to right, #D4A574, #C9A882, #D4A574);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          letter-spacing: -0.3px;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .chatbot-header-title .robot-icon {
          width: 3rem;
          height: 3rem;
          flex-shrink: 0;
          object-fit: contain;
        }
        
        /* Three-dot menu styles */
        .three-dot-menu-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 4px;
        }
        
        .three-dot-menu-btn {
          background: transparent;
          border: none;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8B7355;
          cursor: pointer;
          transition: all 0.3s ease;
          border-radius: 8px;
        }
        
        .three-dot-menu-btn:hover {
          background: rgba(139, 115, 85, 0.1);
          color: #D4A574;
        }
        
        .three-dot-menu {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 16px;
          padding: 0.75rem;
          box-shadow: 0 8px 32px rgba(212, 165, 116, 0.2), 0 0 0 1px rgba(212, 165, 116, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.5);
          z-index: 1000;
          min-width: 180px;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .menu-item-option {
          position: relative;
          padding: 0.75rem 1rem;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.3s ease;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(212, 165, 116, 0.2);
        }
        
        .menu-item-option:hover {
          background: linear-gradient(135deg, rgba(212, 165, 116, 0.1) 0%, rgba(201, 168, 130, 0.1) 100%);
          border-color: rgba(212, 165, 116, 0.4);
          transform: translateX(4px);
        }
        
        .menu-option-label {
          font-weight: 600;
          color: #8B7355;
          font-size: 0.95rem;
        }
        
        .menu-tooltip-right {
          position: absolute;
          right: calc(100% + 0.5rem);
          top: 50%;
          transform: translateY(-50%);
          background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
          color: white;
          padding: 0.75rem 0.7rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 500;
          white-space: normal;
          box-shadow: 0 4px 12px rgba(212, 165, 116, 0.3);
          z-index: 1001;
          pointer-events: auto;
          min-width: 170px;
          max-width: 300px;
        }
        
        .menu-tooltip-right::before {
          content: '';
          position: absolute;
          left: 100%;
          top: 50%;
          transform: translateY(-50%);
          border: 6px solid transparent;
          border-left-color: #D4A574;
        }

        .chatbot-mode-badge {
          background: rgba(255, 255, 255, 0.95);
          padding: 0.625rem 1.25rem;
          border-radius: 20px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #8B7355;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.15);
          border: 1px solid rgba(212, 165, 116, 0.25);
          transition: all 0.3s ease;
        }
        .chatbot-mode-badge:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(212, 165, 116, 0.2);
        }

        .chatbot-mode-badge .mode-icon {
          color: #D4A574;
          font-size: 1.1rem;
        }

        /* Responsive Design */
        @media (max-width: 1200px) {
          .chatbot-topbar {
            right: 0.75rem;
            top: 0.75rem;
            gap: 0.5rem;
            padding: 0.625rem 0.875rem;
          }
          .chatbot-select-topbar {
            width: 110px;
            font-size: 0.85rem;
          }
        }

        @media (max-width: 900px) {
          .chatbot-topbar {
            right: 0.5rem;
            top: 0.5rem;
            flex-direction: column;
            align-items: flex-end;
            gap: 0.5rem;
            padding: 0.625rem 0.75rem;
            max-width: 180px;
          }
          .chatbot-dropdown-group-topbar {
            min-width: 100%;
            margin-right: 0;
          }
          .chatbot-select-topbar {
            width: 100%;
            font-size: 0.85rem;
          }
          .chatbot-chatbox {
            padding: 1.25rem 0.875rem;
          }
        }

        @media (max-width: 768px) {
          .chatbot-header-section {
            padding: 0.5rem 1rem;
          }
          .chatbot-header-title {
            font-size: clamp(1rem, 2.2vw, 1.15rem);
          }
          .chatbot-mode-badge {
            padding: 0.45rem 0.875rem;
            font-size: 0.85rem;
          }
          .chatbot-chatbox {
            padding: 1rem 0.75rem;
          }
          .chatbot-msg-bubble {
            max-width: min(80vw, 550px);
            padding: 0.75rem 1rem;
          }
          .chatbot-input-area {
            padding: 0.5rem 0.75rem;
            gap: 0.625rem;
            position: relative;
            z-index: 100;
            width: 100%;
          }
          .chatbot-input {
            padding: 0.75rem 0.875rem;
            font-size: clamp(0.9rem, 1.9vw, 1rem);
          }
          .chatbot-btn {
            width: 36px;
            height: 36px;
            min-width: 36px;
            min-height: 36px;
            font-size: 16px;
          }
        }

        @media (max-width: 600px) {
          .correction-box {
            max-width: min(260px, 90vw);
            min-width: 180px;
            right: auto;
            left: 0;
            padding: 0.45rem 0.55rem;
            gap: 0.35rem;
          }
          .chatbot-topbar {
            max-width: 160px;
            padding: 0.5rem 0.625rem;
          }
          .chatbot-header-section {
            padding: 0.5rem 0.875rem;
          }
          .chatbot-mode-badge {
            padding: 0.4rem 0.75rem;
            font-size: 0.8rem;
          }
          .chatbot-chatbox {
            padding: 0.875rem 0.625rem;
          }
          .chatbot-messages {
            gap: 0.875rem;
          }
          .chatbot-msg-bubble {
            max-width: 80vw;
            padding: 0.7rem 0.875rem;
            font-size: clamp(0.875rem, 1.8vw, 0.95rem);
          }
          .chatbot-input-area {
            padding: 0.5rem 0.625rem;
            gap: 0.5rem;
            position: relative;
            z-index: 100;
            width: 100%;
          }
          .chatbot-input {
            padding: 0.7rem 0.75rem;
            font-size: clamp(0.875rem, 1.7vw, 0.9rem);
          }
          .chatbot-btn {
            width: 34px;
            height: 34px;
            min-width: 34px;
            min-height: 34px;
            font-size: 16px;
          }
          .bot-text-btn {
            padding: 0.625rem 1.25rem;
            font-size: 0.875rem;
            min-width: 100px;
          }
        }

        @media (max-width: 480px) {
          .correction-box {
            max-width: min(240px, 95vw);
            min-width: 160px;
            padding: 0.4rem 0.5rem;
            gap: 0.3rem;
          }
          .correction-title {
            font-size: 0.75rem;
          }
          .correction-input {
            padding: 0.3rem 0.45rem;
            font-size: 0.75rem;
          }
          .correction-btn {
            padding: 0.3rem 0.6rem;
            font-size: 0.75rem;
          }
          .chatbot-topbar {
            max-width: 140px;
            padding: 0.45rem 0.5rem;
          }
          .chatbot-header-section {
            padding: 0.45rem 0.75rem;
          }
          .chatbot-header-title {
            font-size: clamp(0.95rem, 2vw, 1.05rem);
          }
          .chatbot-mode-badge {
            padding: 0.35rem 0.625rem;
            font-size: 0.75rem;
          }
          .chatbot-chatbox {
            padding: 0.75rem 0.5rem;
          }
          .chatbot-msg-bubble {
            max-width: 80vw;
            padding: 0.625rem 0.75rem;
            font-size: clamp(0.85rem, 1.6vw, 0.9rem);
          }
          .chatbot-input-area {
            padding: 0.45rem 0.5rem;
            position: relative;
            z-index: 100;
            width: 100%;
          }
          .chatbot-input {
            padding: 0.625rem 0.7rem;
            font-size: clamp(0.8rem, 1.5vw, 0.85rem);
          }
          .chatbot-btn {
            width: 32px;
            height: 32px;
            min-width: 32px;
            min-height: 32px;
            font-size: 15px;
          }
        }

        /* Touch Device Optimizations */
        @media (hover: none) and (pointer: coarse) {
          .chatbot-btn {
            min-width: 38px;
            min-height: 38px;
          }
          .chatbot-btn:hover {
            transform: none;
          }
          .chatbot-btn:active {
            transform: scale(0.9);
          }
          .bot-text-btn:hover {
            transform: none;
          }
          .bot-text-btn:active {
            transform: scale(0.98);
          }
        }
        ${additionalStyles}
        `}
      </style>
      <div className="chatbot-root">
        <div className="chatbot-container">
          {/* Header Section - Improved Design */}
          <div className="chatbot-header-section">
            <h1 className="chatbot-header-title">
              <img
                src="/sofisto-img.png"
                alt="Sofisto Robot"
                className="robot-icon"
              />
              Chat with Sofisto
            </h1>
            <div className="three-dot-menu-container" ref={menuRef}>
              <motion.button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="three-dot-menu-btn"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                title="Menu"
              >
                <FiMoreVertical size={24} />
              </motion.button>

              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="three-dot-menu"
                >
                  {/* Routing Mode Selection */}
                  <div style={{ padding: "8px 0" }}>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "bold",
                        padding: "8px 12px",
                        color: "#666",
                      }}
                    >
                      Routing Mode:
                    </div>

                    {/* Manual */}
                    <div
                      className="menu-item-option"
                      onClick={() => {
                        setRouterMode("manual");
                        setAutoRouting(false);
                        activeFlowRef.current = "none";
                        setActiveFlow("none");
                        setUserOptionSelected(false);
                        setIsMenuOpen(false);
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text: "Manual mode activated. Select a flow from the menu.",
                          },
                        ]);
                      }}
                      style={{
                        backgroundColor:
                          routerMode === "manual" ? "#f0f0f0" : "white",
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Manual
                    </div>

                    {/* Auto Route */}
                    <div
                      className="menu-item-option"
                      onClick={() => {
                        setRouterMode("auto");
                        setAutoRouting(true);
                        activeFlowRef.current = "none";
                        setActiveFlow("none");
                        setUserOptionSelected(false);
                        setIsMenuOpen(false);
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text: "Auto-routing enabled. I'll detect the flow automatically.",
                          },
                        ]);
                      }}
                      style={{
                        backgroundColor:
                          routerMode === "auto" ? "#f0f0f0" : "white",
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Auto Route
                    </div>

                    {/* LLM Route */}
                    <div
                      className="menu-item-option"
                      onClick={() => {
                        setRouterMode("llm");
                        setAutoRouting(true);
                        activeFlowRef.current = "none";
                        setActiveFlow("none");
                        setUserOptionSelected(false);
                        setIsMenuOpen(false);
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text: "LLM routing enabled. Using AI-powered flow detection.",
                          },
                        ]);
                      }}
                      style={{
                        backgroundColor:
                          routerMode === "llm" ? "#f0f0f0" : "white",
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontSize: "12px",
                        borderBottom: "1px solid #ddd",
                      }}
                    >
                      LLM Route
                    </div>
                  </div>

                  {/* Divider */}
                  <div
                    style={{
                      borderTop: "1px solid #ddd",
                      margin: "5px 0",
                    }}
                  />

                  <div
                    className="menu-item-option"
                    onMouseEnter={() => {
                      if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = null;
                      }
                      setHoveredMenuItem("query");
                    }}
                    onMouseLeave={() => {
                      hoverTimeoutRef.current = setTimeout(() => {
                        setHoveredMenuItem(null);
                      }, 100);
                    }}
                    onClick={() => {
                      setAutoRouting(false); // Disable auto-routing
                      setActiveFlow("query");
                      setUserOptionSelected(true);
                      setIsMenuOpen(false);
                      setChatHistory((prev) => [
                        ...prev,
                        {
                          type: "bot",
                          text: "Query flow activated (Manual override). You can now ask me anything!",
                        },
                      ]);
                    }}
                  >
                    <span className="menu-option-label">📊 Query</span>
                    {hoveredMenuItem === "query" && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="menu-tooltip-right"
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={() => {
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                          }
                          setHoveredMenuItem("query");
                        }}
                        onMouseLeave={() => {
                          hoverTimeoutRef.current = setTimeout(() => {
                            setHoveredMenuItem(null);
                          }, 100);
                        }}
                      >
                        <div
                          style={{
                            marginBottom: "0.5rem",
                            fontWeight: "600",
                            fontSize: "0.85rem",
                          }}
                        >
                          Flow Options:
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                          }}
                        >
                          <div
                            onClick={() => {
                              setAutoRouting(false); // Disable auto-routing
                              setActiveFlow("query");
                              setUserOptionSelected(true);
                              setIsMenuOpen(false);
                              setChatHistory((prev) => [
                                ...prev,
                                {
                                  type: "bot",
                                  text: "Query flow activated (Manual override). You can now ask me anything!",
                                },
                              ]);
                            }}
                            style={{
                              opacity: activeFlow === "query" ? 1 : 0.7,
                              fontWeight:
                                activeFlow === "query" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {activeFlow === "query" ? "✓ " : ""}Query
                          </div>
                          <div
                            onClick={() => {
                              setAutoRouting(false); // Disable auto-routing
                              setActiveFlow("attendance");
                              setUserOptionSelected(true);
                              setAttendanceStep("class_info");
                              setPendingClassInfo(null);
                              setIsMenuOpen(false);
                              setChatHistory((prev) => [
                                ...prev,
                                {
                                  type: "bot",
                                  text: "Attendance flow activated (Manual override). First, please provide class information (class name, section, and date). For example: 'Class 6 A on 2025-01-15' or upload an image with class details.",
                                },
                              ]);
                            }}
                            style={{
                              opacity: activeFlow === "attendance" ? 1 : 0.7,
                              fontWeight:
                                activeFlow === "attendance" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {activeFlow === "attendance" ? "✓ " : ""}Mark
                            Attendance (Text/Image)
                          </div>
                          <div
                            onClick={() => {
                              setAutoRouting(false); // Disable auto-routing
                              setActiveFlow("voice_attendance");
                              setUserOptionSelected(true);
                              setAttendanceStep("class_info");
                              setPendingClassInfo(null);
                              setIsMenuOpen(false);
                              setChatHistory((prev) => [
                                ...prev,
                                {
                                  type: "bot",
                                  text: "Voice attendance flow activated (Manual override)! 🎤 You can now use voice commands to mark attendance. First, speak the class information (class name, section, and date), then speak the student names and their attendance status. For example: 'Class 6 A on 2025-01-15' then 'Aarav present, Diya absent'.",
                                },
                              ]);
                            }}
                            style={{
                              opacity:
                                activeFlow === "voice_attendance" ? 1 : 0.7,
                              fontWeight:
                                activeFlow === "voice_attendance"
                                  ? "600"
                                  : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {activeFlow === "voice_attendance" ? "✓ " : ""}Mark
                            Attendance (Voice)
                          </div>
                          <div
                            onClick={async () => {
                              setAutoRouting(false);
                              activeFlowRef.current = "leave";
                              setActiveFlow("leave");
                              setUserOptionSelected(true);
                              setIsMenuOpen(false);
                              // Start interactive 6-step leave flow: show user message and fetch Step 1 from backend
                              const initialMessage = "apply leave";
                              setChatHistory((prev) => [
                                ...prev,
                                { type: "user", text: initialMessage },
                              ]);
                              setIsProcessing(true);
                              try {
                                const authToken = localStorage.getItem("token");
                                const { academic_session, branch_token } =
                                  getErpContext();
                                const data = await aiAPI.leaveChat({
                                  session_id: sessionId || userId,
                                  user_id: userId,
                                  query: initialMessage,
                                  bearer_token: authToken || undefined,
                                  academic_session,
                                  branch_token,
                                });
                                if (data.status === "success" && data.data) {
                                  const answer = data.data.answer || "";
                                  setChatHistory((prev) => [
                                    ...prev,
                                    {
                                      type: "bot",
                                      answer,
                                      activeTab: "answer" as const,
                                    },
                                  ]);
                                } else {
                                  setChatHistory((prev) => [
                                    ...prev,
                                    {
                                      type: "bot",
                                      text:
                                        data.message ||
                                        "Could not start leave flow. Please try again.",
                                    },
                                  ]);
                                }
                              } catch (err) {
                                setChatHistory((prev) => [
                                  ...prev,
                                  {
                                    type: "bot",
                                    text: "Sorry, there was an error starting the leave flow. Please try again.",
                                  },
                                ]);
                              } finally {
                                setIsProcessing(false);
                              }
                            }}
                            style={{
                              opacity: activeFlow === "leave" ? 1 : 0.7,
                              fontWeight:
                                activeFlow === "leave" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {activeFlow === "leave" ? "✓ " : ""}Apply for Leave
                          </div>
                          <div
                            onClick={async () => {
                              setActiveFlow("leave_approval");
                              setUserOptionSelected(true);
                              setIsMenuOpen(false);
                              // Clear existing requests and fetch fresh ones
                              setLeaveApprovalRequests([]);
                              setRejectReason({});
                              setLoadingLeaveRequests(true);
                              try {
                                const authToken = localStorage.getItem("token");
                                const { academic_session, branch_token } =
                                  getErpContext();
                                const response =
                                  await leaveApprovalAPI.fetchPendingRequests({
                                    user_id: userId,
                                    page: 1,
                                    limit: 50,
                                    bearer_token: authToken || undefined,
                                    academic_session,
                                    branch_token,
                                  });
                                if (response.status === 200 && response.data) {
                                  const pendingRequests =
                                    response.data.leaveRequests || [];
                                  setLeaveApprovalRequests(pendingRequests);

                                  if (pendingRequests.length > 0) {
                                    setChatHistory((prev) => [
                                      ...prev,
                                      {
                                        type: "bot",
                                        answer: `📋 **Leave Approval Dashboard**\n\nFound **${pendingRequests.length}** pending leave request(s) for your approval.\n\nPlease review each request below and take action by either:\n- ✅ **Approve** - Click the green "Approve" button\n- ❌ **Reject** - Enter a rejection reason and click the red "Reject" button`,
                                        activeTab: "answer" as const,
                                      },
                                    ]);
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
                                } else {
                                  setChatHistory((prev) => [
                                    ...prev,
                                    {
                                      type: "bot",
                                      text: `⚠️ ${
                                        response.message ||
                                        "No pending leave requests found."
                                      }`,
                                    },
                                  ]);
                                }
                              } catch (err: any) {
                                console.error(
                                  "Error fetching leave approval requests:",
                                  err,
                                );
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
                              }
                            }}
                            style={{
                              opacity:
                                activeFlow === "leave_approval" ? 1 : 0.7,
                              fontWeight:
                                activeFlow === "leave_approval" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {activeFlow === "leave_approval" ? "✓ " : ""}Leave
                            Approval Flow
                          </div>
                          <div
                            onClick={() => {
                              setAutoRouting(false);
                              activeFlowRef.current = "assignment";
                              setActiveFlow("assignment");
                              setUserOptionSelected(true);
                              setIsMenuOpen(false);
                              setChatHistory((prev) => [
                                ...prev,
                                {
                                  type: "bot",
                                  text: "📚 **Assignment Creation Flow Activated!** I'll guide you through creating an assignment step by step. Just answer my questions naturally!",
                                },
                              ]);
                            }}
                            style={{
                              opacity: activeFlow === "assignment" ? 1 : 0.7,
                              fontWeight:
                                activeFlow === "assignment" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {activeFlow === "assignment" ? "✓ " : ""}Assignment
                            Flow
                          </div>
                          <div
                            onClick={async () => {
                              // Course progress is now backend-driven
                              // Simply activate the flow and send initial message
                              setAutoRouting(false);
                              setActiveFlow("course_progress");
                              setUserOptionSelected(true);
                              setIsMenuOpen(false);

                              // Send initial message to backend to start the flow
                              setIsProcessing(true);
                              try {
                                const authToken = localStorage.getItem("token");
                                const { academic_session, branch_token } =
                                  getErpContext();

                                const response = await aiAPI.courseProgressChat(
                                  {
                                    session_id:
                                      sessionId || `session_${userId}`,
                                    query: "Show my course progress",
                                    bearer_token: authToken || undefined,
                                    academic_session,
                                    branch_token,
                                  },
                                );

                                if (
                                  response.status === "success" &&
                                  response.data
                                ) {
                                  const answer =
                                    response.data.answer ||
                                    "Course Progress flow activated. Which class and section would you like to see?";
                                  const botMessage: any = {
                                    type: "bot",
                                    text: answer,
                                  };

                                  // Include class sections for nice UI rendering
                                  if (
                                    response.data.class_sections &&
                                    response.data.class_sections.length > 0
                                  ) {
                                    botMessage.classSectionsOptions =
                                      response.data.class_sections;
                                  }

                                  setChatHistory((prev) => [
                                    ...prev,
                                    botMessage,
                                  ]);
                                } else {
                                  setChatHistory((prev) => [
                                    ...prev,
                                    {
                                      type: "bot",
                                      text:
                                        response.message ||
                                        "Course Progress flow activated. Please say the class and section you want to view.",
                                    },
                                  ]);
                                }
                              } catch (err: any) {
                                console.error(
                                  "Error activating course progress flow:",
                                  err,
                                );
                                setChatHistory((prev) => [
                                  ...prev,
                                  {
                                    type: "bot",
                                    text: `❌ Error: ${err.message || "Unknown error"}`,
                                  },
                                ]);
                              } finally {
                                setIsProcessing(false);
                              }
                            }}
                            style={{
                              opacity:
                                activeFlow === "course_progress" ? 1 : 0.7,
                              fontWeight:
                                activeFlow === "course_progress"
                                  ? "600"
                                  : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {activeFlow === "course_progress" ? "✓ " : ""}Course
                            Progress
                          </div>
                          <div
                            onClick={() => {
                              activeFlowRef.current = "none";
                              setActiveFlow("none");
                              setUserOptionSelected(true);
                              setIsMenuOpen(false);
                            }}
                            style={{
                              opacity: activeFlow === "none" ? 1 : 0.7,
                              fontWeight: activeFlow === "none" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {activeFlow === "none" ? "✓ " : ""}Select Flow
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <div
                    className="menu-item-option"
                    onMouseEnter={() => {
                      if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = null;
                      }
                      setHoveredMenuItem("default");
                    }}
                    onMouseLeave={() => {
                      hoverTimeoutRef.current = setTimeout(() => {
                        setHoveredMenuItem(null);
                      }, 100);
                    }}
                    onClick={() => {
                      setSelectedDeviceId("default");
                      setIsMenuOpen(false);
                    }}
                  >
                    <span className="menu-option-label">Default</span>
                    {hoveredMenuItem === "default" && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="menu-tooltip-right"
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={() => {
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                          }
                          setHoveredMenuItem("default");
                        }}
                        onMouseLeave={() => {
                          hoverTimeoutRef.current = setTimeout(() => {
                            setHoveredMenuItem(null);
                          }, 100);
                        }}
                      >
                        <div
                          style={{
                            marginBottom: "0.5rem",
                            fontWeight: "600",
                            fontSize: "0.85rem",
                          }}
                        >
                          Device Options:
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                          }}
                        >
                          <div
                            onClick={() => {
                              setSelectedDeviceId("default");
                              setIsMenuOpen(false);
                            }}
                            style={{
                              opacity: selectedDeviceId === "default" ? 1 : 0.7,
                              fontWeight:
                                selectedDeviceId === "default" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.2)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {selectedDeviceId === "default" ? "✓ " : ""}Default
                          </div>
                          {devices.map((device) => (
                            <div
                              key={device.deviceId}
                              onClick={() => {
                                setSelectedDeviceId(device.deviceId);
                                setIsMenuOpen(false);
                              }}
                              style={{
                                opacity:
                                  selectedDeviceId === device.deviceId
                                    ? 1
                                    : 0.7,
                                fontWeight:
                                  selectedDeviceId === device.deviceId
                                    ? "600"
                                    : "400",
                                cursor: "pointer",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                transition: "background 0.2s",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background =
                                  "rgba(255, 255, 255, 0.2)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "transparent")
                              }
                            >
                              {selectedDeviceId === device.deviceId ? "✓ " : ""}
                              {device.label ||
                                `Mic (${device.deviceId.slice(-4)})`}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <div
                    className="menu-item-option"
                    onMouseEnter={() => {
                      if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = null;
                      }
                      setHoveredMenuItem("autodetect");
                    }}
                    onMouseLeave={() => {
                      hoverTimeoutRef.current = setTimeout(() => {
                        setHoveredMenuItem(null);
                      }, 100);
                    }}
                    onClick={() => {
                      setSelectedLanguage("auto");
                      setIsMenuOpen(false);
                    }}
                  >
                    <span className="menu-option-label">Auto Detect</span>
                    {hoveredMenuItem === "autodetect" && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="menu-tooltip-right"
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={() => {
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                          }
                          setHoveredMenuItem("autodetect");
                        }}
                        onMouseLeave={() => {
                          hoverTimeoutRef.current = setTimeout(() => {
                            setHoveredMenuItem(null);
                          }, 100);
                        }}
                      >
                        <div
                          style={{
                            marginBottom: "0.5rem",
                            fontWeight: "600",
                            fontSize: "0.85rem",
                          }}
                        >
                          Language Options:
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                          }}
                        >
                          {languages.map((lang) => (
                            <div
                              key={lang.value}
                              onClick={() => {
                                setSelectedLanguage(lang.value);
                                setIsMenuOpen(false);
                              }}
                              style={{
                                opacity:
                                  selectedLanguage === lang.value ? 1 : 0.7,
                                fontWeight:
                                  selectedLanguage === lang.value
                                    ? "600"
                                    : "400",
                                cursor: "pointer",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                transition: "background 0.2s",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background =
                                  "rgba(255, 255, 255, 0.2)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "transparent")
                              }
                            >
                              {selectedLanguage === lang.value ? "✓ " : ""}
                              {lang.label}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
          <div className="chatbot-chatbox" ref={chatBoxRef}>
            {/* Attendance Flow Step Indicator */}
            {(activeFlow === "attendance" ||
              activeFlow === "voice_attendance") && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center gap-4">
                <div
                  className={`flex items-center gap-2 ${
                    attendanceStep === "class_info"
                      ? "text-blue-600 font-semibold"
                      : "text-gray-600 font-normal"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${
                      attendanceStep === "class_info"
                        ? "bg-blue-600 text-white"
                        : "bg-blue-100 text-gray-600"
                    }`}
                  >
                    {attendanceStep === "class_info" ? "1" : "✓"}
                  </span>
                  {activeFlow === "voice_attendance"
                    ? "Class Info (Voice)"
                    : "Class Information"}
                </div>
                <div className="w-0.5 h-5 bg-blue-200"></div>
                <div
                  className={`flex items-center gap-2 ${
                    attendanceStep === "student_details"
                      ? "text-blue-600 font-semibold"
                      : "text-gray-600 font-normal"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${
                      attendanceStep === "student_details"
                        ? "bg-blue-600 text-white"
                        : "bg-blue-100 text-gray-600"
                    }`}
                  >
                    {attendanceStep === "completed" ? "✓" : "2"}
                  </span>
                  {activeFlow === "voice_attendance"
                    ? "Student Details (Voice)"
                    : "Student Details"}
                </div>
                <div className="w-0.5 h-5 bg-blue-200"></div>
                <div
                  className={`flex items-center gap-2 ${
                    attendanceStep === "completed"
                      ? "text-green-600 font-semibold"
                      : "text-gray-600 font-normal"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${
                      attendanceStep === "completed"
                        ? "bg-green-600 text-white"
                        : "bg-blue-100 text-gray-600"
                    }`}
                  >
                    {attendanceStep === "completed" ? "✓" : "3"}
                  </span>
                  Complete
                </div>
              </div>
            )}
            {/* Removed separate editable component - editing is now inline in the table */}

            <div className="chatbot-messages">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`chatbot-msg-row ${msg.type}`}>
                  {msg.type === "user" ? (
                    <>
                      <span className="chatbot-msg-bubble user">
                        {msg.text}
                      </span>
                      {/* <span className="chatbot-msg-icon">
                        <FiUser />
                      </span> */}
                    </>
                  ) : (
                    <>
                      {/* <span className="chatbot-msg-icon">
                        <FiCpu />
                      </span> */}
                      <div className="chatbot-msg-bubble bot relative">
                        {/* Processing indicator for image processing */}
                        {(msg as any).isProcessing && (
                          <div className="flex items-center gap-2 mb-2 p-2 rounded-md bg-gray-200 border border-gray-300">
                            <div className="w-5 h-5 rounded-full animate-spin border-2 border-gray-400 border-t-blue-600"></div>
                            <span className="text-sm text-gray-600">
                              Processing image...
                            </span>
                          </div>
                        )}
                        {/* Course progress flow is now fully backend-driven - no class selection UI needed */}
                        {/* The user simply says the class/section name via voice or text */}

                        {/* Show course progress data - Mobile-friendly UI */}
                        {msg.courseProgress && (msg as any).classSection && (
                          <div className="mt-3 bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-2xl shadow-lg overflow-hidden border border-indigo-100">
                            {/* Header Section */}
                            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-4 sm:px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                                  <span className="text-xl sm:text-2xl">
                                    📊
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base sm:text-lg font-bold text-white truncate">
                                    {(msg as any).classSection.className} -{" "}
                                    {(msg as any).classSection.sectionName}
                                  </h4>
                                  <p className="text-xs sm:text-sm text-indigo-100">
                                    Course Progress Report
                                  </p>
                                </div>
                              </div>

                              {/* Overall Progress Summary */}
                              {(() => {
                                const progressData = msg.courseProgress as any;
                                const teacherDiarys =
                                  progressData.teacherDiarys ||
                                  progressData ||
                                  [];
                                if (
                                  !Array.isArray(teacherDiarys) ||
                                  teacherDiarys.length === 0
                                )
                                  return null;

                                const totalProgress = teacherDiarys.reduce(
                                  (sum: number, s: any) =>
                                    sum +
                                    (s.avrage_progress ||
                                      s.average_progress ||
                                      0),
                                  0,
                                );
                                const avgOverall = Math.round(
                                  totalProgress / teacherDiarys.length,
                                );

                                return (
                                  <div className="mt-4 bg-white/10 backdrop-blur rounded-xl p-3 sm:p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs sm:text-sm text-white/90 font-medium">
                                        Overall Progress
                                      </span>
                                      <span className="text-lg sm:text-xl font-bold text-white">
                                        {avgOverall}%
                                      </span>
                                    </div>
                                    <div className="w-full h-2.5 sm:h-3 bg-white/20 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full transition-all duration-700 ease-out"
                                        style={{
                                          width: `${Math.min(avgOverall, 100)}%`,
                                        }}
                                      />
                                    </div>
                                    <div className="flex justify-between mt-2 text-xs text-white/70">
                                      <span>
                                        {teacherDiarys.length} Subjects
                                      </span>
                                      <span>
                                        {avgOverall >= 75
                                          ? "🎉 Great!"
                                          : avgOverall >= 50
                                            ? "👍 Good"
                                            : "📈 Keep Going"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Subjects List */}
                            <div className="p-3 sm:p-4 max-h-[60vh] sm:max-h-[500px] overflow-y-auto">
                              {(() => {
                                const progressData = msg.courseProgress as any;
                                const teacherDiarys =
                                  progressData.teacherDiarys ||
                                  progressData ||
                                  [];

                                if (
                                  !Array.isArray(teacherDiarys) ||
                                  teacherDiarys.length === 0
                                ) {
                                  return (
                                    <div className="text-center py-8">
                                      <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                                        <span className="text-2xl">📭</span>
                                      </div>
                                      <p className="text-gray-500 text-sm">
                                        No course progress data available
                                      </p>
                                    </div>
                                  );
                                }

                                const getProgressStyle = (progress: number) => {
                                  if (progress >= 75)
                                    return {
                                      bg: "bg-emerald-50",
                                      bar: "bg-gradient-to-r from-emerald-400 to-green-500",
                                      text: "text-emerald-700",
                                      badge:
                                        "bg-emerald-100 text-emerald-700 border-emerald-200",
                                    };
                                  if (progress >= 50)
                                    return {
                                      bg: "bg-amber-50",
                                      bar: "bg-gradient-to-r from-amber-400 to-yellow-500",
                                      text: "text-amber-700",
                                      badge:
                                        "bg-amber-100 text-amber-700 border-amber-200",
                                    };
                                  if (progress >= 25)
                                    return {
                                      bg: "bg-orange-50",
                                      bar: "bg-gradient-to-r from-orange-400 to-red-400",
                                      text: "text-orange-700",
                                      badge:
                                        "bg-orange-100 text-orange-700 border-orange-200",
                                    };
                                  return {
                                    bg: "bg-red-50",
                                    bar: "bg-gradient-to-r from-red-400 to-rose-500",
                                    text: "text-red-700",
                                    badge:
                                      "bg-red-100 text-red-700 border-red-200",
                                  };
                                };

                                return (
                                  <div className="space-y-3">
                                    {teacherDiarys.map(
                                      (subject: any, subjectIdx: number) => {
                                        const subjectName =
                                          subject.name || "Unknown Subject";
                                        const avgProgress =
                                          subject.avrage_progress ||
                                          subject.average_progress ||
                                          0;
                                        const chapters = subject.chapters || [];
                                        const style =
                                          getProgressStyle(avgProgress);

                                        return (
                                          <details
                                            key={subject.id || subjectIdx}
                                            className={`group rounded-xl border ${style.bg} border-gray-200 overflow-hidden transition-all duration-200`}
                                          >
                                            <summary className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer list-none select-none hover:bg-white/50 transition-colors">
                                              {/* Subject Icon */}
                                              <div
                                                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${style.bg} border ${style.badge.split(" ")[2]} flex items-center justify-center flex-shrink-0`}
                                              >
                                                <span className="text-lg sm:text-xl">
                                                  📚
                                                </span>
                                              </div>

                                              {/* Subject Info */}
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                  <h5 className="text-sm sm:text-base font-semibold text-gray-800 truncate">
                                                    {subjectName}
                                                  </h5>
                                                  <span
                                                    className={`flex-shrink-0 text-xs sm:text-sm font-bold px-2 py-0.5 rounded-full border ${style.badge}`}
                                                  >
                                                    {avgProgress}%
                                                  </span>
                                                </div>

                                                {/* Progress Bar */}
                                                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                  <div
                                                    className={`h-full ${style.bar} rounded-full transition-all duration-500`}
                                                    style={{
                                                      width: `${Math.min(avgProgress, 100)}%`,
                                                    }}
                                                  />
                                                </div>

                                                {/* Chapter Count */}
                                                <div className="flex items-center justify-between mt-1.5">
                                                  <span className="text-xs text-gray-500">
                                                    {chapters.length} chapter
                                                    {chapters.length !== 1
                                                      ? "s"
                                                      : ""}
                                                  </span>
                                                  <span className="text-xs text-indigo-500 group-open:rotate-180 transition-transform duration-200">
                                                    ▼ Details
                                                  </span>
                                                </div>
                                              </div>
                                            </summary>

                                            {/* Chapters (Expandable) */}
                                            {chapters.length > 0 && (
                                              <div className="px-3 pb-3 sm:px-4 sm:pb-4 pt-1 space-y-2 border-t border-gray-100 bg-white/30">
                                                {chapters.map(
                                                  (
                                                    chapter: any,
                                                    chapterIdx: number,
                                                  ) => {
                                                    const chapterName =
                                                      chapter.name ||
                                                      "Unknown Chapter";
                                                    const chapterProgress =
                                                      chapter.coverage_status ||
                                                      0;
                                                    const chStyle =
                                                      getProgressStyle(
                                                        chapterProgress,
                                                      );

                                                    return (
                                                      <div
                                                        key={
                                                          chapter.id ||
                                                          chapterIdx
                                                        }
                                                        className="bg-white rounded-lg p-2.5 sm:p-3 border border-gray-100 shadow-sm"
                                                      >
                                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                                          <span className="text-xs sm:text-sm text-gray-700 font-medium truncate flex-1">
                                                            {chapterName}
                                                          </span>
                                                          <span
                                                            className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${chStyle.badge}`}
                                                          >
                                                            {chapterProgress}%
                                                          </span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                          <div
                                                            className={`h-full ${chStyle.bar} rounded-full transition-all duration-500`}
                                                            style={{
                                                              width: `${Math.min(chapterProgress, 100)}%`,
                                                            }}
                                                          />
                                                        </div>
                                                      </div>
                                                    );
                                                  },
                                                )}
                                              </div>
                                            )}

                                            {chapters.length === 0 && (
                                              <div className="px-4 pb-3 pt-1 border-t border-gray-100">
                                                <p className="text-xs text-gray-400 italic text-center py-2">
                                                  No chapters available
                                                </p>
                                              </div>
                                            )}
                                          </details>
                                        );
                                      },
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Footer Legend */}
                            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-400 to-green-500"></div>
                                  <span className="text-gray-600">75%+</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500"></div>
                                  <span className="text-gray-600">50-74%</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-400 to-red-400"></div>
                                  <span className="text-gray-600">25-49%</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-red-400 to-rose-500"></div>
                                  <span className="text-gray-600">&lt;25%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Class sections selection UI - Voice/Text friendly */}
                        {(msg as any).classSectionsOptions &&
                          Array.isArray((msg as any).classSectionsOptions) &&
                          (msg as any).classSectionsOptions.length > 0 && (
                            <div className="mt-3 bg-gradient-to-br from-blue-50 via-white to-indigo-50 rounded-2xl shadow-lg overflow-hidden border border-blue-100">
                              {/* Header */}
                              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 sm:px-5 sm:py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                                    <span className="text-xl">📚</span>
                                  </div>
                                  <div>
                                    <h4 className="text-base sm:text-lg font-bold text-white">
                                      Select Your Class
                                    </h4>
                                    <p className="text-xs sm:text-sm text-blue-100">
                                      {(msg as any).classSectionsOptions.length}{" "}
                                      class section
                                      {(msg as any).classSectionsOptions
                                        .length !== 1
                                        ? "s"
                                        : ""}{" "}
                                      available
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Class Sections Grid */}
                              <div className="p-3 sm:p-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                  {(msg as any).classSectionsOptions.map(
                                    (cs: any, csIdx: number) => {
                                      const className =
                                        cs.class?.name || "Unknown";
                                      const sectionName =
                                        cs.section?.name || "Unknown";
                                      const isClassTeacher =
                                        cs.isClassTeacher === true;

                                      return (
                                        <div
                                          key={
                                            cs.class?._id + cs.section?._id ||
                                            csIdx
                                          }
                                          className={`relative p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 ${
                                            isClassTeacher
                                              ? "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200"
                                              : "bg-white border-gray-200 hover:border-blue-300"
                                          }`}
                                        >
                                          {/* Class Teacher Badge */}
                                          {isClassTeacher && (
                                            <div className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                                              Class Teacher
                                            </div>
                                          )}

                                          <div className="flex items-center gap-3">
                                            {/* Number Badge */}
                                            <div
                                              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-bold text-lg sm:text-xl ${
                                                isClassTeacher
                                                  ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-white"
                                                  : "bg-gradient-to-br from-blue-500 to-indigo-500 text-white"
                                              }`}
                                            >
                                              {csIdx + 1}
                                            </div>

                                            {/* Class Info */}
                                            <div className="flex-1 min-w-0">
                                              <div className="text-base sm:text-lg font-bold text-gray-800">
                                                {className}
                                              </div>
                                              <div className="text-sm text-gray-500">
                                                Section {sectionName}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>

                                {/* Hint */}
                                <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                                  <div className="flex items-start gap-2">
                                    <span className="text-blue-500 text-lg">
                                      💡
                                    </span>
                                    <div className="text-sm text-blue-700">
                                      <span className="font-semibold">
                                        How to select:
                                      </span>
                                      <ul className="mt-1 space-y-0.5 text-blue-600">
                                        <li>
                                          • Say the class name: "
                                          <span className="font-medium">
                                            {(msg as any)
                                              .classSectionsOptions[0]?.class
                                              ?.name || "III"}{" "}
                                            {(msg as any)
                                              .classSectionsOptions[0]?.section
                                              ?.name || "A"}
                                          </span>
                                          "
                                        </li>
                                        <li>
                                          • Or say: "
                                          <span className="font-medium">
                                            first one
                                          </span>
                                          ", "
                                          <span className="font-medium">
                                            second
                                          </span>
                                          ", etc.
                                        </li>
                                        <li>
                                          • Or type: "
                                          <span className="font-medium">
                                            Class 3 A
                                          </span>
                                          " or "
                                          <span className="font-medium">
                                            3 A
                                          </span>
                                          "
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                        {/* Only show text if no special UI components are displayed */}
                        {msg.text &&
                          !(msg as any).classSectionsOptions &&
                          !(
                            msg.courseProgress && (msg as any).classSection
                          ) && (
                            <div className="text-gray-800 leading-relaxed">
                              {msg.text}
                            </div>
                          )}

                        {!msg.text && (
                          <>
                            {/* Only show answer, no tabs */}
                            {(() => {
                              // Always show answer content
                              return (
                                <>
                                  {/* Show leave approval requests if in leave_approval flow */}
                                  {activeFlow === "leave_approval" &&
                                    idx === chatHistory.length - 1 && (
                                      <>
                                        {loadingLeaveRequests ? (
                                          <div className="mt-4 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl shadow-sm">
                                            <div className="flex items-center justify-center gap-4">
                                              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                              <span className="text-blue-900 font-semibold text-base">
                                                Loading pending leave
                                                requests...
                                              </span>
                                            </div>
                                          </div>
                                        ) : leaveApprovalRequests.length > 0 ? (
                                          <div className="mt-4 space-y-5">
                                            {/* Summary Header */}
                                            <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg text-white">
                                              <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">
                                                  📋
                                                </div>
                                                <div>
                                                  <h3 className="text-lg font-bold">
                                                    Leave Approval Dashboard
                                                  </h3>
                                                  <p className="text-sm text-blue-100">
                                                    {
                                                      leaveApprovalRequests.length
                                                    }{" "}
                                                    {leaveApprovalRequests.length ===
                                                    1
                                                      ? "request"
                                                      : "requests"}{" "}
                                                    pending review
                                                  </p>
                                                </div>
                                              </div>
                                            </div>

                                            {/* Leave Request Cards */}
                                            {leaveApprovalRequests.map(
                                              (request, reqIdx) => {
                                                const startDate = new Date(
                                                  request.start_date,
                                                );
                                                const endDate = new Date(
                                                  request.end_date,
                                                );
                                                const startDateStr =
                                                  startDate.toLocaleDateString(
                                                    "en-US",
                                                    {
                                                      month: "short",
                                                      day: "numeric",
                                                      year: "numeric",
                                                    },
                                                  );
                                                const endDateStr =
                                                  endDate.toLocaleDateString(
                                                    "en-US",
                                                    {
                                                      month: "short",
                                                      day: "numeric",
                                                      year: "numeric",
                                                    },
                                                  );
                                                const isSingleDay =
                                                  startDateStr === endDateStr;
                                                const daysDiff =
                                                  Math.ceil(
                                                    (endDate.getTime() -
                                                      startDate.getTime()) /
                                                      (1000 * 60 * 60 * 24),
                                                  ) + 1;

                                                const employeeName =
                                                  request.employee?.personalInfo
                                                    ?.employeeName || "Unknown";
                                                const employeeId =
                                                  request.employee?.personalInfo
                                                    ?.employeeId || "";
                                                const leaveType =
                                                  request.leave_type?.name ||
                                                  "Unknown";
                                                const description =
                                                  request.description ||
                                                  "No description provided";
                                                const photoPath =
                                                  request.employee?.personalInfo
                                                    ?.photoDocument?.path;

                                                return (
                                                  <div
                                                    key={request.uuid || reqIdx}
                                                    className="bg-white border-2 border-gray-200 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
                                                  >
                                                    {/* Card Header */}
                                                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                                                      <div className="flex items-center gap-4">
                                                        {photoPath ? (
                                                          <img
                                                            src={photoPath}
                                                            alt={employeeName}
                                                            className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                                                            onError={(e) => {
                                                              (
                                                                e.target as HTMLImageElement
                                                              ).style.display =
                                                                "none";
                                                            }}
                                                          />
                                                        ) : (
                                                          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                                                            {employeeName
                                                              .charAt(0)
                                                              .toUpperCase()}
                                                          </div>
                                                        )}
                                                        <div className="flex-1">
                                                          <h4 className="text-xl font-bold text-gray-900 mb-1">
                                                            {employeeName}
                                                          </h4>
                                                          <p className="text-sm text-gray-600 flex items-center gap-2">
                                                            <span className="font-medium">
                                                              Employee ID:
                                                            </span>
                                                            <span className="bg-gray-200 px-2 py-0.5 rounded-md font-mono text-xs">
                                                              {employeeId ||
                                                                "N/A"}
                                                            </span>
                                                          </p>
                                                        </div>
                                                      </div>
                                                    </div>

                                                    {/* Card Body */}
                                                    <div className="p-6">
                                                      {/* Leave Details Grid */}
                                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                                                        {/* Leave Type */}
                                                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                                          <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-blue-600 text-lg">
                                                              📝
                                                            </span>
                                                            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                                              Leave Type
                                                            </span>
                                                          </div>
                                                          <p className="text-base font-semibold text-gray-900">
                                                            {leaveType}
                                                          </p>
                                                        </div>

                                                        {/* Duration */}
                                                        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                                                          <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-purple-600 text-lg">
                                                              📅
                                                            </span>
                                                            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                                                              Duration
                                                            </span>
                                                          </div>
                                                          <p className="text-base font-semibold text-gray-900">
                                                            {isSingleDay
                                                              ? startDateStr
                                                              : `${startDateStr} - ${endDateStr}`}
                                                          </p>
                                                          <p className="text-xs text-gray-600 mt-1">
                                                            {daysDiff}{" "}
                                                            {daysDiff === 1
                                                              ? "day"
                                                              : "days"}
                                                          </p>
                                                        </div>
                                                      </div>

                                                      {/* Reason Section */}
                                                      <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 mb-5">
                                                        <div className="flex items-center gap-2 mb-2">
                                                          <span className="text-amber-600 text-lg">
                                                            💬
                                                          </span>
                                                          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                                                            Reason
                                                          </span>
                                                        </div>
                                                        <p className="text-sm text-gray-800 leading-relaxed">
                                                          {description}
                                                        </p>
                                                      </div>

                                                      {/* Action Buttons */}
                                                      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t-2 border-gray-200">
                                                        {/* Approve Button */}
                                                        <button
                                                          onClick={async () => {
                                                            try {
                                                              const authToken =
                                                                localStorage.getItem(
                                                                  "token",
                                                                );
                                                              const {
                                                                academic_session,
                                                                branch_token,
                                                              } =
                                                                getErpContext();
                                                              await leaveApprovalAPI.approve(
                                                                {
                                                                  leave_request_uuid:
                                                                    request.uuid,
                                                                  bearer_token:
                                                                    authToken ||
                                                                    undefined,
                                                                  academic_session,
                                                                  branch_token,
                                                                },
                                                              );
                                                              setLeaveApprovalRequests(
                                                                (prev) =>
                                                                  prev.filter(
                                                                    (r) =>
                                                                      r.uuid !==
                                                                      request.uuid,
                                                                  ),
                                                              );
                                                              setChatHistory(
                                                                (prev) => [
                                                                  ...prev,
                                                                  {
                                                                    type: "bot",
                                                                    text: `✅ Leave request for **${employeeName}** has been approved successfully!`,
                                                                  },
                                                                ],
                                                              );
                                                            } catch (err: any) {
                                                              setChatHistory(
                                                                (prev) => [
                                                                  ...prev,
                                                                  {
                                                                    type: "bot",
                                                                    text: `❌ Error approving leave request: ${
                                                                      err.message ||
                                                                      "Unknown error"
                                                                    }`,
                                                                  },
                                                                ],
                                                              );
                                                            }
                                                          }}
                                                          className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                                                        >
                                                          <span className="text-xl">
                                                            ✓
                                                          </span>
                                                          <span>Approve</span>
                                                        </button>

                                                        {/* Reject Section */}
                                                        <div className="flex-1 flex flex-col sm:flex-row gap-2">
                                                          <input
                                                            type="text"
                                                            placeholder="Rejection reason (optional)"
                                                            value={
                                                              rejectReason[
                                                                request.uuid
                                                              ] || ""
                                                            }
                                                            onChange={(e) =>
                                                              setRejectReason(
                                                                (prev) => ({
                                                                  ...prev,
                                                                  [request.uuid]:
                                                                    e.target
                                                                      .value,
                                                                }),
                                                              )
                                                            }
                                                            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 transition-all"
                                                          />
                                                          <button
                                                            onClick={async () => {
                                                              try {
                                                                const authToken =
                                                                  localStorage.getItem(
                                                                    "token",
                                                                  );
                                                                const reason =
                                                                  rejectReason[
                                                                    request.uuid
                                                                  ] ||
                                                                  "No reason provided";
                                                                const {
                                                                  academic_session,
                                                                  branch_token,
                                                                } =
                                                                  getErpContext();
                                                                await leaveApprovalAPI.reject(
                                                                  {
                                                                    leave_request_uuid:
                                                                      request.uuid,
                                                                    reject_reason:
                                                                      reason,
                                                                    bearer_token:
                                                                      authToken ||
                                                                      undefined,
                                                                    academic_session,
                                                                    branch_token,
                                                                  },
                                                                );
                                                                setLeaveApprovalRequests(
                                                                  (prev) =>
                                                                    prev.filter(
                                                                      (r) =>
                                                                        r.uuid !==
                                                                        request.uuid,
                                                                    ),
                                                                );
                                                                setRejectReason(
                                                                  (prev) => {
                                                                    const newReasons =
                                                                      {
                                                                        ...prev,
                                                                      };
                                                                    delete newReasons[
                                                                      request
                                                                        .uuid
                                                                    ];
                                                                    return newReasons;
                                                                  },
                                                                );
                                                                setChatHistory(
                                                                  (prev) => [
                                                                    ...prev,
                                                                    {
                                                                      type: "bot",
                                                                      text: `❌ Leave request for **${employeeName}** has been rejected. Reason: ${reason}`,
                                                                    },
                                                                  ],
                                                                );
                                                              } catch (err: any) {
                                                                setChatHistory(
                                                                  (prev) => [
                                                                    ...prev,
                                                                    {
                                                                      type: "bot",
                                                                      text: `❌ Error rejecting leave request: ${
                                                                        err.message ||
                                                                        "Unknown error"
                                                                      }`,
                                                                    },
                                                                  ],
                                                                );
                                                              }
                                                            }}
                                                            className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg font-semibold hover:from-red-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 whitespace-nowrap"
                                                          >
                                                            <span className="text-xl">
                                                              ✗
                                                            </span>
                                                            <span>Reject</span>
                                                          </button>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              },
                                            )}
                                          </div>
                                        ) : (
                                          <div className="mt-4 p-8 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl text-center shadow-lg">
                                            <div className="text-6xl mb-4 animate-bounce">
                                              ✅
                                            </div>
                                            <h3 className="text-green-900 font-bold text-xl mb-2">
                                              All Clear! 🎉
                                            </h3>
                                            <p className="text-green-700 font-medium text-base">
                                              No pending leave requests found
                                            </p>
                                            <p className="text-green-600 text-sm mt-2">
                                              All leave requests have been
                                              processed or there are no pending
                                              requests at this time.
                                            </p>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  {/* Show table if this message has attendance data */}
                                  {(() => {
                                    console.log(
                                      `Checking message ${idx} for attendance data:`,
                                      {
                                        hasAttendanceSummary:
                                          !!msg.attendance_summary,
                                        attendanceSummaryLength:
                                          msg.attendance_summary?.length || 0,
                                        attendanceSummary:
                                          msg.attendance_summary,
                                        messageType: msg.type,
                                        hasButtons: !!(msg as any).buttons,
                                      },
                                    );
                                    return (
                                      msg.attendance_summary &&
                                      msg.attendance_summary.length > 0
                                    );
                                  })() ? (
                                    (() => {
                                      console.log(
                                        `Rendering table for message ${idx}, editingMessageIndex: ${editingMessageIndex}, isEditing: ${
                                          editingMessageIndex === idx
                                        }`,
                                      );
                                      console.log(
                                        `Message ${idx} attendance_summary length:`,
                                        msg.attendance_summary?.length || 0,
                                      );
                                      console.log(
                                        `Global attendanceData length:`,
                                        attendanceData.length,
                                      );
                                      console.log(`Message type:`, msg.type);
                                      console.log(
                                        `Message has attendance_summary:`,
                                        !!msg.attendance_summary,
                                      );

                                      // Add a simple test to see if the edit mode is detected
                                      if (editingMessageIndex === idx) {
                                        console.log(
                                          `✅ EDIT MODE DETECTED for message ${idx}!`,
                                        );
                                        console.log(
                                          `✅ Table should be editable now!`,
                                        );
                                        console.log(
                                          `✅ Current editingMessageIndex: ${editingMessageIndex}, Current idx: ${idx}`,
                                        );
                                        console.log(
                                          `✅ Global attendanceData:`,
                                          attendanceData,
                                        );
                                      } else {
                                        console.log(
                                          `❌ NOT in edit mode for message ${idx}. Expected: ${editingMessageIndex}, Got: ${idx}`,
                                        );
                                        console.log(
                                          `❌ Table will NOT be editable`,
                                        );
                                        console.log(
                                          `❌ Current editingMessageIndex: ${editingMessageIndex}, Current idx: ${idx}`,
                                        );
                                      }

                                      return true;
                                    })() && (
                                      <div
                                        id={`attendance-summary-${idx}`}
                                        className="bg-white border border-gray-200 rounded-lg p-4 my-4 shadow-sm"
                                      >
                                        {/* Header */}
                                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-300">
                                          <div>
                                            <h3 className="text-gray-900 m-0 mb-1 text-lg font-semibold">
                                              {editingMessageIndex !== null
                                                ? "✏️ Edit Attendance Summary"
                                                : "📋 Attendance Summary"}
                                            </h3>
                                            {editingMessageIndex !== null && (
                                              <div className="bg-blue-100 text-blue-900 p-2 rounded-md text-sm mb-4 font-medium">
                                                ✏️ Edit mode active - You can
                                                modify student names and
                                                attendance status below
                                              </div>
                                            )}
                                            {/* Edit Mode Buttons - Show Save/Cancel when in edit mode */}
                                            {editingMessageIndex !== null && (
                                              <div className="flex gap-2 mb-4 p-2 rounded-md bg-gray-50 border border-gray-200">
                                                <button
                                                  onClick={() =>
                                                    handleSaveAttendance(idx)
                                                  }
                                                  className="px-4 py-2 rounded-md border-none bg-green-500 text-white cursor-pointer text-sm font-medium transition-colors hover:bg-green-600"
                                                >
                                                  💾 Save
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    // Cancel editing - exit edit mode without saving
                                                    setEditingMessageIndex(
                                                      null,
                                                    );
                                                    setChatHistory((prev) => {
                                                      const updatedHistory = [
                                                        ...prev,
                                                      ];
                                                      if (
                                                        updatedHistory[idx] &&
                                                        updatedHistory[idx]
                                                          .type === "bot"
                                                      ) {
                                                        (
                                                          updatedHistory[
                                                            idx
                                                          ] as any
                                                        ).isBeingEdited = false;
                                                      }
                                                      return updatedHistory;
                                                    });
                                                    setChatHistory((prev) => [
                                                      ...prev,
                                                      {
                                                        type: "bot",
                                                        text: "❌ Edit cancelled. No changes were saved.",
                                                      },
                                                    ]);
                                                  }}
                                                  className="px-4 py-2 rounded-md border-none bg-red-500 text-white cursor-pointer text-sm font-medium transition-colors hover:bg-red-600"
                                                >
                                                  ❌ Cancel
                                                </button>
                                              </div>
                                            )}
                                            {classInfo && (
                                              <p className="text-gray-500 m-0 text-sm">
                                                Class {classInfo.class_}{" "}
                                                {classInfo.section} •{" "}
                                                {classInfo.date}
                                              </p>
                                            )}
                                          </div>

                                          {/* Inline editing buttons removed - using main approval buttons instead */}
                                        </div>

                                        {/* Statistics */}
                                        <div className="flex gap-4 mb-4 p-3 rounded-md bg-gray-50 text-sm">
                                          {(() => {
                                            const isEditing =
                                              editingMessageIndex !== null;
                                            const dataToUse = isEditing
                                              ? attendanceData
                                              : msg.attendance_summary || [];
                                            return (
                                              <>
                                                <div className="text-gray-900">
                                                  <strong>Total:</strong>{" "}
                                                  {dataToUse.length}
                                                </div>
                                                <div className="text-green-500">
                                                  <strong>Present:</strong>{" "}
                                                  {
                                                    dataToUse.filter(
                                                      (item) =>
                                                        item.attendance_status ===
                                                        "Present",
                                                    ).length
                                                  }
                                                </div>
                                                <div className="text-red-500">
                                                  <strong>Absent:</strong>{" "}
                                                  {
                                                    dataToUse.filter(
                                                      (item) =>
                                                        item.attendance_status ===
                                                        "Absent",
                                                    ).length
                                                  }
                                                </div>
                                              </>
                                            );
                                          })()}
                                        </div>

                                        {/* Editable Table */}
                                        <div className="overflow-auto border border-gray-200 rounded-md">
                                          <table className="w-full border-collapse text-sm">
                                            <thead>
                                              <tr className="bg-gray-50 border-b border-gray-200">
                                                <th className="px-3 py-3 text-left text-gray-900 font-semibold border-r border-gray-200">
                                                  Student Name
                                                </th>
                                                <th className="px-3 py-3 text-left text-gray-900 font-semibold border-r border-gray-200">
                                                  Status
                                                </th>
                                                <th className="px-3 py-3 text-center text-gray-900 font-semibold w-[100px]">
                                                  Actions
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {(() => {
                                                const isEditing =
                                                  editingMessageIndex !== null;
                                                const dataToUse = isEditing
                                                  ? attendanceData
                                                  : msg.attendance_summary ||
                                                    [];
                                                console.log(
                                                  `Table data for message ${idx}:`,
                                                  {
                                                    attendanceDataLength:
                                                      attendanceData.length,
                                                    msgAttendanceSummaryLength:
                                                      msg.attendance_summary
                                                        ?.length || 0,
                                                    dataToUseLength:
                                                      dataToUse.length,
                                                    isEditing: isEditing,
                                                    msgAttendanceSummary:
                                                      msg.attendance_summary,
                                                    usingGlobalState: isEditing,
                                                  },
                                                );

                                                // Show empty state if no data
                                                if (dataToUse.length === 0) {
                                                  return (
                                                    <tr>
                                                      <td
                                                        colSpan={3}
                                                        className="p-8 text-center text-gray-500 italic"
                                                      >
                                                        {isEditing
                                                          ? "No attendance data available for editing. Please check if the data was loaded properly."
                                                          : "No attendance data available. Please check if the class exists or try entering student information manually."}
                                                      </td>
                                                    </tr>
                                                  );
                                                }

                                                return dataToUse.map(
                                                  (item, index) => (
                                                    <tr
                                                      key={index}
                                                      className={`border-b border-gray-200 ${
                                                        index % 2 === 0
                                                          ? "bg-white"
                                                          : "bg-gray-50"
                                                      }`}
                                                    >
                                                      <td className="px-3 py-3 border-r border-gray-200 text-gray-900">
                                                        {(() => {
                                                          const isEditing =
                                                            editingMessageIndex !==
                                                            null;
                                                          console.log(
                                                            `Student name field for message ${idx}: isEditing=${isEditing}, editingMessageIndex=${editingMessageIndex}, idx=${idx}, isBeingEdited=${
                                                              (msg as any)
                                                                .isBeingEdited
                                                            }`,
                                                          );
                                                          console.log(
                                                            `Student name field - isEditing check: ${editingMessageIndex} === ${idx} = ${
                                                              editingMessageIndex ===
                                                              idx
                                                            } OR isBeingEdited=${
                                                              (msg as any)
                                                                .isBeingEdited
                                                            }`,
                                                          );
                                                          return isEditing ? (
                                                            <input
                                                              type="text"
                                                              value={
                                                                item.student_name
                                                              }
                                                              onChange={(e) =>
                                                                handleAttendanceDataChange(
                                                                  index,
                                                                  "student_name",
                                                                  e.target
                                                                    .value,
                                                                )
                                                              }
                                                              className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                                            />
                                                          ) : (
                                                            <span className="text-sm">
                                                              {
                                                                item.student_name
                                                              }
                                                            </span>
                                                          );
                                                        })()}
                                                      </td>
                                                      <td className="px-3 py-3 border-r border-gray-200 text-gray-900">
                                                        {(() => {
                                                          const isEditing =
                                                            editingMessageIndex !==
                                                            null;
                                                          console.log(
                                                            `Attendance status field for message ${idx}: isEditing=${isEditing}, editingMessageIndex=${editingMessageIndex}, isBeingEdited=${
                                                              (msg as any)
                                                                .isBeingEdited
                                                            }`,
                                                          );
                                                          return isEditing ? (
                                                            <select
                                                              value={
                                                                item.attendance_status
                                                              }
                                                              onChange={(e) =>
                                                                handleAttendanceDataChange(
                                                                  index,
                                                                  "attendance_status",
                                                                  e.target
                                                                    .value,
                                                                )
                                                              }
                                                              className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                                            >
                                                              <option value="Present">
                                                                Present
                                                              </option>
                                                              <option value="Absent">
                                                                Absent
                                                              </option>
                                                            </select>
                                                          ) : (
                                                            <span
                                                              className={`text-sm ${
                                                                item.attendance_status ===
                                                                "Present"
                                                                  ? "text-green-500"
                                                                  : item.attendance_status ===
                                                                      "Absent"
                                                                    ? "text-red-500"
                                                                    : "text-gray-500"
                                                              }`}
                                                            >
                                                              {
                                                                item.attendance_status
                                                              }
                                                            </span>
                                                          );
                                                        })()}
                                                      </td>
                                                      <td className="px-3 py-3 text-center">
                                                        {editingMessageIndex !==
                                                          null && (
                                                          <button
                                                            onClick={() =>
                                                              handleRemoveStudent(
                                                                index,
                                                              )
                                                            }
                                                            className="px-1 py-1 border-none bg-red-500 text-white rounded cursor-pointer flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                                                            title="Remove Student"
                                                          >
                                                            🗑️
                                                          </button>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  ),
                                                );
                                              })()}
                                            </tbody>
                                          </table>
                                        </div>

                                        {/* Add New Student - only show in edit mode */}
                                        {(editingMessageIndex === idx ||
                                          (msg as any).isBeingEdited) && (
                                          <div
                                            style={{
                                              marginTop: "1rem",
                                              padding: "1rem",
                                              background: "#f8fafc",
                                              borderRadius: "6px",
                                              border: "1px solid #e5e7eb",
                                            }}
                                          >
                                            <button
                                              onClick={handleAddStudent}
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.5rem",
                                                padding: "0.5rem 1rem",
                                                borderRadius: "6px",
                                                border: "none",
                                                background: "#2563eb",
                                                color: "white",
                                                cursor: "pointer",
                                                fontSize: "0.875rem",
                                                fontWeight: "500",
                                                transition: "background 0.2s",
                                              }}
                                            >
                                              ➕ Add New Student
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    <>
                                      {/* Render answer as Markdown with GFM (tables) - Memoized to prevent refresh */}
                                      <MemoizedAnswer
                                        answer={msg.answer || ""}
                                        messageIdx={idx}
                                      />
                                    </>
                                  )}
                                  <div className="bot-actions-bottom">
                                    <button
                                      className="bot-action-btn"
                                      title="Listen"
                                      disabled={ttsLoading === idx}
                                      onClick={() =>
                                        handlePlayTTS(idx, msg.answer || "")
                                      }
                                    >
                                      <FiVolume2 />
                                      {ttsLoading === idx && (
                                        <span className="feedback-sent-tooltip">
                                          Loading...
                                        </span>
                                      )}
                                    </button>
                                    <button
                                      className={getThumbsUpClass(msg)}
                                      title="Approved"
                                      disabled={msg.feedback === "Rejected"}
                                      onClick={() =>
                                        handleSendFeedback(idx, "Approved")
                                      }
                                    >
                                      <FiThumbsUp />
                                      {msg.feedback === "Approved" && (
                                        <span className="feedback-sent-tooltip">
                                          Approved
                                        </span>
                                      )}
                                    </button>
                                    <div style={{ position: "relative" }}>
                                      <button
                                        className={getThumbsDownClass(msg)}
                                        title="Rejected"
                                        disabled={msg.feedback === "Approved"}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowCorrectionBox(
                                            showCorrectionBox === idx
                                              ? null
                                              : idx,
                                          );
                                        }}
                                      >
                                        <FiThumbsDown />
                                        {msg.feedback === "Rejected" && (
                                          <span className="feedback-sent-tooltip">
                                            Rejected
                                          </span>
                                        )}
                                      </button>
                                      {showCorrectionBox === idx &&
                                        msg.feedback !== "Approved" && (
                                          <div
                                            className="correction-box"
                                            ref={correctionBoxRef}
                                          >
                                            <div className="correction-title">
                                              Rejection Reason:
                                            </div>
                                            <input
                                              className="correction-input"
                                              type="text"
                                              placeholder="Enter reason..."
                                              value={feedbackComment[idx] || ""}
                                              onChange={(e) =>
                                                setFeedbackComment((prev) => ({
                                                  ...prev,
                                                  [idx]: e.target.value,
                                                }))
                                              }
                                            />
                                            <button
                                              className="correction-btn"
                                              onClick={() =>
                                                handleSendFeedback(
                                                  idx,
                                                  "Rejected",
                                                  feedbackComment[idx] || "",
                                                )
                                              }
                                              disabled={!feedbackComment[idx]}
                                            >
                                              Submit
                                            </button>
                                          </div>
                                        )}
                                    </div>
                                  </div>
                                  {msg.feedbackMessage && (
                                    <div className="feedback-status-msg">
                                      {msg.feedbackMessage}
                                    </div>
                                  )}

                                  {(() => {
                                    console.log(
                                      `Checking buttons for message ${idx}:`,
                                      {
                                        hasButtons: !!(msg as any).buttons,
                                        buttonsLength:
                                          (msg as any).buttons?.length || 0,
                                        buttons: (msg as any).buttons,
                                      },
                                    );
                                    return (
                                      (msg as any).buttons &&
                                      (msg as any).buttons.length > 0
                                    );
                                  })() && (
                                    <div className="bot-buttons">
                                      {(msg as any).buttons.map(
                                        (btn: any, i: number) => (
                                          <button
                                            key={i}
                                            className="bot-text-btn"
                                            onClick={btn.action}
                                          >
                                            {btn.label}
                                          </button>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {isProcessing && (
                <div className="chatbot-msg-row bot">
                  {/* <span className="chatbot-msg-icon">
                    <FiCpu />
                  </span> */}
                  <div className="chatbot-msg-bubble bot processing-bubble flex">
                    <div className="processing-indicator flex gap-2 items-center justify-center">
                      <motion.div
                        className="cloud-thinking-icon"
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.7, 1, 0.7],
                          y: [0, -5, 0],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        <SlBubbles />
                      </motion.div>
                      {/* <div className="animate-bounce">
                        <SlBubbles  />
                      </div> */}
                      <span className="thinking-text italic">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Input Area with Upload Buttons */}
          <div className="chatbot-input-area">
            {/* <motion.button
              className="w-10 h-10 sm:w-12 sm:h-12 min-w-10 min-h-10 sm:min-w-12 sm:min-h-12 text-xl sm:text-2xl flex items-center justify-center rounded-full transition-all shadow-[0_2px_8px_rgba(212,165,116,0.25)] bg-gradient-to-br from-[#D4A574] to-[#C9A882] hover:scale-110 hover:shadow-[0_4px_16px_rgba(212,165,116,0.35)]"
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              title="Emoji"
            >
              😊
            </motion.button> */}
            {/* Single Upload for Excel and Image */}
            <div className="relative">
              <input
                type="file"
                accept={
                  activeFlow === "assignment"
                    ? ".pdf,.doc,.docx,image/*"
                    : ".xlsx,.xls,.csv,image/*"
                }
                id="file-upload-input"
                className="hidden"
                disabled={
                  activeFlow !== "attendance" && activeFlow !== "assignment"
                }
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  if (activeFlow === "attendance") {
                    // Show upload message
                    setChatHistory((prev) => [
                      ...prev,
                      {
                        type: "user",
                        text: `Uploaded ${
                          file.type.startsWith("image/") ? "image" : "file"
                        }: ${file.name}`,
                      },
                    ]);

                    try {
                      if (file.type.startsWith("image/")) {
                        // For images, use existing class info if available, otherwise show modal
                        const existingClassInfo =
                          classInfo ||
                          pendingClassInfo ||
                          attendanceFlowState.classInfo;

                        if (existingClassInfo) {
                          // Class info already provided - process image directly without modal
                          await handleAttendanceImageUpload({
                            file,
                            sessionId: sessionId || userId || "",
                            userId,
                            classInfo: existingClassInfo,
                            isVoiceTriggered: false,
                            callbacks: getAttendanceFlowCallbacks(),
                          });
                        } else {
                          // No class info yet - show modal to collect it
                          setPendingImageFile(file);
                          setShowClassInfoModal(true);
                        }
                      } else if (attendanceStep === "student_details") {
                        // Handle non-image files for attendance
                        const result = await uploadFile(file);
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text:
                              result.message || "File processing completed.",
                          },
                        ]);
                      } else if (attendanceStep === "class_info") {
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text: "Please provide class information first before uploading student data files.",
                          },
                        ]);
                      }
                    } catch (err) {
                      setChatHistory((prev) => [
                        ...prev,
                        {
                          type: "bot",
                          text: `File upload failed: ${(err as Error).message}`,
                        },
                      ]);
                    }
                  } else if (activeFlow === "assignment") {
                    await handleAssignmentFileUpload({
                      file,
                      sessionId,
                      userId,
                      getErpContext,
                      appendBotMessage: (msg) =>
                        setChatHistory((prev) => [...prev, msg]),
                    });
                  }
                  e.target.value = "";
                }}
              />
              <motion.label
                htmlFor={
                  activeFlow === "attendance" || activeFlow === "assignment"
                    ? "file-upload-input"
                    : undefined
                }
                className={`chatbot-btn upload-btn w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl ${
                  activeFlow === "attendance" || activeFlow === "assignment"
                    ? "cursor-pointer"
                    : "cursor-not-allowed"
                }`}
                whileHover={
                  activeFlow === "attendance" || activeFlow === "assignment"
                    ? { scale: 1.08, y: -2 }
                    : {}
                }
                whileTap={
                  activeFlow === "attendance" || activeFlow === "assignment"
                    ? { scale: 0.95 }
                    : {}
                }
                title={
                  activeFlow === "attendance"
                    ? "Upload Excel or Image"
                    : activeFlow === "assignment"
                      ? "Upload Assignment File (PDF, DOCX, Image)"
                      : "Enable assignment or attendance flow to upload"
                }
                onClick={(e) => {
                  if (
                    activeFlow !== "attendance" &&
                    activeFlow !== "assignment"
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <FiUpload />
              </motion.label>
            </div>

            {/* Auto-routing display - HIDDEN as per user request */}
            {/* {autoRouting && detectedFlow && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "6px 12px",
                  backgroundColor: "#e3f2fd",
                  borderRadius: "8px",
                  marginBottom: "6px",
                  fontSize: "13px",
                  color: "#1565c0",
                }}
              >
                <span style={{ fontWeight: "600" }}>
                  🤖 Auto-detected:
                </span>
                <span style={{
                  padding: "2px 8px",
                  backgroundColor: "#bbdefb",
                  borderRadius: "12px",
                  fontWeight: "500",
                }}>
                  {detectedFlow}
                </span>
                <span style={{ opacity: 0.8 }}>
                  ({(classificationConfidence * 100).toFixed(0)}% confidence)
                </span>
              </div>
            )} */}

            <input
              type="text"
              placeholder={
                fullVoiceMode
                  ? "Speak naturally — I'll respond when you finish..."
                  : "Ask me anything!"
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !isRecording && handleSubmit()
              }
              className="chatbot-input text-base sm:text-lg px-3 py-2 sm:px-4 sm:py-3 min-h-[40px] sm:min-h-[48px]"
              disabled={isRecording && fullVoiceMode}
            />
            <button
              onClick={() => {
                if (fullVoiceMode) {
                  setFullVoiceMode(false);
                  stopStreaming(true);
                } else {
                  setFullVoiceMode(true);
                  startStreaming(true);
                }
              }}
              className={`chatbot-btn w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl flex items-center justify-center ${
                fullVoiceMode ? " recording" : ""
              }`}
              title={
                fullVoiceMode
                  ? "Exit Full Voice Mode (Hands-Free)"
                  : "Full Voice Mode — Mic always on, auto turn detection"
              }
            >
              <FiHeadphones />
            </button>
            {!fullVoiceMode && (
              <button
                onClick={() =>
                  isRecording ? stopStreaming() : startStreaming()
                }
                className={`chatbot-btn mic w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl${
                  isRecording ? " recording" : ""
                }`}
                title={isRecording ? "Stop Recording" : "Start Recording"}
              >
                {isRecording ? <FiMicOff /> : <FiMic />}
              </button>
            )}
            {fullVoiceMode && isRecording && (
              <div
                className="flex items-center justify-center gap-1.5 px-2 text-sm text-emerald-600 font-medium"
                title="Listening — speak naturally"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isVoiceActive
                      ? "animate-pulse bg-red-500"
                      : "bg-emerald-400"
                  }`}
                />
                {isVoiceActive ? "Speaking…" : "Listening…"}
              </div>
            )}
            <button
              onClick={() => handleSubmit()}
              className="chatbot-btn send"
              title="Send Message"
              disabled={isRecording && fullVoiceMode}
            >
              <FiSend />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AudioStreamerChatBot;
