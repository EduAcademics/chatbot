import { useEffect, useRef, useState } from "react";
import "./markdown-tables.css";

// Added icons
import ClassInfoModal from "./ClassInfoModal";
import InterviewBot from "./InterviewBot";
import ChatHeader from "./ChatHeader";
import ChatConversation from "./ChatConversation";
import ChatFooter from "./ChatFooter";
import type { ChatMessage, FlowType } from "./types";
type BotType = "default" | "interview";
import {
  aiAPI,
  userAPI,
  leaveApprovalAPI,
  courseProgressAPI,
  getAIHeaders,
} from "../services/api";
import { API_BASE_URL } from "../config/api";
const wsBase = import.meta.env.VITE_WS_BASE_URL;
const AudioStreamerChatBot = ({
  userId,
  roles,
  email,
}: {
  userId: string;
  roles: string;
  email: string;
}) => {
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

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

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputText, setInputText] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const [ttsLoading, setTtsLoading] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState<{
    [idx: number]: string;
  }>({});
  const [showCorrectionBox, setShowCorrectionBox] = useState<number | null>(
    null
  );
  const [activeFlow, setActiveFlow] = useState<FlowType>("none"); // <-- add
  const [selectedBot, setSelectedBot] = useState<BotType>("default"); // Bot selector state
  const [sessionId, setSessionId] = useState<string | null>(null); // <-- add
  const [attendanceData, setAttendanceData] = useState<any[]>([]); // <-- add for editable attendance
  const [attendanceStep, setAttendanceStep] = useState<
    "class_info" | "student_details" | "completed"
  >("class_info");
  const [pendingClassInfo, setPendingClassInfo] = useState<{
    class_: string;
    section: string;
    date: string;
  } | null>(null); // <-- add for pending class info
  const [, setIsProcessingImage] = useState(false); // <-- add for image processing state
  // Debug wrapper for setAttendanceData

  const [classInfo, setClassInfo] = useState<any>(null); // <-- add for class info
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(
    null
  ); // Track which message is being edited
  const [showClassInfoModal, setShowClassInfoModal] = useState(false); // <-- add for class info modal
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null); // <-- add for pending image
  const [leaveApprovalRequests, setLeaveApprovalRequests] = useState<any[]>([]); // <-- add for leave approval requests
  const [loadingLeaveRequests, setLoadingLeaveRequests] = useState(false); // <-- add for loading state
  const [rejectReason, setRejectReason] = useState<{ [key: string]: string }>(
    {}
  ); // <-- add for reject reasons
  const [classSections, setClassSections] = useState<any[]>([]); // <-- add for course progress class sections
  const [loadingClassSections, setLoadingClassSections] = useState(false); // <-- add for loading class sections
  const [selectedClassSection, setSelectedClassSection] = useState<{
    classId: string;
    sectionId: string;
    className?: string;
    sectionName?: string;
  } | null>(null); // <-- add for selected class/section
  const [, setCourseProgressData] = useState<any>(null); // <-- add for course progress data

  // Auto-routing states merge on 17-12-2025 manvi + lakshmi

  const [autoRouting, setAutoRouting] = useState<boolean>(true);
  const [routerMode, setRouterMode] = useState<"manual" | "auto" | "llm">(
    "llm"
  );
  const [_detectedFlow, setDetectedFlow] = useState<string | null>(null);
  const [_classificationConfidence, setClassificationConfidence] =
    useState<number>(0);
  const [fullVoiceAutoSubmitTimer, setFullVoiceAutoSubmitTimer] =
    useState<ReturnType<typeof setTimeout> | null>(null); // <-- add for full voice auto-submit timer
  const [_lastVoiceInputTime, setLastVoiceInputTime] = useState<number>(0); // <-- add for tracking last voice input time

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

  const handleSetRoutingMode = async (mode: "manual" | "auto" | "llm") => {
    setRouterMode(mode);
    if (mode === "manual") {
      setAutoRouting(false);
      setActiveFlow("none");
      setUserOptionSelected(false);
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Manual mode activated. Select a flow from the menu.",
        },
      ]);
      return;
    }

    // auto + llm both mean auto-routing enabled
    setAutoRouting(true);
    setActiveFlow("none");
    setUserOptionSelected(false);
    setChatHistory((prev) => [
      ...prev,
      {
        type: "bot",
        text:
          mode === "auto"
            ? "Auto-routing enabled. I'll detect the flow automatically."
            : "LLM routing enabled. Using AI-powered flow detection.",
      },
    ]);
  };

  const handleSelectFlow = async (flow: FlowType) => {
    // Most flows are a manual override (disable auto-routing)
    if (flow !== "none") setAutoRouting(false);
    setActiveFlow(flow);
    setUserOptionSelected(true);

    if (flow === "query") {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Query flow activated (Manual override). You can now ask me anything!",
        },
      ]);
      return;
    }

    if (flow === "attendance") {
      setAttendanceStep("class_info");
      setPendingClassInfo(null);
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Attendance flow activated (Manual override). First, please provide class information (class name, section, and date). For example: 'Class 6 A on 2025-01-15' or upload an image with class details.",
        },
      ]);
      return;
    }

    if (flow === "voice_attendance") {
      setAttendanceStep("class_info");
      setPendingClassInfo(null);
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Voice attendance flow activated (Manual override)! 🎤 You can now use voice commands to mark attendance. First, speak the class information (class name, section, and date), then speak the student names and their attendance status. For example: 'Class 6 A on 2025-01-15' then 'Aarav present, Diya absent'.",
        },
      ]);
      return;
    }

    if (flow === "leave") {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Leave application flow activated (Manual override)! 📝 Please provide your leave details. I'll help you apply for leave. You can provide information like: start date, end date, leave type, and reason. For example: 'I want to apply for leave from 2025-11-14 to 2025-11-14 for personal reasons'.",
        },
      ]);
      return;
    }

    if (flow === "assignment") {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "📚 **Assignment Creation Flow Activated!** I'll guide you through creating an assignment step by step. Just answer my questions naturally!",
        },
      ]);
      return;
    }

    if (flow === "course_progress") {
      setSelectedClassSection(null);
      setCourseProgressData(null);
      setLoadingClassSections(true);
      try {
        const authToken = localStorage.getItem("token");
        const { academic_session, branch_token } = getErpContext();
        const response = await courseProgressAPI.fetchClassSections({
          page: 1,
          limit: 50,
          bearer_token: authToken || undefined,
          academic_session,
          branch_token,
        });

        if (
          (response.status === 200 || response.status === "success") &&
          response.data?.options
        ) {
          const options = response.data.options || [];
          setClassSections(options);
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: `📊 **Course Progress Flow Activated (Manual override)!**\n\nI found **${options.length}** class-section(s) available. Please select a class and section from the list below to view the course progress.`,
              classSections: options,
            },
          ]);
        } else {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: `⚠️ ${response.message || "No class sections found. Please try again."}`,
            },
          ]);
        }
      } catch (err: any) {
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: `❌ Error loading class sections: ${err.message || "Unknown error"}`,
          },
        ]);
      } finally {
        setLoadingClassSections(false);
      }
      return;
    }

    if (flow === "leave_approval") {
      // Clear existing requests and fetch fresh ones
      setLeaveApprovalRequests([]);
      setRejectReason({});
      setLoadingLeaveRequests(true);
      try {
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
          const pendingRequests = response.data.leaveRequests || [];
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
              text: `⚠️ ${response.message || "No pending leave requests found."}`,
            },
          ]);
        }
      } catch (err: any) {
        const errorMessage =
          err.message || err.response?.data?.message || "Unknown error occurred";
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
      return;
    }

    // flow === "none"
    // keep current behavior: just set none (no extra message)
  };

  const handleRejectReasonChange = (uuid: string, value: string) => {
    setRejectReason((prev) => ({ ...prev, [uuid]: value }));
  };

  const handleApproveLeaveRequest = async (request: any) => {
    try {
      const authToken = localStorage.getItem("token");
      const { academic_session, branch_token } = getErpContext();
      await leaveApprovalAPI.approve({
        leave_request_uuid: request.uuid,
        bearer_token: authToken || undefined,
        academic_session,
        branch_token,
      });
      const employeeName =
        request.employee?.personalInfo?.employeeName || "Unknown";
      setLeaveApprovalRequests((prev) =>
        prev.filter((r) => r.uuid !== request.uuid)
      );
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: `✅ Leave request for **${employeeName}** has been approved successfully!`,
        },
      ]);
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: `❌ Error approving leave request: ${err.message || "Unknown error"}`,
        },
      ]);
    }
  };

  const handleRejectLeaveRequest = async (request: any) => {
    try {
      const authToken = localStorage.getItem("token");
      const reason = rejectReason[request.uuid] || "No reason provided";
      const { academic_session, branch_token } = getErpContext();
      await leaveApprovalAPI.reject({
        leave_request_uuid: request.uuid,
        reject_reason: reason,
        bearer_token: authToken || undefined,
        academic_session,
        branch_token,
      });
      const employeeName =
        request.employee?.personalInfo?.employeeName || "Unknown";
      setLeaveApprovalRequests((prev) =>
        prev.filter((r) => r.uuid !== request.uuid)
      );
      setRejectReason((prev) => {
        const next = { ...prev };
        delete next[request.uuid];
        return next;
      });
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: `❌ Leave request for **${employeeName}** has been rejected. Reason: ${reason}`,
        },
      ]);
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: `❌ Error rejecting leave request: ${err.message || "Unknown error"}`,
        },
      ]);
    }
  };

  const handleSelectClassSection = async (selection: {
    classId: string;
    sectionId: string;
    className: string;
    sectionName: string;
  }) => {
    const { classId, sectionId, className, sectionName } = selection;
    if (!classId || !sectionId) {
      setChatHistory((prev) => [
        ...prev,
        { type: "bot", text: "❌ Error: Missing class or section ID. Please try again." },
      ]);
      return;
    }

    setSelectedClassSection(selection);
    setIsProcessing(true);
    try {
      const authToken = localStorage.getItem("token");
      const { academic_session, branch_token } = getErpContext();
      const progressResponse = await courseProgressAPI.getProgress({
        classId,
        sectionId,
        bearer_token: authToken || undefined,
        academic_session,
        branch_token,
      });

      if (
        ((progressResponse.status as any) === 200 ||
          progressResponse.status === "success") &&
        progressResponse.data
      ) {
        const progressData =
          (progressResponse.data as any).resp ||
          progressResponse.data.progress ||
          progressResponse.data;
        setCourseProgressData(progressData);

        const teacherDiarys = progressData.teacherDiarys || progressData || [];
        const totalSubjects = Array.isArray(teacherDiarys) ? teacherDiarys.length : 0;
        const summaryText =
          totalSubjects > 0
            ? `📊 **Course Progress for ${className} ${sectionName}**\n\nFound **${totalSubjects}** subject(s) with progress tracking. See details below.`
            : `📊 **Course Progress for ${className} ${sectionName}**\n\nNo progress data available yet.`;

        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: summaryText,
            courseProgress: progressData,
            classSection: {
              classId,
              sectionId,
              className,
              sectionName,
            },
          },
        ]);

        // Voice-initiated TTS follow-up
        try {
          if (courseProgressVoiceInitiatedRef.current === true) {
            const classLabel = `${className} ${sectionName}`;
            const speech =
              totalSubjects > 0
                ? `Course Progress for ${classLabel}. Scroll down to see details.`
                : `Course Progress for ${classLabel}. No progress data available yet.`;
            void handlePlayTTS(-1, speech);
            courseProgressVoiceInitiatedRef.current = false;
          }
        } catch (ttsErr) {
          console.error("TTS playback failed:", ttsErr);
        }
      } else {
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text:
              progressResponse.message ||
              "Failed to fetch course progress. Please try again.",
          },
        ]);
      }
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: `❌ Error fetching course progress: ${err.message || "Unknown error"}`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelAttendanceEdit = (messageIndex: number) => {
    setEditingMessageIndex(null);
    setChatHistory((prev) => {
      const updatedHistory = [...prev];
      if (updatedHistory[messageIndex] && updatedHistory[messageIndex].type === "bot") {
        (updatedHistory[messageIndex] as any).isBeingEdited = false;
      }
      return updatedHistory;
    });
    setChatHistory((prev) => [
      ...prev,
      { type: "bot", text: "❌ Edit cancelled. No changes were saved." },
    ]);
  };

  const handleFileSelected = async (file: File) => {
    if (activeFlow === "attendance") {
      // Show upload message
      setChatHistory((prev) => [
        ...prev,
        {
          type: "user",
          text: `Uploaded ${file.type.startsWith("image/") ? "image" : "file"}: ${file.name}`,
        },
      ]);

      try {
        if (file.type.startsWith("image/")) {
          if (attendanceStep === "class_info") {
            setPendingImageFile(file);
            setShowClassInfoModal(true);
            return;
          }

          if (attendanceStep === "student_details") {
            if (!pendingClassInfo) return;

            try {
              setIsProcessingImage(true);
              setChatHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  text: "🔄 Processing image... Please wait while I extract attendance information from your image.",
                  isProcessing: true,
                } as any,
              ]);

              const result = await uploadAttendanceImage(file, pendingClassInfo);

              setIsProcessingImage(false);
              setChatHistory((prev) => prev.filter((msg) => !(msg as any).isProcessing));

              if (result.data.attendance_summary && result.data.attendance_summary.length > 0) {
                const newMessage: any = {
                  type: "bot" as const,
                  answer: result.message,
                  references: undefined,
                  mongodbquery: undefined,
                  activeTab: "answer" as const,
                  attendance_summary: result.data.attendance_summary,
                  class_info: pendingClassInfo,
                  bulkattandance: result.data.bulkattandance,
                  finish_collecting: result.data.finish_collecting,
                };

                setAttendanceData(result.data.attendance_summary);
                setClassInfo(pendingClassInfo);
                setAttendanceStep("completed");

                newMessage.buttons = [
                  {
                    label: "Edit Attendance",
                    action: () => {
                      setAttendanceData(result.data.attendance_summary);
                      setClassInfo(pendingClassInfo);
                      setEditingMessageIndex(chatHistory.length);
                      setChatHistory((prev) => {
                        const updatedHistory = [...prev];
                        const lastMessage = updatedHistory[updatedHistory.length - 1];
                        if (lastMessage && lastMessage.type === "bot") {
                          (lastMessage as any).isBeingEdited = true;
                        }
                        return updatedHistory;
                      });
                      setChatHistory((prev) => [
                        ...prev,
                        {
                          type: "bot",
                          text: "✅ Edit mode activated! You can now modify the attendance data in the table above. Use the Save/Cancel buttons in the table to save or discard your changes.",
                        },
                      ]);
                    },
                  },
                  { label: "Approve", action: () => handleOCRApproval() },
                  { label: "Reject", action: () => handleOCRRejection() },
                ];

                setChatHistory((prev) => [...prev, newMessage]);
              } else {
                setChatHistory((prev) => [
                  ...prev,
                  {
                    type: "bot",
                    text: "Image processed but no attendance data found. Please provide student details manually or try uploading a different image.",
                  },
                ]);
              }
            } catch (error) {
              setIsProcessingImage(false);
              setChatHistory((prev) => {
                const filteredHistory = prev.filter((msg) => !(msg as any).isProcessing);
                return [
                  ...filteredHistory,
                  {
                    type: "bot",
                    text: `❌ Image processing failed: ${(error as Error).message}. Please try uploading a different image or provide attendance data as text.`,
                  },
                ];
              });
            }
          }
        } else if (attendanceStep === "student_details") {
          const result = await uploadFile(file);
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: result.message || "File processing completed." },
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
          { type: "bot", text: `File upload failed: ${(err as Error).message}` },
        ]);
      }
      return;
    }

    if (activeFlow === "assignment") {
      try {
        const result = await uploadAssignmentFile(file);
        if (result.status === "success") {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: `✅ File uploaded successfully: ${result.data?.filename || file.name}\n\nThe file has been attached to your assignment. Type 'done' to proceed or upload more files.`,
            },
          ]);

          const fileUuid = result.data?.file_uuid;
          if (fileUuid) {
            const fileMessage = `Add file ${fileUuid} to attachments`;
            setTimeout(async () => {
              try {
                const authToken = localStorage.getItem("token");
                const data = await aiAPI.assignmentChat({
                  session_id: sessionId || userId,
                  user_id: userId,
                  query: fileMessage,
                  bearer_token: authToken || undefined,
                  ...getErpContext(),
                });
                if (data.status === "success" && data.data) {
                  const answer = data.data.answer || "File added to assignment.";
                  setChatHistory((prev) => [
                    ...prev,
                    { type: "bot", answer: answer, activeTab: "answer" as const },
                  ]);
                }
              } catch (err) {
                console.error("Error adding file to assignment:", err);
              }
            }, 500);
          } else {
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text: "⚠️ File uploaded but could not be attached. Please try uploading again.",
              },
            ]);
          }
        }
      } catch (err) {
        setChatHistory((prev) => [
          ...prev,
          { type: "bot", text: `File upload failed: ${(err as Error).message}` },
        ]);
      }
      return;
    }
  };

  useEffect(() => {
    if (chatHistory.length === 0) {
      const welcomeMessage = {
        type: "bot" as const,
        answer:
          "Welcome! I'm ready to help you with queries. You can ask me anything or use the dropdown to select a specific flow.",
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

  const convertFloat32ToInt16 = (buffer: Float32Array) => {
    const int16Buffer = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Buffer;
  };

  const startStreaming = async () => {
    // Request microphone only when starting recording
    const stream = await navigator.mediaDevices.getUserMedia({
      audio:
        selectedDeviceId === "default"
          ? true
          : { deviceId: { exact: selectedDeviceId } },
    });
    micStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    const socket = new WebSocket(`${wsBase}/ws/speech_to_text`);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(selectedLanguage);

      processor.onaudioprocess = (e) => {
        const floatSamples = e.inputBuffer.getChannelData(0);
        const int16Samples = convertFloat32ToInt16(floatSamples);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(int16Samples.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      setIsRecording(true);
    };

    socket.onmessage = (event: MessageEvent) => {
      const newText = event.data;
      setInputText((prev) => {
        const updated = prev + " " + newText;

        // For full voice attendance flow, implement 3-second auto-submit
        if (activeFlow === "full_voice_attendance") {
          const currentTime = Date.now();
          setLastVoiceInputTime(currentTime);

          // Clear existing timer
          if (fullVoiceAutoSubmitTimer) {
            clearTimeout(fullVoiceAutoSubmitTimer);
          }

          // Set new 3-second timer for auto-submit
          const timer = setTimeout(() => {
            const finalInput = updated.trim();
            if (finalInput && !isProcessing) {
              // Auto submit the voice input
              setInputText(finalInput);
              handleSubmit();
            }
          }, 3000);
          setFullVoiceAutoSubmitTimer(timer);
        }

        return updated;
      });
    };

    socket.onerror = (err) => console.error("WebSocket error:", err);
    socket.onclose = () => {
      setIsRecording(false);
      console.log("WebSocket closed");
    };
  };

  const stopStreaming = async () => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    // Stop and release microphone stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsRecording(false);
    // Mark this request as voice-triggered for the duration of the
    // subsequent `handleSubmit()` call. This flag is intentionally
    // request-scoped and will be cleared immediately after submission
    // completes to avoid any leakage to other flows.
    isVoiceTriggeredRequestRef.current = true;
    try {
      await handleSubmit();
    } finally {
      // Reset immediately after the request finishes (success or error)
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

  // Upload assignment file
  const uploadAssignmentFile = async (file: File) => {
    try {
      const result = await aiAPI.uploadAssignmentFile(
        file,
        sessionId || userId
      );
      if (result.status === "success" && result.data?.file_uuid) {
        // Send message to assignment chat with file UUID
        // The backend will handle adding this to attachments
        console.log(
          `File uploaded: ${result.data.filename}. File ID: ${result.data.file_uuid}`
        );
        return result;
      }
      return result;
    } catch (error) {
      console.error("Assignment file upload error:", error);
      throw error;
    }
  };

  // Upload attendance image through OCR processing
  const uploadAttendanceImage = async (
    file: File,
    classInfo: { class_: string; section: string; date: string }
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
    message: string
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

  const handleSubmit = async () => {
    if (!inputText.trim()) return;
    const userMessage = inputText.trim();

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
    const exitKeywords = ["exit", "cancel", "restart", "quit", "stop", "done"];
    const isExitCommand = exitKeywords.some(
      (keyword) => userMessage.toLowerCase().trim() === keyword
    );

    if (isExitCommand && activeFlow !== "none" && activeFlow !== "query") {
      console.log("🚪 Exit command detected, exiting flow:", activeFlow);
      // Clear voice-initiated flags when exiting flows
      if (activeFlow === "leave") {
        leaveVoiceInitiatedRef.current = false;
      }
      if (activeFlow === "course_progress") {
        courseProgressVoiceInitiatedRef.current = false;
      }
      if (activeFlow === "attendance" || activeFlow === "voice_attendance") {
        attendanceVoiceInitiatedRef.current = false;
      }
      setActiveFlow("none");
      setAttendanceStep("class_info");
      setPendingClassInfo(null);
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: `✅ Exited from ${activeFlow} flow. Welcome back! You can ask me anything or use the dropdown to select a specific flow.`,
        },
      ]);
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
      userMessage.toLowerCase().includes(keyword)
    );

    // Stay in active flow if user is responding (not starting new request)
    // If already in leave/assignment and message doesn't look like a new request, stay in flow
    // Don't check userOptionSelected - if activeFlow is set, we're in that flow
    const inLeaveFlow = activeFlow === "leave" && !looksLikeNewRequest;
    const inAssignmentFlow =
      activeFlow === "assignment" && !looksLikeNewRequest;

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
      targetFlow = activeFlow;
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
        userMessage.toLowerCase().trim()
      );

      if (isSimpleResponse && activeFlow !== "none" && activeFlow !== "query") {
        // Keep current flow for simple confirmation words
        console.log(
          "📍 Simple response detected, keeping current flow:",
          activeFlow
        );
        targetFlow = activeFlow;
      } else if (
        activeFlow !== "none" &&
        activeFlow !== "query" &&
        userMessage.length < 50 &&
        !looksLikeNewRequest
      ) {
        // Short message in an active flow (likely a response to a question) - stay in current flow
        console.log(
          "📍 Short response in active flow, staying in:",
          activeFlow
        );
        targetFlow = activeFlow;
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
            tokens.includes(t)
          );

          if (hasLeaveToken && hasApprovalToken) {
            console.log(
              "📍 Lexical override: forcing leave_approval based on tokens",
              { tokens }
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
      if (targetFlow === "attendance" || targetFlow === "voice_attendance") {
        console.log("📍 Initializing attendance flow state");
        setAttendanceStep("class_info");
        setPendingClassInfo(null);

        // If this Attendance request was initiated via microphone,
        // mark that the attendance flow was voice-initiated so the
        // subsequent responses can also trigger TTS.
        try {
          if (
            isVoiceTriggeredRequestRef.current === true &&
            (targetFlow === "attendance" || targetFlow === "voice_attendance")
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

        // IMPORTANT: Set activeFlow BEFORE processing the message
        setActiveFlow("assignment");

        console.log("📍 Processing first assignment message");
        // Don't return here - let the user's message be processed by the API
        // This avoids duplicate prompts for the assignment name
      }

      // Initialize leave flow
      if (targetFlow === "leave" && isNewFlowInitialization) {
        console.log("📍 Initializing leave flow state");

        // IMPORTANT: Set activeFlow BEFORE returning so next message stays in leave flow
        setActiveFlow("leave");

        // Add welcome message matching manual mode
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: "📝 I'll help you apply for leave. Please provide details like:\n• Start date and end date\n• Leave type (sick, casual, earned, etc.)\n• Reason for leave",
          },
        ]);

        // If this Leave request was initiated via microphone,
        // play a concise informational TTS line and mark
        // that the leave flow was voice-initiated so the
        // subsequent responses can also trigger TTS.
        try {
          if (
            isVoiceTriggeredRequestRef.current === true &&
            // Double-check flow
            targetFlow === "leave"
          ) {
            leaveVoiceInitiatedRef.current = true;
            const speech = "I'll help you apply for leave. Please provide details like: Start date and end date, Leave type such as sick, casual, earned, etc., and Reason for leave.";
            void handlePlayTTS(-1, speech);
          }
        } catch (ttsErr) {
          console.error("TTS playback failed:", ttsErr);
        }

        // Stop here - don't process the initialization message, wait for user's next input
        setIsProcessing(false);
        return;
      }
    } else {
      console.log("📍 Using current activeFlow:", activeFlow);
    }

    // If still no flow selected after classification, prompt user
    if (!userOptionSelected && targetFlow === "none") {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Please select an option from the menu, or I'll try to detect what you need automatically. Try asking something like 'Mark attendance for class 6A' or 'Apply for leave tomorrow'.",
        },
      ]);
      setIsProcessing(false);
      return;
    }

    console.log("📍 Routing to flow:", targetFlow);
    console.log("📍 Current attendance step:", attendanceStep);
    console.log("📍 Pending class info:", pendingClassInfo);

    // Update active flow for next message (unless manually overridden)
    if (autoRouting) {
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
        if (data.status === "success" && data.data) {
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
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: data.message },
          ]);
        } else {
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: "No response from AI." },
          ]);
        }
      } catch (err) {
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: "Sorry, there was an error processing your query.",
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    } else if (targetFlow === "attendance") {
      // Step-by-step attendance flow
      if (attendanceStep === "class_info") {
        // First step: Collect class information
        try {
          const data = await aiAPI.chat({
            session_id: sessionId || userId,
            query: userMessage, // Simplified - backend will auto-fetch class info for class teachers
            user_id: userId, // Pass user_id for auto-fetching class teacher info
          });

          if (data.status === "success" && data.data) {
            // Try to extract class info from the response
            const classInfo = data.data.class_info;
            const answer = data.data.answer || "";

            // Check if backend auto-fetched class info and provided ready message
            // Check for "Ready to mark attendance" message first (even if classInfo might not be in response yet)
            if (answer.includes("Ready to mark attendance") || answer.includes("ready to mark attendance")) {
              // Backend auto-fetched class info and is ready for student details
              if (classInfo && classInfo.class_ && classInfo.section && classInfo.date) {
                setPendingClassInfo(classInfo);
                setAttendanceStep("student_details");
                // Remove the initial "Attendance flow detected" message and show backend's ready message
                setChatHistory((prev) => {
                  const filtered = prev.filter(
                    (msg) => !msg.text || !msg.text.includes("Attendance flow detected")
                  );
                  return [
                    ...filtered,
                    {
                      type: "bot",
                      text: answer, // Use the backend's ready message
                    },
                  ];
                });

                // TTS for class info confirmation if voice-initiated
                try {
                  if (
                    attendanceVoiceInitiatedRef.current === true &&
                    targetFlow === "attendance"
                  ) {
                    const speech = generateAttendanceTTSSummary(answer, undefined, classInfo);
                    void handlePlayTTS(-1, speech);
                  }
                } catch (ttsErr) {
                  console.error("TTS playback failed:", ttsErr);
                }
              } else {
                // Backend returned ready message but classInfo not in response - extract from answer
                const classMatch = answer.match(/for\s+(\w+)\s+(\w+)\s+on\s+(\d{4}-\d{2}-\d{2})/i);
                if (classMatch && classMatch[1] && classMatch[2] && classMatch[3]) {
                  const extractedClassInfo = {
                    class_: classMatch[1],
                    section: classMatch[2],
                    date: classMatch[3],
                  };
                  setPendingClassInfo(extractedClassInfo);
                  setAttendanceStep("student_details");
                  setChatHistory((prev) => {
                    const filtered = prev.filter(
                      (msg) => !msg.text || !msg.text.includes("Attendance flow detected")
                    );
                    return [
                      ...filtered,
                      {
                        type: "bot",
                        text: answer,
                      },
                    ];
                  });
                } else {
                  // Fallback: just show the answer
                  setChatHistory((prev) => [
                    ...prev,
                    {
                      type: "bot",
                      text: answer,
                    },
                  ]);
                }
              }
            } else if (
              classInfo &&
              classInfo.class_ &&
              classInfo.section &&
              classInfo.date
            ) {
              // Class info successfully extracted (manual entry)
              setPendingClassInfo(classInfo);
              setAttendanceStep("student_details");
              const classInfoMessage = `✅ Class information confirmed: Class ${classInfo.class_} ${classInfo.section} on ${classInfo.date}. Now please provide student details for attendance. You can type the student names and their attendance status, or upload an image with the attendance list.`;
              setChatHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  text: classInfoMessage,
                },
              ]);

              // TTS for class info confirmation if voice-initiated
              try {
                if (
                  attendanceVoiceInitiatedRef.current === true &&
                  targetFlow === "attendance"
                ) {
                  const speech = generateAttendanceTTSSummary(classInfoMessage, undefined, classInfo);
                  void handlePlayTTS(-1, speech);
                }
              } catch (ttsErr) {
                console.error("TTS playback failed:", ttsErr);
              }
            } else {
              // Enhanced parsing from the answer text if structured data is not available
              // Try multiple patterns to extract class information
              let classMatch = answer.match(/class[:\s]*(\w+)/i);
              let sectionMatch = answer.match(/section[:\s]*(\w+)/i);
              let dateMatch = answer.match(
                /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i
              );

              // If no matches from answer, try parsing from user message directly
              if (!classMatch || !sectionMatch || !dateMatch) {
                // Try to parse from the original user message

                // Enhanced class pattern matching - handle various formats
                classMatch =
                  userMessage.match(
                    /(?:class|grade|standard|nursery|kg|pre-k|prek|lkg|ukg)[:\s]*(\w+)/i
                  ) ||
                  userMessage.match(/(\w+)\s+(?:class|grade|standard)/i) ||
                  userMessage.match(/(nursery|kg|pre-k|prek|lkg|ukg)/i) ||
                  userMessage.match(/class\s+(\w+)/i) ||
                  userMessage.match(/mark\s+attendance\s+for\s+class\s+(\w+)/i);

                // Enhanced section pattern matching - handle various formats
                sectionMatch =
                  userMessage.match(/(?:section|sec)[:\s]*(\w+)/i) ||
                  userMessage.match(/(\w+)\s+(?:section|sec)/i) ||
                  userMessage.match(/\b([a-z])\b/i) ||
                  userMessage.match(/class\s+\w+\s+(\w+)/i) ||
                  userMessage.match(/nursery\s+(\w+)/i) ||
                  userMessage.match(/for\s+(\w+)/i);

                // Enhanced date pattern matching - handle various formats
                dateMatch =
                  userMessage.match(/(\d{4}-\d{2}-\d{2})/i) ||
                  userMessage.match(/(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
                  userMessage.match(
                    /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i
                  ) ||
                  userMessage.match(
                    /(\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})/i
                  ) ||
                  userMessage.match(
                    /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i
                  );
              }

              // Special handling for specific patterns like "Class NURSERY B for 5 August 2025"
              if (!classMatch || !sectionMatch || !dateMatch) {
                // Try specific patterns for common formats
                const specificPatterns = [
                  // "Class NURSERY B for 5 August 2025"
                  /class\s+(\w+)\s+(\w+)\s+for\s+(\d{1,2}\s+\w+\s+\d{4})/i,
                  // "Class Nursery Section B 2025-08-14"
                  /class\s+(\w+)\s+section\s+(\w+)\s+(\d{4}-\d{2}-\d{2})/i,
                  // "Mark attendance for Class NURSERY B for 5 August 2025"
                  /mark\s+attendance\s+for\s+class\s+(\w+)\s+(\w+)\s+for\s+(\d{1,2}\s+\w+\s+\d{4})/i,
                ];

                for (const pattern of specificPatterns) {
                  const match = userMessage.match(pattern);
                  if (match && match[1] && match[2] && match[3]) {
                    classMatch = match;
                    sectionMatch = match;
                    dateMatch = match;
                    break;
                  }
                }
              }

              if (classMatch && sectionMatch && dateMatch) {
                const extractedClassInfo = {
                  class_: classMatch[1].toUpperCase(),
                  section: sectionMatch[1].toUpperCase(),
                  date: dateMatch[1],
                };

                console.log("🎯 Extracted class info:", extractedClassInfo);
                console.log("🎯 Date match result:", dateMatch[1]);
                setPendingClassInfo(extractedClassInfo);
                setAttendanceStep("student_details");
                setChatHistory((prev) => [
                  ...prev,
                  {
                    type: "bot",
                    text: `✅ Class information confirmed: Class ${extractedClassInfo.class_} ${extractedClassInfo.section} on ${extractedClassInfo.date}. Now please provide student details for attendance.`,
                  },
                ]);
              } else {
                // Ask for clarification with more specific examples including nursery
                const clarificationMessage = `I need more specific class information. Please provide:\n• Class/Standard/Grade (e.g., 6, Class 6, Grade 6, Standard 6, Nursery, KG, Pre-K)\n• Section (e.g., A, B, C, Section A)\n• Date (e.g., 2025-01-15, 15/01/2025, Jan 15 2025)\n\nExamples: "Class 6 A on 2025-01-15", "Nursery B on 2025-08-14", or "Grade 10 Section B for 15th January 2025"`;
                setChatHistory((prev) => [
                  ...prev,
                  {
                    type: "bot",
                    text: clarificationMessage,
                  },
                ]);

                // TTS for clarification request if voice-initiated
                try {
                  if (
                    attendanceVoiceInitiatedRef.current === true &&
                    targetFlow === "attendance"
                  ) {
                    const speech = generateAttendanceTTSSummary(clarificationMessage);
                    void handlePlayTTS(-1, speech);
                  }
                } catch (ttsErr) {
                  console.error("TTS playback failed:", ttsErr);
                }
              }
            }
          } else {
            const errorMessage = data.data?.answer || "Please provide class information clearly.";
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text: errorMessage,
              },
            ]);

            // TTS for error messages if voice-initiated
            try {
              if (
                attendanceVoiceInitiatedRef.current === true &&
                targetFlow === "attendance"
              ) {
                const speech = generateAttendanceTTSSummary(errorMessage);
                void handlePlayTTS(-1, speech);
              }
            } catch (ttsErr) {
              console.error("TTS playback failed:", ttsErr);
            }
          }
        } catch (err) {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: "Sorry, there was an error processing your request. Please try again.",
            },
          ]);
        } finally {
          setIsProcessing(false);
        }
      } else if (attendanceStep === "student_details") {
        // Second step: Collect student details
        try {
          const data = await aiAPI.chat({
            session_id: sessionId || userId,
            query: userMessage, // User provides student attendance details
            user_id: userId, // Pass user_id for context
          });

          if (data.status === "success" && data.data) {
            // Process the attendance data
            let parsedAttendanceData = data.data.attendance_summary;
            let parsedClassInfo = pendingClassInfo || data.data.class_info;

            // Parse markdown table if present
            const answer = data.data.answer || "";
            if (
              answer.includes("| Student Name |") &&
              answer.includes("| Attendance Status |")
            ) {
              const lines = answer.split("\n");
              const tableStartIndex = lines.findIndex((line: string) =>
                line.includes("| Student Name |")
              );
              if (tableStartIndex !== -1) {
                const tableLines = lines.slice(tableStartIndex + 2);
                const extractedData = [];

                for (const line of tableLines) {
                  if (line.includes("|") && !line.includes("---")) {
                    const cells = line
                      .split("|")
                      .map((cell: string) => cell.trim())
                      .filter((cell: string) => cell);
                    if (cells.length >= 2) {
                      extractedData.push({
                        student_name: cells[0],
                        attendance_status: cells[1],
                      });
                    }
                  }
                }

                if (extractedData.length > 0) {
                  parsedAttendanceData = extractedData;
                }
              }
            }

            // Create the message with attendance data
            const newMessage = {
              type: "bot" as const,
              answer: data.data?.answer,
              references: data.data?.references,
              mongodbquery: data.data?.mongodbquery,
              activeTab: "answer" as const,
              attendance_summary: parsedAttendanceData,
              class_info: parsedClassInfo,
              bulkattandance: data.data?.bulkattandance,
              finish_collecting: data.data?.finish_collecting,
            };

            console.log("Creating new message with attendance data:", {
              attendance_summary: parsedAttendanceData,
              class_info: parsedClassInfo,
              messageType: newMessage.type,
            });

            if (parsedAttendanceData && parsedAttendanceData.length > 0) {
              console.log(
                "🎯 Setting global state for text-based attendance:",
                {
                  parsedAttendanceData: parsedAttendanceData,
                  parsedClassInfo: parsedClassInfo,
                  dataLength: parsedAttendanceData.length,
                }
              );
              // Set global state FIRST before creating buttons
              setAttendanceData(parsedAttendanceData);
              setClassInfo(parsedClassInfo);
              setAttendanceStep("completed");

              // Calculate the message index that will be used (after this message is added)
              const messageIndexForButtons = chatHistory.length;

              // Capture the parsed data at the time of button creation to pass as fallback
              // This ensures the button closure has the most current data
              const capturedAttendanceData = parsedAttendanceData ? [...parsedAttendanceData] : [];
              const capturedClassInfo = parsedClassInfo ? { ...parsedClassInfo } : null;

              // Add the specific buttons as requested (initial state: read-only mode)
              (newMessage as any).buttons = [
                {
                  label: "Edit Attendance",
                  action: () => {
                    console.log(
                      "Edit Attendance clicked for text-based attendance"
                    );
                    console.log(
                      "Setting attendance data:",
                      capturedAttendanceData
                    );
                    console.log("Setting class info:", capturedClassInfo);
                    console.log(
                      "Setting editing message index to:",
                      messageIndexForButtons
                    );

                    // Set the global state for editing
                    console.log("Loading data into global state for editing:", {
                      capturedAttendanceData,
                      capturedClassInfo,
                      messageIndex: messageIndexForButtons,
                    });
                    setAttendanceData(capturedAttendanceData);
                    setClassInfo(capturedClassInfo);
                    setEditingMessageIndex(messageIndexForButtons);

                    // Verify the data was set
                    setTimeout(() => {
                      console.log("Global state after setting:", {
                        attendanceData: attendanceData,
                        classInfo: classInfo,
                        editingMessageIndex: editingMessageIndex,
                      });
                    }, 100);

                    // Force a re-render by updating the message to trigger edit mode
                    setChatHistory((prev) => {
                      const updatedHistory = [...prev];
                      const lastMessage =
                        updatedHistory[updatedHistory.length - 1];
                      if (lastMessage && lastMessage.type === "bot") {
                        // Mark this message as being edited
                        (lastMessage as any).isBeingEdited = true;
                        console.log(
                          "Set isBeingEdited flag to true for message:",
                          updatedHistory.length - 1
                        );
                      }
                      return updatedHistory;
                    });

                    // Add a message to indicate edit mode is active
                    setChatHistory((prev) => [
                      ...prev,
                      {
                        type: "bot",
                        text: "✅ Edit mode activated! You can now modify the attendance data in the table above. Use the Save/Cancel buttons in the table to save or discard your changes.",
                      },
                    ]);
                  },
                },
                {
                  label: "Approve",
                  action: () => {
                    console.log(
                      "🎯 Approve button clicked for text-based attendance"
                    );
                    console.log(
                      "🎯 Message index for this message:",
                      messageIndexForButtons
                    );
                    console.log("🎯 Captured data:", {
                      capturedAttendanceData: capturedAttendanceData.length,
                      capturedClassInfo: capturedClassInfo,
                    });
                    console.log("🎯 Current global state:", {
                      attendanceData: attendanceData,
                      classInfo: classInfo,
                      editingMessageIndex: editingMessageIndex,
                    });
                    // Pass the captured data as fallback parameters
                    // This ensures it works correctly even if chatHistory hasn't updated yet
                    handleTextAttendanceApproval(
                      messageIndexForButtons,
                      capturedAttendanceData,
                      capturedClassInfo
                    );
                  },
                },
                {
                  label: "Reject",
                  action: () => handleTextAttendanceRejection(),
                },
              ];
            }

            setChatHistory((prev) => [...prev, newMessage]);

            // TTS for attendance summary if voice-initiated
            try {
              if (
                attendanceVoiceInitiatedRef.current === true &&
                targetFlow === "attendance" &&
                parsedAttendanceData &&
                parsedAttendanceData.length > 0
              ) {
                const speech = generateAttendanceTTSSummary(answer, parsedAttendanceData, parsedClassInfo);
                void handlePlayTTS(-1, speech);
              }
            } catch (ttsErr) {
              console.error("TTS playback failed:", ttsErr);
            }
          } else {
            const errorMessage = data.data?.answer || "Please provide student details clearly.";
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text: errorMessage,
              },
            ]);

            // TTS for error messages if voice-initiated
            try {
              if (
                attendanceVoiceInitiatedRef.current === true &&
                targetFlow === "attendance"
              ) {
                const speech = generateAttendanceTTSSummary(errorMessage);
                void handlePlayTTS(-1, speech);
              }
            } catch (ttsErr) {
              console.error("TTS playback failed:", ttsErr);
            }
          }
        } catch (err) {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: "Sorry, there was an error processing your attendance request.",
            },
          ]);
        } finally {
          setIsProcessing(false);
        }
      }
    } else if (targetFlow === "voice_attendance") {
      // Voice-based attendance flow
      if (attendanceStep === "class_info") {
        // First step: Process voice input for class information
        try {
          const data = await aiAPI.processVoiceClassInfo({
            session_id: sessionId || userId,
            voice_text: userMessage,
          });

          if (data.status === "success" && data.data) {
            const classInfo = data.data.class_info;
            setPendingClassInfo(classInfo);
            setAttendanceStep("student_details");
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text: `✅ ${
                  data.data?.message || "Class information confirmed"
                } Now you can speak the student names and their attendance status. For example: "Aarav present, Diya absent" or "Mark all present except John".`,
              },
            ]);
          } else {
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text:
                  data.message ||
                  "Please provide class information clearly via voice.",
              },
            ]);
          }
        } catch (err) {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: "Sorry, there was an error processing your voice input. Please try again.",
            },
          ]);
        } finally {
          setIsProcessing(false);
        }
      } else if (attendanceStep === "student_details") {
        // Second step: Process voice input for student attendance
        try {
          const data = await aiAPI.processVoiceAttendance({
            session_id: sessionId || userId,
            voice_text: userMessage,
            class_info: pendingClassInfo,
          });

          if (data.status === "success" && data.data) {
            // Process the voice attendance data
            const parsedAttendanceData = data.data.attendance_summary;
            const parsedClassInfo = pendingClassInfo || data.data.class_info;

            // Create the message with attendance data
            const newMessage = {
              type: "bot" as const,
              answer: data.data.answer,
              activeTab: "answer" as const,
              attendance_summary: parsedAttendanceData,
              class_info: parsedClassInfo,
              voice_processed: data.data.voice_processed,
            };

            if (parsedAttendanceData && parsedAttendanceData.length > 0) {
              setAttendanceData(parsedAttendanceData);
              setClassInfo(parsedClassInfo);
              setAttendanceStep("completed");

              // Add buttons for voice attendance
              (newMessage as any).buttons = [
                {
                  label: "Edit Attendance",
                  action: () => {
                    setAttendanceData(parsedAttendanceData);
                    setClassInfo(parsedClassInfo);
                    setEditingMessageIndex(chatHistory.length);

                    setChatHistory((prev) => {
                      const updatedHistory = [...prev];
                      const lastMessage =
                        updatedHistory[updatedHistory.length - 1];
                      if (lastMessage && lastMessage.type === "bot") {
                        (lastMessage as any).isBeingEdited = true;
                      }
                      return updatedHistory;
                    });

                    setChatHistory((prev) => [
                      ...prev,
                      {
                        type: "bot",
                        text: "✅ Edit mode activated! You can now modify the attendance data in the table above. Use the Save/Cancel buttons in the table to save or discard your changes.",
                      },
                    ]);
                  },
                },
                {
                  label: "Approve",
                  action: () => {
                    handleVoiceAttendanceApproval(chatHistory.length);
                  },
                },
                {
                  label: "Reject",
                  action: () => handleVoiceAttendanceRejection(),
                },
              ];
            }

            setChatHistory((prev) => [...prev, newMessage]);
          } else {
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text:
                  data.message ||
                  "Please provide student attendance information clearly via voice.",
              },
            ]);
          }
        } catch (err) {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: "Sorry, there was an error processing your voice attendance request.",
            },
          ]);
        } finally {
          setIsProcessing(false);
        }
      }
    } else if (targetFlow === "leave") {
      // Leave application flow
      try {
        // Get auth token from localStorage
        const authToken = localStorage.getItem("token");
        const { academic_session, branch_token } = getErpContext();

        const data = await aiAPI.leaveChat({
          session_id: sessionId || userId,
          user_id: userId, // Pass user_id (will be mapped to employee UUID)
          query: userMessage,
          bearer_token: authToken || undefined, // Pass bearer token if available
          academic_session,
          branch_token,
        });

        if (data.status === "success" && data.data) {
          const answer = data.data.answer || "";
          const leaveData = data.data.leave_data;

          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              answer: answer,
              activeTab: "answer" as const,
            },
          ]);

          // If leave data is present, log it (you can add UI to display it)
          if (leaveData) {
            console.log("Leave application data:", leaveData);
          }

          // TTS: voice-only, strictly gated. Do NOT speak when input was typed
          // or for any other flow. This uses the leaveVoiceInitiatedRef that is set
          // only when the microphone-based submission initializes the leave flow.
          try {
            if (
              leaveVoiceInitiatedRef.current === true &&
              targetFlow === "leave"
            ) {
              // Generate concise summary for TTS instead of full message
              const speech = generateLeaveTTSSummary(answer);

              // Use the component's TTS helper to play speech. Pass a non-disruptive index.
              void handlePlayTTS(-1, speech);
            }
          } catch (ttsErr) {
            console.error("TTS playback failed:", ttsErr);
          }

          // If submission failed (error message), stay in the flow to allow retry
          if (
            answer.includes("❌") ||
            answer.includes("error") ||
            answer.includes("failed")
          ) {
            console.log(
              "⚠️ Leave submission error detected, staying in flow for retry"
            );
            // Keep the activeFlow as "leave" so the next message stays in leave flow
            setActiveFlow("leave");
          }

          // If submission succeeded (success message), exit the flow
          if (answer.includes("✅") && answer.includes("successfully")) {
            console.log("✅ Leave submitted successfully, exiting flow");
            // Clear the voice-initiated flag when leaving the flow
            leaveVoiceInitiatedRef.current = false;
            setTimeout(() => {
              setActiveFlow("none");
            }, 1000);
          }
        } else {
          const errorMessage =
            data.message ||
            "Sorry, there was an error processing your leave request.";
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: errorMessage,
            },
          ]);

          // TTS for error messages if voice-initiated
          try {
            if (
              leaveVoiceInitiatedRef.current === true &&
              targetFlow === "leave"
            ) {
              // Generate concise summary for TTS instead of full message
              const speech = generateLeaveTTSSummary(errorMessage);
              void handlePlayTTS(-1, speech);
            }
          } catch (ttsErr) {
            console.error("TTS playback failed:", ttsErr);
          }

          // Keep the leave flow active for retry
          setActiveFlow("leave");
        }
      } catch (err) {
        const errorMessage = "Sorry, there was an error processing your leave request.";
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: errorMessage,
          },
        ]);

        // TTS for error messages if voice-initiated
        try {
          if (
            leaveVoiceInitiatedRef.current === true &&
            targetFlow === "leave"
          ) {
            // Generate concise summary for TTS instead of full message
            const speech = generateLeaveTTSSummary(errorMessage);
            void handlePlayTTS(-1, speech);
          }
        } catch (ttsErr) {
          console.error("TTS playback failed:", ttsErr);
        }

        // Keep the leave flow active for retry
        setActiveFlow("leave");
      } finally {
        setIsProcessing(false);
      }
    } else if (targetFlow === "assignment") {
      // Assignment creation flow
      try {
        // Get auth token from localStorage
        const authToken = localStorage.getItem("token");
        const { academic_session, branch_token } = getErpContext();

        const data = await aiAPI.assignmentChat({
          session_id: sessionId || userId,
          user_id: userId, // Pass user_id (will be mapped to employee UUID)
          query: userMessage,
          bearer_token: authToken || undefined, // Pass bearer token if available
          academic_session,
          branch_token,
        });

        if (data.status === "success" && data.data) {
          const answer = data.data.answer || "";
          const assignmentData = data.data.assignment_data;

          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              answer: answer,
              activeTab: "answer" as const,
            },
          ]);

          // If assignment data is present, log it (you can add UI to display it)
          if (assignmentData) {
            console.log("Assignment data:", assignmentData);
          }

          // If submission failed (error message), exit the flow
          if (
            answer.includes("❌") ||
            answer.includes("error") ||
            answer.includes("failed")
          ) {
            console.log(
              "⚠️ Assignment submission error detected, exiting flow"
            );
            setActiveFlow("none");
          }

          // If submission succeeded (success message), exit the flow
          if (
            answer.includes("✅") &&
            answer.includes("successfully") &&
            answer.includes("created")
          ) {
            console.log("✅ Assignment created successfully, exiting flow");
            setTimeout(() => {
              setActiveFlow("none");
            }, 1000);
          }
        } else {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text:
                data.message ||
                "Sorry, there was an error processing your assignment request.",
            },
          ]);
        }
      } catch (err) {
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: "Sorry, there was an error processing your assignment request.",
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    } else if (targetFlow === "course_progress") {
      // Course progress flow - selection is handled via UI clicks
      // This handles text-based queries or refreshes
      try {
        if (classSections.length === 0) {
          // Fetch class sections if not already loaded
          setLoadingClassSections(true);
          const authToken = localStorage.getItem("token");
          const { academic_session, branch_token } = getErpContext();
          const response = await courseProgressAPI.fetchClassSections({
            page: 1,
            limit: 50,
            bearer_token: authToken || undefined,
            academic_session,
            branch_token,
          });

          if (
            (response.status === 200 || response.status === "success") &&
            response.data?.options
          ) {
            const options = response.data.options || [];
            setClassSections(options);
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text: `📚 Found **${options.length}** class-section(s). Please select a class and section from the list above to view course progress.`,
                classSections: options,
              },
            ]);
            // If this Course Progress request was initiated via microphone,
            // play a concise informational TTS line (plain text) and mark
            // that the course-progress flow was voice-initiated so the
            // subsequent class selection can also trigger TTS.
            try {
              if (
                isVoiceTriggeredRequestRef.current === true &&
                // Double-check flow
                targetFlow === "course_progress"
              ) {
                courseProgressVoiceInitiatedRef.current = true;
                const speech = `Found ${options.length} class-sections. Please select a class and section from the list above to view course progress.`;
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
                text:
                  response.message ||
                  "No class sections found. Please try again.",
              },
            ]);
          }
          setLoadingClassSections(false);
        } else if (selectedClassSection) {
          // If a class section is already selected, refresh the progress
          const authToken = localStorage.getItem("token");
          const { academic_session, branch_token } = getErpContext();
          const progressResponse = await courseProgressAPI.getProgress({
            classId: selectedClassSection.classId,
            sectionId: selectedClassSection.sectionId,
            bearer_token: authToken || undefined,
            academic_session,
            branch_token,
          });

          if (
            ((progressResponse.status as any) === 200 ||
              progressResponse.status === "success") &&
            progressResponse.data
          ) {
            // The API returns data.resp according to the controller
            const progressData =
              (progressResponse.data as any).resp ||
              progressResponse.data.progress ||
              progressResponse.data;
            setCourseProgressData(progressData);

            // Format a nice summary message
            const teacherDiarys =
              progressData.teacherDiarys || progressData || [];
            const totalSubjects = Array.isArray(teacherDiarys)
              ? teacherDiarys.length
              : 0;
            const summaryText =
              totalSubjects > 0
                ? `📊 **Course Progress for ${
                    selectedClassSection.className || "Class"
                  } ${
                    selectedClassSection.sectionName || "Section"
                  }**\n\nFound **${totalSubjects}** subject(s) with progress tracking. See details below.`
                : `📊 **Course Progress for ${
                    selectedClassSection.className || "Class"
                  } ${
                    selectedClassSection.sectionName || "Section"
                  }**\n\nNo progress data available yet.`;

            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text: summaryText,
                courseProgress: progressData,
                classSection: {
                  classId: selectedClassSection.classId,
                  sectionId: selectedClassSection.sectionId,
                  className: selectedClassSection.className,
                  sectionName: selectedClassSection.sectionName,
                },
              },
            ]);
          } else {
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text:
                  progressResponse.message ||
                  "Failed to fetch course progress. Please try again.",
              },
            ]);
          }
        } else {
          // Remind user to select from the list
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: "Please select a class and section from the list above to view course progress.",
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

  // Helper function to generate concise TTS summary for leave messages
  const generateLeaveTTSSummary = (answer: string): string => {
    const lowerAnswer = answer.toLowerCase();
    
    // Transport incharge alternative selection
    if (
      lowerAnswer.includes("transport vehicle incharge") ||
      lowerAnswer.includes("alternative incharge")
    ) {
      if (lowerAnswer.includes("available employees") || lowerAnswer.includes("you can select")) {
        return "You are assigned as a transport vehicle incharge so please select alternative person who can handle your duty in your absence from below";
      }
      if (lowerAnswer.includes("no suggested alternative") || lowerAnswer.includes("no alternative employees")) {
        return "You are assigned as a transport vehicle incharge but no alternative employees are available. Please contact your administrator";
      }
      return "You are assigned as a transport vehicle incharge so please select alternative person who can handle your duty in your absence";
    }
    
    // Asking for leave information
    if (
      lowerAnswer.includes("please provide") ||
      lowerAnswer.includes("missing information") ||
      lowerAnswer.includes("need") && (lowerAnswer.includes("date") || lowerAnswer.includes("leave type"))
    ) {
      if (lowerAnswer.includes("start date") || lowerAnswer.includes("end date")) {
        return "Please provide the start date and end date for your leave";
      }
      if (lowerAnswer.includes("leave type")) {
        return "Please specify the type of leave you want to apply for";
      }
      if (lowerAnswer.includes("reason") || lowerAnswer.includes("description")) {
        return "Please provide a reason or description for your leave";
      }
      return "Please provide the required leave information";
    }
    
    // Leave validation or summary
    if (
      lowerAnswer.includes("leave summary") ||
      lowerAnswer.includes("review") ||
      lowerAnswer.includes("confirm")
    ) {
      return "Please review your leave details and confirm if everything is correct";
    }
    
    // Success messages
    if (lowerAnswer.includes("successfully") && lowerAnswer.includes("submitted")) {
      return "Leave application submitted successfully. Your request has been sent for approval";
    }
    
    // Error messages
    if (lowerAnswer.includes("error") || lowerAnswer.includes("failed")) {
      if (lowerAnswer.includes("alternative incharge") || lowerAnswer.includes("transport")) {
        return "Please provide alternative transport incharge before submitting";
      }
      return "An error occurred. Please check your leave details and try again";
    }
    
    // Default: return first sentence or first 100 characters, cleaned
    const cleaned = answer
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/📝|✅|❌|⚠️|•/g, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    // Try to get first sentence
    const firstSentence = cleaned.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length < 200) {
      return firstSentence;
    }
    
    // Fallback to first 150 characters
    return cleaned.substring(0, 150).trim() + (cleaned.length > 150 ? "..." : "");
  };

  // Helper function to generate concise TTS summary for attendance messages
  const generateAttendanceTTSSummary = (answer: string, attendanceData?: any[], classInfo?: any): string => {
    const lowerAnswer = answer.toLowerCase();
    
    // Class information confirmation
    if (
      lowerAnswer.includes("class information confirmed") ||
      lowerAnswer.includes("ready to mark attendance") ||
      (lowerAnswer.includes("class") && lowerAnswer.includes("section") && lowerAnswer.includes("date"))
    ) {
      if (classInfo && classInfo.class_ && classInfo.section && classInfo.date) {
        return `Class information confirmed for Class ${classInfo.class_} ${classInfo.section} on ${classInfo.date}. Now please provide student details for attendance`;
      }
      return "Class information confirmed. Now please provide student details for attendance";
    }
    
    // Asking for class information
    if (
      lowerAnswer.includes("please provide") && 
      (lowerAnswer.includes("class") || lowerAnswer.includes("section") || lowerAnswer.includes("date"))
    ) {
      return "Please provide class information including class name, section, and date";
    }
    
    // Attendance summary/validation ready
    if (
      lowerAnswer.includes("check attendance") ||
      lowerAnswer.includes("attendance summary") ||
      (lowerAnswer.includes("student name") && lowerAnswer.includes("attendance status"))
    ) {
      if (attendanceData && attendanceData.length > 0) {
        const presentCount = attendanceData.filter((s: any) => 
          s.attendance_status?.toLowerCase().includes("present") || 
          s.attendance_status?.toLowerCase() === "p"
        ).length;
        const totalCount = attendanceData.length;
        return `Attendance summary ready. Total ${totalCount} students, ${presentCount} present. Please review and approve or reject`;
      }
      return "Attendance summary ready. Please review and approve or reject";
    }
    
    // Asking for student details
    if (
      lowerAnswer.includes("please provide student") ||
      lowerAnswer.includes("provide student details") ||
      (lowerAnswer.includes("student") && lowerAnswer.includes("attendance"))
    ) {
      return "Please provide student names and their attendance status";
    }
    
    // Success messages
    if (lowerAnswer.includes("successfully") && (lowerAnswer.includes("saved") || lowerAnswer.includes("marked"))) {
      return "Attendance marked successfully";
    }
    
    // Approval/rejection prompts
    if (lowerAnswer.includes("do you approve") || lowerAnswer.includes("approve or reject")) {
      return "Please review the attendance summary and approve or reject";
    }
    
    // Error messages
    if (lowerAnswer.includes("error") || lowerAnswer.includes("failed")) {
      return "An error occurred while processing attendance. Please try again";
    }
    
    // Default: return first sentence or first 150 characters, cleaned
    const cleaned = answer
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/📝|✅|❌|⚠️|•|🎯/g, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    // Try to get first sentence
    const firstSentence = cleaned.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length < 200) {
      return firstSentence;
    }
    
    // Fallback to first 150 characters
    return cleaned.substring(0, 150).trim() + (cleaned.length > 150 ? "..." : "");
  };

  // TTS playback function
  const handlePlayTTS = async (idx: number, text: string) => {
    setTtsLoading(idx);
    try {
      const reader = await aiAPI.textToSpeech({ text });
      if (!reader) throw new Error("No stream");
      const audioChunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (value) audioChunks.push(value);
        done = streamDone;
      }
      const audioBlob = new Blob(audioChunks as BlobPart[], {
        type: "audio/wav",
      });
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to play audio.");
    }
    setTtsLoading(null);
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
    comment?: string
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
            : msg
        )
      );
      setFeedbackComment((prev) => ({ ...prev, [idx]: "" }));
      setShowCorrectionBox(null);
    } catch (err) {
      setChatHistory((prev) =>
        prev.map((msg, i) =>
          i === idx && msg.type === "bot"
            ? { ...msg, feedbackMessage: "Failed to send feedback." }
            : msg
        )
      );
    }
  };

  // Removed unused inline editing functions - using main approval buttons instead

  const handleAttendanceDataChange = (
    index: number,
    field: string,
    value: string
  ) => {
    const updatedData = [...attendanceData];
    updatedData[index] = { ...updatedData[index], [field]: value };
    setAttendanceData(updatedData);
  };

  const handleAddStudent = () => {
    const newStudent = { student_name: "", attendance_status: "Present" };
    setAttendanceData([...attendanceData, newStudent]);
  };

  const handleRemoveStudent = (index: number) => {
    const updatedData = attendanceData.filter((_, i) => i !== index);
    setAttendanceData(updatedData);
  };

  // Handle class info modal confirmation
  const handleClassInfoConfirm = async (classInfo: {
    class_: string;
    section: string;
    date: string;
  }) => {
    if (pendingImageFile) {
      try {
        // Set the class info and move to student details step
        setPendingClassInfo(classInfo);
        setAttendanceStep("student_details");

        // Show processing indicator
        setIsProcessingImage(true);
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: "🔄 Processing image... Please wait while I extract attendance information from your image.",
            isProcessing: true,
          },
        ]);

        const result = await uploadAttendanceImage(pendingImageFile, classInfo);

        // Clear processing state
        setIsProcessingImage(false);

        // Remove the processing message
        setChatHistory((prev) =>
          prev.filter((msg) => !(msg as any).isProcessing)
        );

        if (
          result.data.attendance_summary &&
          result.data.attendance_summary.length > 0
        ) {
          // Create the message with attendance data (same as text-based)
          const newMessage = {
            type: "bot" as const,
            answer: result.message,
            references: undefined,
            mongodbquery: undefined,
            activeTab: "answer" as const,
            attendance_summary: result.data.attendance_summary,
            class_info: classInfo,
            bulkattandance: result.data.bulkattandance,
            finish_collecting: result.data.finish_collecting,
          };

          // Set global state for editing
          setAttendanceData(result.data.attendance_summary);
          setClassInfo(classInfo);
          setAttendanceStep("completed");

          // Add the same buttons as text-based attendance
          (newMessage as any).buttons = [
            {
              label: "Edit Attendance",
              action: () => {
                console.log("Edit Attendance clicked for OCR-based attendance");
                console.log(
                  "Setting attendance data:",
                  result.data.attendance_summary
                );
                console.log("Setting class info:", classInfo);
                console.log(
                  "Setting editing message index to:",
                  chatHistory.length
                );

                // Set the global state for editing
                setAttendanceData(result.data.attendance_summary);
                setClassInfo(classInfo);
                setEditingMessageIndex(chatHistory.length);

                // Force a re-render by updating the message to trigger edit mode
                setChatHistory((prev) => {
                  const updatedHistory = [...prev];
                  const lastMessage = updatedHistory[updatedHistory.length - 1];
                  if (lastMessage && lastMessage.type === "bot") {
                    // Mark this message as being edited
                    (lastMessage as any).isBeingEdited = true;
                    console.log(
                      "Set isBeingEdited flag to true for message:",
                      updatedHistory.length - 1
                    );
                  }
                  return updatedHistory;
                });

                // Add a message to indicate edit mode is active
                setChatHistory((prev) => [
                  ...prev,
                  {
                    type: "bot",
                    text: "✅ Edit mode activated! You can now modify the attendance data in the table above. Use the Save/Cancel buttons in the table to save or discard your changes.",
                  },
                ]);
              },
            },
            {
              label: "Approve",
              action: () => handleOCRApproval(), // No need to pass message index, will search automatically
            },
            {
              label: "Reject",
              action: () => handleOCRRejection(),
            },
          ];

          setChatHistory((prev) => [...prev, newMessage]);
        } else {
          // If no attendance data from image, ask for student details
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: "Image processed but no attendance data found. Please provide student details manually or try uploading a different image.",
            },
          ]);
        }
      } catch (err) {
        // Clear processing state on error
        setIsProcessingImage(false);
        setChatHistory((prev) => {
          // Remove processing message and add error message
          const filteredHistory = prev.filter(
            (msg) => !(msg as any).isProcessing
          );
          return [
            ...filteredHistory,
            {
              type: "bot",
              text: `❌ Image processing failed: ${
                (err as Error).message
              }. Please try uploading a different image or provide attendance data as text.`,
            },
          ];
        });
      }
    }

    setShowClassInfoModal(false);
    setPendingImageFile(null);
  };

  const handleClassInfoCancel = () => {
    setShowClassInfoModal(false);
    setPendingImageFile(null);
  };

  // Handle OCR approval - save to MongoDB
  const handleOCRApproval = async (
    messageIndex?: number,
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any
  ) => {
    return handleUnifiedAttendanceApproval(
      messageIndex,
      "image",
      fallbackAttendanceData,
      fallbackClassInfo
    );
  };

  // Handle OCR rejection - clear data and show upload option
  const handleOCRRejection = () => {
    console.log("OCR Rejection clicked");

    // Clear the attendance data
    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);

    // Show rejection message with upload option
    setChatHistory((prev) => [
      ...prev,
      {
        type: "bot",
        text: "❌ Attendance rejected. You can upload a new image or provide attendance data manually.",
        buttons: [
          {
            label: "Upload New Image",
            action: () => {
              // Trigger file input click
              const fileInput = document.querySelector(
                'input[type="file"]'
              ) as HTMLInputElement;
              if (fileInput) {
                fileInput.click();
              }
            },
          },
          {
            label: "Enter Manually",
            action: () => {
              // Clear the message and let user type manually
              setChatHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  text: 'Please provide attendance data manually. For example: "Mark all present for Class 4 A on 2025-02-08" or list individual students.',
                },
              ]);
            },
          },
        ],
      },
    ]);
  };

  // Unified attendance data manager
  const getAttendanceDataForApproval = (
    messageIndex?: number,
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any
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
    if (messageIndex !== undefined && messageIndex >= 0 && messageIndex < chatHistory.length) {
      const targetMessage = chatHistory[messageIndex];
      console.log(`🔍 Priority 0: Checking provided message index ${messageIndex} first (highest priority for saved/edited data):`, {
        type: targetMessage?.type,
        hasAttendanceSummary: !!targetMessage?.attendance_summary,
        attendanceSummaryLength: targetMessage?.attendance_summary?.length || 0,
        hasClassInfo: !!targetMessage?.class_info,
      });
      
      if (
        targetMessage?.type === "bot" &&
        targetMessage?.attendance_summary &&
        targetMessage.attendance_summary.length > 0
      ) {
        console.log(
          `✅ Priority 0: Found attendance data in provided message index ${messageIndex} (saved/edited data):`,
          targetMessage.attendance_summary.length,
          "records"
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
      "🔍 Priority 2: Searching for attendance data in chat history (from most recent)..."
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
          "records"
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
          (msg as any).buttons
        );
        // Try to get data from this message or use global state
        if (msg.attendance_summary && msg.attendance_summary.length > 0) {
          console.log(
            `✅ Priority 3: Using attendance data from button message ${i}:`,
            msg.attendance_summary.length,
            "records"
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
            "records"
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
    if (
      fallbackAttendanceData &&
      fallbackAttendanceData.length > 0
    ) {
      console.log(
        "✅ Priority 5: Using fallback attendance data (captured from button closure):",
        fallbackAttendanceData.length,
        "records"
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
        "pendingAttendanceData"
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
    fallbackClassInfo?: any
  ) => {
    console.log(
      `🚀 ${attendanceType.toUpperCase()} Attendance Approval clicked for message:`,
      messageIndex
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
        fallbackClassInfo
      );

      console.log(`🚀 Data to save result:`, dataToSave);

      if (!dataToSave) {
        console.error(
          `❌ No attendance data found for ${attendanceType} approval`
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
        `🎯 Date being sent to backend: '${dataToSave.classInfo?.date}'`
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
            (msg) => !(msg.text && msg.text.includes("⏳ Processing"))
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
            const speech = generateAttendanceTTSSummary("Attendance marked successfully");
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
          (msg) => !(msg.text && msg.text.includes("⏳ Processing"))
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
  const handleTextAttendanceApproval = async (
    messageIndex: number,
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any
  ) => {
    return handleUnifiedAttendanceApproval(
      messageIndex,
      "text",
      fallbackAttendanceData,
      fallbackClassInfo
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
                'input[type="file"]'
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
  const handleVoiceAttendanceApproval = async (
    messageIndex: number,
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any
  ) => {
    return handleUnifiedAttendanceApproval(
      messageIndex,
      "voice",
      fallbackAttendanceData,
      fallbackClassInfo
    );
  };

  // Handle voice-based attendance rejection - clear data and show options
  const handleVoiceAttendanceRejection = () => {
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
                'input[type="file"]'
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
        currentMessage?.attendance_summary
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
                      `| ${item.student_name} | ${item.attendance_status} |`
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
          JSON.stringify(currentAttendanceData)
        );
        sessionStorage.setItem(
          "pendingClassInfo",
          JSON.stringify(currentClassInfo)
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
              messageIndex
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
                    if (message && message.type === "bot" && message.attendance_summary) {
                      // Load the updated data from the message back into global state for editing
                      setAttendanceData(message.attendance_summary);
                      setClassInfo(message.class_info);
                      setEditingMessageIndex(messageIndex);

                      // Mark message as being edited
                      if (updatedHistory[messageIndex]) {
                        (updatedHistory[messageIndex] as any).isBeingEdited = true;
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
                      text: "✅ Edit mode activated! You can now modify the attendance data in the table above. Make your changes and click Save when done.",
                    },
                  ]);
                },
              },
              {
                label: "Approve",
                action: () => {
                  console.log("✅ Approve button clicked after save - using captured data:", {
                    capturedSavedAttendanceData: capturedSavedAttendanceData.length,
                    capturedSavedClassInfo: capturedSavedClassInfo,
                    messageIndex: messageIndex,
                  });
                  
                  // Determine attendance type based on the source (default to text)
                  let attendanceType: "text" | "image" | "voice" = "text";
                  
                  // Pass the captured edited data as fallback parameters
                  // This ensures the edited data is used even if chatHistory hasn't updated yet
                  handleUnifiedAttendanceApproval(
                    messageIndex,
                    attendanceType,
                    capturedSavedAttendanceData,
                    capturedSavedClassInfo
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

  const unlockAudioPlayback = async () => {
    try {
      // Unlock audio on browsers that require a user gesture.
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      // Play a near-silent tick to fully unlock.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.03);
      osc.onended = () => {
        try {
          void ctx.close();
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Class Info Modal */}
      <ClassInfoModal
        isOpen={showClassInfoModal}
        onClose={handleClassInfoCancel}
        onConfirm={handleClassInfoConfirm}
      />
      {selectedBot === "default" && (
      <div className="chatbot-root">
        <div className="chatbot-container">
          <ChatHeader
            selectedBot={selectedBot}
            onSelectedBotChange={setSelectedBot}
            routerMode={routerMode}
            activeFlow={activeFlow}
            onSetRoutingMode={handleSetRoutingMode}
            onSelectFlow={handleSelectFlow}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDeviceId={setSelectedDeviceId}
            languages={languages}
            selectedLanguage={selectedLanguage}
            onSelectLanguage={setSelectedLanguage}
          />
          <ChatConversation
            chatHistory={chatHistory}
            isProcessing={isProcessing}
            activeFlow={activeFlow}
            attendanceStep={attendanceStep}
            loadingClassSections={loadingClassSections}
            selectedClassSection={selectedClassSection}
            onSelectClassSection={handleSelectClassSection}
            loadingLeaveRequests={loadingLeaveRequests}
            leaveApprovalRequests={leaveApprovalRequests}
            rejectReason={rejectReason}
            onRejectReasonChange={handleRejectReasonChange}
            onApproveLeaveRequest={handleApproveLeaveRequest}
            onRejectLeaveRequest={handleRejectLeaveRequest}
            editingMessageIndex={editingMessageIndex}
            attendanceData={attendanceData}
            classInfo={classInfo}
            onAttendanceDataChange={handleAttendanceDataChange}
            onAddStudent={handleAddStudent}
            onRemoveStudent={handleRemoveStudent}
            onSaveAttendance={handleSaveAttendance}
            onCancelAttendanceEdit={handleCancelAttendanceEdit}
            ttsLoading={ttsLoading}
            onPlayTTS={handlePlayTTS}
            getThumbsUpClass={getThumbsUpClass}
            getThumbsDownClass={getThumbsDownClass}
            onSendFeedback={handleSendFeedback}
            feedbackComment={feedbackComment}
            onFeedbackCommentChange={(idx, value) =>
              setFeedbackComment((prev) => ({ ...prev, [idx]: value }))
            }
            showCorrectionBox={showCorrectionBox}
            onToggleCorrectionBox={setShowCorrectionBox}
          />

          <ChatFooter
            activeFlow={activeFlow}
            inputText={inputText}
            onInputTextChange={(value) => setInputText(value)}
            onSubmit={() => void handleSubmit()}
            isRecording={isRecording}
            onToggleMic={() =>
              void (isRecording ? stopStreaming() : startStreaming())
            }
            onFileSelected={handleFileSelected}
            onStartVoiceMode={() => {
              // Ensure bot audio can autoplay after switching modes.
              void unlockAudioPlayback();
              setSelectedBot("interview");
            }}
            onStopVoiceMode={() => {
              setSelectedBot("default");
            }}
            isVoiceMode={false}
          />
        </div>
      </div >
      )}
      {selectedBot === "interview" && (
        <InterviewBot
          userId={userId}
          roles={roles}
          email={email}
          onSelectedBotChange={setSelectedBot}
        />
      )}
    </>
  );
};

export default AudioStreamerChatBot;
