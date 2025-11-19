
import { useEffect, useRef, useState } from "react";
import { memo } from "react";
import { motion } from "framer-motion";
import {
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

// Added icons
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ClassInfoModal from "./ClassInfoModal";
import { aiAPI, userAPI, leaveApprovalAPI } from "../services/api";
// Removed separate editable component - using inline editing instead
type TabType = "answer" | "references" | "query";
type FlowType = "none" | "query" | "attendance" | "voice_attendance" | "leave" | "leave_approval"; // <-- add leave approval flow
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
    null
  );
  const [activeFlow, setActiveFlow] = useState<FlowType>("none"); // <-- add
  const [sessionId, setSessionId] = useState<string | null>(null); // <-- add
  const [attendanceData, setAttendanceData] = useState<any[]>([]); // <-- add for editable attendance
  const [attendanceStep, setAttendanceStep] = useState<
    "class_info" | "student_details" | "completed"
  >("class_info"); // <-- add for step tracking
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
  const [rejectReason, setRejectReason] = useState<{ [key: string]: string }>({}); // <-- add for reject reasons

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
          "Welcome! I'm ready to help you with queries. You can ask me anything or use the dropdown to select a specific flow.",
        activeTab: "answer" as const,
        feedback: undefined,
        references: undefined,
        mongodbquery: undefined,
      };

      setChatHistory([welcomeMessage]); // replace instead of append
      // Set default flow to query
      setActiveFlow("query");
      setUserOptionSelected(true);
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
      setInputText((prev) => prev + " " + event.data);
    };

    socket.onerror = (err) => console.error("WebSocket error:", err);
    socket.onclose = () => {
      setIsRecording(false);
      console.log("WebSocket closed");
    };
  };

  const stopStreaming = () => {
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
    handleSubmit();
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

  const handleSubmit = async () => {
    if (!inputText.trim()) return;
    const userMessage = inputText.trim();
    setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
    setInputText("");
    setIsProcessing(true);
    if (!userOptionSelected || activeFlow === "none") {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Please select an option first.",
        },
      ]);
      setIsProcessing(false);
      return;
    }

    if (activeFlow === "query") {
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
    } else if (activeFlow === "attendance") {
      // Step-by-step attendance flow
      if (attendanceStep === "class_info") {
        // First step: Collect class information
        try {
          const data = await aiAPI.chat({
            session_id: sessionId || userId,
            query: `Extract class information from: "${userMessage}". Please identify and extract:
              1. Class name/number (e.g., 6, 10, Class 6, Grade 6, Standard 6, Nursery, KG, Pre-K, LKG, UKG, etc.)
              2. Section (e.g., A, B, C, Section A, etc.) 
              3. Date (any format: 2025-01-15, 15/01/2025, Jan 15 2025, 15th January 2025, 5 August 2025, etc.)
              
              Return the information in a structured format with class_info object containing class_, section, and date fields. If any information is missing, ask for clarification.`,
          });

          if (data.status === "success" && data.data) {
            // Try to extract class info from the response
            const classInfo = data.data.class_info;
            const answer = data.data.answer || "";

            // Enhanced validation for class information
            if (
              classInfo &&
              classInfo.class_ &&
              classInfo.section &&
              classInfo.date
            ) {
              // Class info successfully extracted
              setPendingClassInfo(classInfo);
              setAttendanceStep("student_details");
              setChatHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  text: `✅ Class information confirmed: Class ${classInfo.class_} ${classInfo.section} on ${classInfo.date}. Now please provide student details for attendance. You can type the student names and their attendance status, or upload an image with the attendance list.`,
                },
              ]);
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
                setChatHistory((prev) => [
                  ...prev,
                  {
                    type: "bot",
                    text: `I need more specific class information. Please provide:\n• Class/Standard/Grade (e.g., 6, Class 6, Grade 6, Standard 6, Nursery, KG, Pre-K)\n• Section (e.g., A, B, C, Section A)\n• Date (e.g., 2025-01-15, 15/01/2025, Jan 15 2025)\n\nExamples: "Class 6 A on 2025-01-15", "Nursery B on 2025-08-14", or "Grade 10 Section B for 15th January 2025"`,
                  },
                ]);
              }
            }
          } else {
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text:
                  data.data?.answer ||
                  "Please provide class information clearly.",
              },
            ]);
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
            query: `Process and verify attendance for ${pendingClassInfo
              ? `Class ${pendingClassInfo.class_} ${pendingClassInfo.section} on ${pendingClassInfo.date}`
              : "the class"
              }: ${userMessage}. Please extract student names and attendance status, and verify the information for accuracy.`,
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
              setAttendanceData(parsedAttendanceData);
              setClassInfo(parsedClassInfo);
              setAttendanceStep("completed");

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
                      parsedAttendanceData
                    );
                    console.log("Setting class info:", parsedClassInfo);
                    console.log(
                      "Setting editing message index to:",
                      chatHistory.length
                    );

                    // Set the global state for editing
                    console.log("Loading data into global state for editing:", {
                      parsedAttendanceData,
                      parsedClassInfo,
                      messageIndex: chatHistory.length,
                    });
                    setAttendanceData(parsedAttendanceData);
                    setClassInfo(parsedClassInfo);
                    setEditingMessageIndex(chatHistory.length);

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
                      "🎯 Current chatHistory.length:",
                      chatHistory.length
                    );
                    console.log("🎯 Current global state:", {
                      attendanceData: attendanceData,
                      classInfo: classInfo,
                      editingMessageIndex: editingMessageIndex,
                    });
                    handleTextAttendanceApproval(chatHistory.length);
                  },
                },
                {
                  label: "Reject",
                  action: () => handleTextAttendanceRejection(),
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
                  data.data?.answer ||
                  "Please provide student details clearly.",
              },
            ]);
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
    } else if (activeFlow === "voice_attendance") {
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
                text: `✅ ${data.data?.message || "Class information confirmed"
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
    } else if (activeFlow === "leave") {
      // Leave application flow
      try {
        // Get auth token from localStorage
        const authToken = localStorage.getItem('token');
        
        const data = await aiAPI.leaveChat({
          session_id: sessionId || userId,
          user_id: userId,  // Pass user_id (will be mapped to employee UUID)
          query: userMessage,
          bearer_token: authToken || undefined,  // Pass bearer token if available
          academic_session: "2025-26",  // Can be made configurable
          branch_token: "demo",  // Can be made configurable
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
        } else {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: data.message || "Sorry, there was an error processing your leave request.",
            },
          ]);
        }
      } catch (err) {
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: "Sorry, there was an error processing your leave request.",
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    } else if (activeFlow === "leave_approval") {
      // Leave approval flow - only fetch if we don't have requests already
      // The fetch should happen when flow is activated from dropdown, not on every message
      if (leaveApprovalRequests.length === 0 && !loadingLeaveRequests) {
        try {
          setLoadingLeaveRequests(true);
          const authToken = localStorage.getItem('token');
          
          const response = await leaveApprovalAPI.fetchPendingRequests({
            user_id: userId,
            page: 1,
            limit: 50,
            bearer_token: authToken || undefined,
            academic_session: "2025-26",
            branch_token: "demo",
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
          const errorMessage = err.message || err.response?.data?.message || "Unknown error occurred";
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
        <div key={`answer-${messageIdx}-${answer.slice(0, 20)}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
    }
  );

  MemoizedAnswer.displayName = "MemoizedAnswer";

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
              text: `❌ Image processing failed: ${(err as Error).message
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
  const handleOCRApproval = async (messageIndex?: number) => {
    return handleUnifiedAttendanceApproval(messageIndex, "image");
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
  const getAttendanceDataForApproval = (messageIndex?: number) => {
    console.log("=== getAttendanceDataForApproval DEBUG ===");
    console.log("messageIndex:", messageIndex);
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

    // Priority 1: If we're currently editing, use the global state (edited data)
    if (editingMessageIndex !== null && attendanceData.length > 0) {
      console.log("✅ Priority 1: Using edited data from global state");
      return {
        attendanceData: attendanceData,
        classInfo: classInfo,
        source: "edited_global_state",
      };
    }

    // Priority 2: Try to find the most recent message with attendance data
    console.log(
      "🔍 Priority 2: Searching for attendance data in chat history..."
    );
    for (let i = chatHistory.length - 1; i >= 0; i--) {
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
          `✅ Found attendance data in message ${i}:`,
          msg.attendance_summary
        );
        return {
          attendanceData: msg.attendance_summary,
          classInfo: msg.class_info || classInfo,
          source: `message_${i}`,
        };
      }
    }

    // Priority 2.5: Try to find any message with buttons (attendance message)
    console.log("🔍 Priority 2.5: Searching for messages with buttons...");
    for (let i = chatHistory.length - 1; i >= 0; i--) {
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
            `✅ Using attendance data from button message ${i}:`,
            msg.attendance_summary
          );
          return {
            attendanceData: msg.attendance_summary,
            classInfo: msg.class_info || classInfo,
            source: `button_message_${i}`,
          };
        } else if (attendanceData.length > 0) {
          console.log(
            `✅ Using global state for button message ${i}:`,
            attendanceData
          );
          return {
            attendanceData: attendanceData,
            classInfo: classInfo,
            source: `button_message_global_${i}`,
          };
        }
      }
    }

    // Priority 3: Use provided message index if valid
    if (messageIndex !== undefined && messageIndex < chatHistory.length) {
      const currentMessage = chatHistory[messageIndex];
      console.log(
        `🔍 Priority 3: Checking provided message index ${messageIndex}:`,
        {
          hasAttendanceSummary: !!currentMessage?.attendance_summary,
          attendanceSummaryLength:
            currentMessage?.attendance_summary?.length || 0,
          hasClassInfo: !!currentMessage?.class_info,
        }
      );

      if (
        currentMessage?.attendance_summary &&
        currentMessage.attendance_summary.length > 0
      ) {
        console.log(
          `✅ Using provided message index ${messageIndex}:`,
          currentMessage.attendance_summary
        );
        return {
          attendanceData: currentMessage.attendance_summary,
          classInfo: currentMessage.class_info || classInfo,
          source: `provided_message_${messageIndex}`,
        };
      }
    }

    // Priority 4: Use global state as fallback
    if (attendanceData.length > 0) {
      console.log("✅ Priority 4: Using global state as fallback");
      return {
        attendanceData: attendanceData,
        classInfo: classInfo,
        source: "global_state_fallback",
      };
    }

    // Priority 5: Last resort - try to get data from session storage
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

        console.log("✅ Priority 5: Using session storage data:", {
          attendanceData: parsedAttendanceData,
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
    attendanceType: "text" | "image" | "voice" = "text"
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
      // Get attendance data using unified method
      const dataToSave = getAttendanceDataForApproval(messageIndex);

      console.log(`🚀 Data to save result:`, dataToSave);

      if (!dataToSave) {
        console.error(
          `❌ No attendance data found for ${attendanceType} approval`
        );
        setChatHistory((prev) => [
          ...prev,
          {
            type: "bot",
            text: `❌ No attendance data found. Please try ${attendanceType === "text" ? "entering" : "uploading"
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
      });
      if (data.status === "success") {
        // Remove the loading message and show success message
        setChatHistory((prev) => {
          const filtered = prev.filter(
            (msg) => !(msg.text && msg.text.includes("⏳ Processing"))
          );
          return [
            ...filtered,
            {
              type: "bot",
              text: `✅ ${attendanceType.charAt(0).toUpperCase() + attendanceType.slice(1)
                } attendance saved successfully! ${data.data?.message || "Data has been saved to MongoDB."
                }`,
              answer: data.data?.answer || data.data?.message,
            },
          ];
        });

        // Clear the editing state
        setEditingMessageIndex(null);
        setAttendanceData([]);
        setClassInfo(null);

        // Return to default query flow after completion
        setTimeout(() => {
          setActiveFlow("query");
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              text: "Attendance saved! You're now back to the default query flow. Feel free to ask me anything else.",
            },
          ]);
        }, 1000);
      } else {
        throw new Error(data.message || "Failed to save attendance");
      }
    } catch (err) {
      console.error(`Error saving ${attendanceType} attendance:`, err);
      setChatHistory((prev) => {
        const filtered = prev.filter(
          (msg) => !(msg.text && msg.text.includes("⏳ Processing"))
        );
        return [
          ...filtered,
          {
            type: "bot",
            text: `❌ Failed to save ${attendanceType} attendance: ${(err as Error).message
              }`,
          },
        ];
      });
    }
  };

  // Handle text-based attendance approval - save to MongoDB
  const handleTextAttendanceApproval = async (messageIndex: number) => {
    return handleUnifiedAttendanceApproval(messageIndex, "text");
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
  const handleVoiceAttendanceApproval = async (messageIndex: number) => {
    return handleUnifiedAttendanceApproval(messageIndex, "voice");
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
                  .join("\n")}\n\nClass: ${currentClassInfo?.class_} ${currentClassInfo?.section
                  } on ${currentClassInfo?.date}`,
              };
            }
            return msg;
          });
          return updatedHistory;
        });

        // Store in session storage for persistence
        sessionStorage.setItem(
          "pendingAttendanceData",
          JSON.stringify(currentAttendanceData)
        );
        sessionStorage.setItem(
          "pendingClassInfo",
          JSON.stringify(currentClassInfo)
        );

        // Exit edit mode
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
                  // Load the updated data from the message back into global state for editing
                  const message = chatHistory[messageIndex];
                  if (message && message.attendance_summary) {
                    setAttendanceData(message.attendance_summary);
                    setClassInfo(message.class_info);
                    setEditingMessageIndex(messageIndex);

                    // Mark message as being edited
                    setChatHistory((prev) => {
                      const updatedHistory = [...prev];
                      if (
                        updatedHistory[messageIndex] &&
                        updatedHistory[messageIndex].type === "bot"
                      ) {
                        (updatedHistory[messageIndex] as any).isBeingEdited =
                          true;
                      }
                      return updatedHistory;
                    });

                    // Add edit mode message
                    setChatHistory((prev) => [
                      ...prev,
                      {
                        type: "bot",
                        text: "✅ Edit mode activated! You can now modify the attendance data in the table above. Make your changes and click Save when done.",
                      },
                    ]);
                  }
                },
              },
              {
                label: "Approve",
                action: () => {
                  // Use unified approval handler - it will automatically detect the attendance type
                  const dataToSave = getAttendanceDataForApproval(messageIndex);
                  if (dataToSave) {
                    // Determine attendance type based on the source
                    let attendanceType: "text" | "image" | "voice" = "text";
                    if (
                      dataToSave.source.includes("image") ||
                      dataToSave.source.includes("ocr")
                    ) {
                      attendanceType = "image";
                    } else if (dataToSave.source.includes("voice")) {
                      attendanceType = "voice";
                    }
                    handleUnifiedAttendanceApproval(
                      messageIndex,
                      attendanceType
                    );
                  } else {
                    // Fallback to text-based approval
                    handleTextAttendanceApproval(messageIndex);
                  }
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
      const isInsideCorrectionBox = target.closest('.correction-box');
      
      // Check if click is on any action button (to allow toggling)
      const isActionButton = target.closest('.bot-action-btn');
      
      // If click is outside correction box and not on an action button, close it
      if (showCorrectionBox !== null && !isInsideCorrectionBox && !isActionButton) {
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
      gap: clamp(0.4rem, 1.5vw, 0.7rem);
      align-items: flex-end;
      justify-content: flex-end;
      margin-top: 1.1rem;
      margin-bottom: 0.2rem;
      position: relative;
      flex-wrap: wrap;
    }
    .bot-action-btn {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(212, 165, 116, 0.25);
      border-radius: 50%;
      width: clamp(32px, 5vw, 38px);
      height: clamp(32px, 5vw, 38px);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: clamp(0.9em, 2.5vw, 1.1em);
      transition: all 0.3s ease;
      position: relative;
      color: #8B7355;
      box-shadow: 0 2px 6px rgba(212, 165, 116, 0.15);
      padding: clamp(0.4rem, 1vw, 0.6rem);
    }
    .bot-action-btn:hover {
      background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
      color: #fff;
      border-color: #D4A574;
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 4px 12px rgba(212, 165, 116, 0.3);
    }
    .bot-action-btn.thumbs-up-active {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
      border-color: #22c55e;
    }
    .bot-action-btn.thumbs-down-active {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
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
          height: 100%;
          background: transparent;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          min-height: 100vh;
          box-sizing: border-box;
          height: 100vh;
          position: relative;
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
          gap: 0.875rem;
          align-items: center;
          margin-top: 0;
          padding: 1.25rem 1.5rem;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-top: 1px solid rgba(212, 165, 116, 0.15);
          flex-wrap: wrap;
          position: sticky;
          bottom: 0;
          z-index: 10;
          box-shadow: 0 -2px 10px rgba(212, 165, 116, 0.08);
        }
        .chatbot-input {
          flex: 1;
          min-width: 0;
          padding: 0.875rem 1.25rem;
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
          width: 48px;
          height: 48px;
          min-width: 48px;
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          cursor: pointer;
          font-size: 20px;
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
          padding: 1.25rem 1.5rem;
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
        .chatbot-header-title::before {
          content: '🤖';
          font-size: 1.5rem;
          filter: none;
          -webkit-text-fill-color: initial;
        }
        
        /* Three-dot menu styles */
        .three-dot-menu-btn {
          background: linear-gradient(135deg, #D4A574 0%, #C9A882 100%);
          border: none;
          border-radius: 12px;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(212, 165, 116, 0.25);
          transition: all 0.3s ease;
        }
        
        .three-dot-menu-btn:hover {
          box-shadow: 0 4px 16px rgba(212, 165, 116, 0.35);
          transform: translateY(-2px);
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
            padding: 0.875rem 1rem;
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
            padding: 0.875rem 0.75rem;
            gap: 0.625rem;
          }
          .chatbot-input {
            padding: 0.75rem 0.875rem;
            font-size: clamp(0.9rem, 1.9vw, 1rem);
          }
          .chatbot-btn {
            width: 40px;
            height: 40px;
            min-width: 40px;
            min-height: 40px;
            font-size: 18px;
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
            padding: 0.75rem 0.875rem;
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
            max-width: min(78vw, 500px);
            padding: 0.7rem 0.875rem;
            font-size: clamp(0.875rem, 1.8vw, 0.95rem);
          }
          .chatbot-input-area {
            padding: 0.75rem 0.625rem;
            gap: 0.5rem;
          }
          .chatbot-input {
            padding: 0.7rem 0.75rem;
            font-size: clamp(0.875rem, 1.7vw, 0.9rem);
          }
          .chatbot-btn {
            width: 38px;
            height: 38px;
            min-width: 38px;
            min-height: 38px;
            font-size: 17px;
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
            padding: 0.625rem 0.75rem;
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
            max-width: min(75vw, 450px);
            padding: 0.625rem 0.75rem;
            font-size: clamp(0.85rem, 1.6vw, 0.9rem);
          }
          .chatbot-input-area {
            padding: 0.625rem 0.5rem;
          }
          .chatbot-input {
            padding: 0.625rem 0.7rem;
            font-size: clamp(0.8rem, 1.5vw, 0.85rem);
          }
          .chatbot-btn {
            width: 36px;
            height: 36px;
            min-width: 36px;
            min-height: 36px;
            font-size: 16px;
          }
        }

        /* Touch Device Optimizations */
        @media (hover: none) and (pointer: coarse) {
          .chatbot-btn {
            min-width: 44px;
            min-height: 44px;
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
            <h1 className="chatbot-header-title">Chat with Sofisto</h1>
            <div className="relative right-12" ref={menuRef}>
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
                      setActiveFlow("query");
                      setUserOptionSelected(true);
                      setIsMenuOpen(false);
                      setChatHistory((prev) => [
                        ...prev,
                        {
                          type: "bot",
                          text: "Query flow activated. You can now ask me anything!",
                        },
                      ]);
                    }}
                  >
                    <span className="menu-option-label">Query</span>
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
                        <div style={{ marginBottom: "0.5rem", fontWeight: "600", fontSize: "0.85rem" }}>Flow Options:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <div
                            onClick={() => {
                              setActiveFlow("query");
                              setUserOptionSelected(true);
                              setIsMenuOpen(false);
                              setChatHistory(prev => [
                                ...prev,
                                { type: "bot", text: "Query flow activated. You can now ask me anything!" }
                              ]);
                            }}
                            style={{
                              opacity: activeFlow === "query" ? 1 : 0.7,
                              fontWeight: activeFlow === "query" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            {activeFlow === "query" ? "✓ " : ""}Query
                          </div>
                          <div
                            onClick={() => {
                              setActiveFlow("attendance");
                              setUserOptionSelected(true);
                              setAttendanceStep('class_info');
                              setPendingClassInfo(null);
                              setIsMenuOpen(false);
                              setChatHistory(prev => [
                                ...prev,
                                { type: "bot", text: "Attendance flow activated. First, please provide class information (class name, section, and date). For example: 'Class 6 A on 2025-01-15' or upload an image with class details." }
                              ]);
                            }}
                            style={{
                              opacity: activeFlow === "attendance" ? 1 : 0.7,
                              fontWeight: activeFlow === "attendance" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            {activeFlow === "attendance" ? "✓ " : ""}Mark Attendance (Text/Image)
                          </div>
                          <div
                            onClick={() => {
                              setActiveFlow("voice_attendance");
                              setUserOptionSelected(true);
                              setAttendanceStep('class_info');
                              setPendingClassInfo(null);
                              setIsMenuOpen(false);
                              setChatHistory(prev => [
                                ...prev,
                                { type: "bot", text: "Voice attendance flow activated! 🎤 You can now use voice commands to mark attendance. First, speak the class information (class name, section, and date), then speak the student names and their attendance status. For example: 'Class 6 A on 2025-01-15' then 'Aarav present, Diya absent'." }
                              ]);
                            }}
                            style={{
                              opacity: activeFlow === "voice_attendance" ? 1 : 0.7,
                              fontWeight: activeFlow === "voice_attendance" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            {activeFlow === "voice_attendance" ? "✓ " : ""}Mark Attendance (Voice)
                          </div>
                          <div
                            onClick={() => {
                              setActiveFlow("leave");
                              setUserOptionSelected(true);
                              setIsMenuOpen(false);
                              setChatHistory(prev => [
                                ...prev,
                                { type: "bot", text: "Leave application flow activated! 📝 Please provide your leave details. I'll help you apply for leave. You can provide information like: start date, end date, leave type, and reason. For example: 'I want to apply for leave from 2025-11-14 to 2025-11-14 for personal reasons'." }
                              ]);
                            }}
                            style={{
                              opacity: activeFlow === "leave" ? 1 : 0.7,
                              fontWeight: activeFlow === "leave" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
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
                                const authToken = localStorage.getItem('token');
                                const response = await leaveApprovalAPI.fetchPendingRequests({
                                  user_id: userId,
                                  page: 1,
                                  limit: 50,
                                  bearer_token: authToken || undefined,
                                  academic_session: "2025-26",
                                  branch_token: "demo",
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
                                console.error("Error fetching leave approval requests:", err);
                                const errorMessage = err.message || err.response?.data?.message || "Unknown error occurred";
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
                              opacity: activeFlow === "leave_approval" ? 1 : 0.7,
                              fontWeight: activeFlow === "leave_approval" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            {activeFlow === "leave_approval" ? "✓ " : ""}Leave Approval Flow
                          </div>
                          <div
                            onClick={() => {
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
                              transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
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
                        <div style={{ marginBottom: "0.5rem", fontWeight: "600", fontSize: "0.85rem" }}>Device Options:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <div
                            onClick={() => {
                              setSelectedDeviceId("default");
                              setIsMenuOpen(false);
                            }}
                            style={{
                              opacity: selectedDeviceId === "default" ? 1 : 0.7,
                              fontWeight: selectedDeviceId === "default" ? "600" : "400",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
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
                                opacity: selectedDeviceId === device.deviceId ? 1 : 0.7,
                                fontWeight: selectedDeviceId === device.deviceId ? "600" : "400",
                                cursor: "pointer",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                transition: "background 0.2s"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              {selectedDeviceId === device.deviceId ? "✓ " : ""}{device.label || `Mic (${device.deviceId.slice(-4)})`}
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
                        <div style={{ marginBottom: "0.5rem", fontWeight: "600", fontSize: "0.85rem" }}>Language Options:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          {languages.map((lang) => (
                            <div
                              key={lang.value}
                              onClick={() => {
                                setSelectedLanguage(lang.value);
                                setIsMenuOpen(false);
                              }}
                              style={{
                                opacity: selectedLanguage === lang.value ? 1 : 0.7,
                                fontWeight: selectedLanguage === lang.value ? "600" : "400",
                                cursor: "pointer",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                transition: "background 0.2s"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              {selectedLanguage === lang.value ? "✓ " : ""}{lang.label}
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
                    className={`flex items-center gap-2 ${attendanceStep === "class_info"
                      ? "text-blue-600 font-semibold"
                      : "text-gray-600 font-normal"
                      }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${attendanceStep === "class_info"
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
                    className={`flex items-center gap-2 ${attendanceStep === "student_details"
                      ? "text-blue-600 font-semibold"
                      : "text-gray-600 font-normal"
                      }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${attendanceStep === "student_details"
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
                    className={`flex items-center gap-2 ${attendanceStep === "completed"
                      ? "text-green-600 font-semibold"
                      : "text-gray-600 font-normal"
                      }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${attendanceStep === "completed"
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
                        {msg.text ? (
                          <div>{msg.text}</div>
                        ) : (
                          <>
                            {/* Only show answer, no tabs */}
                            {(() => {
                              // Always show answer content
                              return (
                                <>
                                  {/* Show leave approval requests if in leave_approval flow */}
                                  {activeFlow === "leave_approval" && idx === chatHistory.length - 1 && (
                                    <>
                                      {loadingLeaveRequests ? (
                                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                          <div className="flex items-center gap-3">
                                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-blue-900 font-medium">Loading pending leave requests...</span>
                                          </div>
                                        </div>
                                      ) : leaveApprovalRequests.length > 0 ? (
                                        <div className="mt-4 space-y-4">
                                          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                            <p className="text-sm text-blue-900 font-medium">
                                              📋 Found <strong>{leaveApprovalRequests.length}</strong> pending leave request(s). Please review and take action.
                                            </p>
                                          </div>
                                          {leaveApprovalRequests.map((request, reqIdx) => {
                                        const startDate = new Date(request.start_date).toLocaleDateString();
                                        const endDate = new Date(request.end_date).toLocaleDateString();
                                        const employeeName = request.employee?.personalInfo?.employeeName || "Unknown";
                                        const employeeId = request.employee?.personalInfo?.employeeId || "";
                                        const leaveType = request.leave_type?.name || "Unknown";
                                        const description = request.description || "No description";
                                        const photoPath = request.employee?.personalInfo?.photoDocument?.path;
                                        
                                        return (
                                          <div
                                            key={request.uuid || reqIdx}
                                            className="bg-white border border-gray-300 rounded-lg p-4 shadow-md"
                                          >
                                            <div className="flex items-start gap-4 mb-4">
                                              {photoPath && (
                                                <img
                                                  src={photoPath}
                                                  alt={employeeName}
                                                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                                                />
                                              )}
                                              <div className="flex-1">
                                                <h4 className="text-lg font-semibold text-gray-900 mb-1">
                                                  {employeeName}
                                                </h4>
                                                <p className="text-sm text-gray-600 mb-2">ID: {employeeId}</p>
                                                <div className="grid grid-cols-2 gap-2 text-sm">
                                                  <div>
                                                    <span className="font-medium text-gray-700">Leave Type:</span>{" "}
                                                    <span className="text-gray-900">{leaveType}</span>
                                                  </div>
                                                  <div>
                                                    <span className="font-medium text-gray-700">Duration:</span>{" "}
                                                    <span className="text-gray-900">
                                                      {startDate === endDate ? startDate : `${startDate} - ${endDate}`}
                                                    </span>
                                                  </div>
                                                  <div className="col-span-2">
                                                    <span className="font-medium text-gray-700">Reason:</span>{" "}
                                                    <span className="text-gray-900">{description}</span>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex gap-3 pt-4 border-t border-gray-200">
                                              <button
                                                onClick={async () => {
                                                  try {
                                                    const authToken = localStorage.getItem('token');
                                                    await leaveApprovalAPI.approve({
                                                      leave_request_uuid: request.uuid,
                                                      bearer_token: authToken || undefined,
                                                      academic_session: "2025-26",
                                                      branch_token: "demo",
                                                    });
                                                    setLeaveApprovalRequests((prev) =>
                                                      prev.filter((r) => r.uuid !== request.uuid)
                                                    );
                                                    setChatHistory((prev) => [
                                                      ...prev,
                                                      {
                                                        type: "bot",
                                                        text: `✅ Leave request for ${employeeName} has been approved successfully!`,
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
                                                }}
                                                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md font-medium hover:bg-green-600 transition-colors cursor-pointer"
                                              >
                                                ✓ Approve
                                              </button>
                                              <div className="flex-1 flex gap-2">
                                                <input
                                                  type="text"
                                                  placeholder="Rejection reason (optional)"
                                                  value={rejectReason[request.uuid] || ""}
                                                  onChange={(e) =>
                                                    setRejectReason((prev) => ({
                                                      ...prev,
                                                      [request.uuid]: e.target.value,
                                                    }))
                                                  }
                                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                                                />
                                                <button
                                                  onClick={async () => {
                                                    try {
                                                      const authToken = localStorage.getItem('token');
                                                      const reason = rejectReason[request.uuid] || "No reason provided";
                                                      await leaveApprovalAPI.reject({
                                                        leave_request_uuid: request.uuid,
                                                        reject_reason: reason,
                                                        bearer_token: authToken || undefined,
                                                        academic_session: "2025-26",
                                                        branch_token: "demo",
                                                      });
                                                      setLeaveApprovalRequests((prev) =>
                                                        prev.filter((r) => r.uuid !== request.uuid)
                                                      );
                                                      setRejectReason((prev) => {
                                                        const newReasons = { ...prev };
                                                        delete newReasons[request.uuid];
                                                        return newReasons;
                                                      });
                                                      setChatHistory((prev) => [
                                                        ...prev,
                                                        {
                                                          type: "bot",
                                                          text: `❌ Leave request for ${employeeName} has been rejected. Reason: ${reason}`,
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
                                                  }}
                                                  className="px-4 py-2 bg-red-500 text-white rounded-md font-medium hover:bg-red-600 transition-colors cursor-pointer"
                                                >
                                                  ✗ Reject
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                          })}
                                        </div>
                                      ) : (
                                        <div className="mt-4 p-6 bg-green-50 border-2 border-green-200 rounded-lg text-center">
                                          <div className="text-4xl mb-3">✅</div>
                                          <p className="text-green-900 font-semibold text-lg">
                                            No pending leave requests found!
                                          </p>
                                          <p className="text-green-700 text-sm mt-2">
                                            All leave requests have been processed or there are no pending requests at this time.
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
                                      }
                                    );
                                    return (
                                      msg.attendance_summary &&
                                      msg.attendance_summary.length > 0
                                    );
                                  })() ? (
                                    (() => {
                                      console.log(
                                        `Rendering table for message ${idx}, editingMessageIndex: ${editingMessageIndex}, isEditing: ${editingMessageIndex === idx
                                        }`
                                      );
                                      console.log(
                                        `Message ${idx} attendance_summary length:`,
                                        msg.attendance_summary?.length || 0
                                      );
                                      console.log(
                                        `Global attendanceData length:`,
                                        attendanceData.length
                                      );
                                      console.log(`Message type:`, msg.type);
                                      console.log(
                                        `Message has attendance_summary:`,
                                        !!msg.attendance_summary
                                      );

                                      // Add a simple test to see if the edit mode is detected
                                      if (editingMessageIndex === idx) {
                                        console.log(
                                          `✅ EDIT MODE DETECTED for message ${idx}!`
                                        );
                                        console.log(
                                          `✅ Table should be editable now!`
                                        );
                                        console.log(
                                          `✅ Current editingMessageIndex: ${editingMessageIndex}, Current idx: ${idx}`
                                        );
                                        console.log(
                                          `✅ Global attendanceData:`,
                                          attendanceData
                                        );
                                      } else {
                                        console.log(
                                          `❌ NOT in edit mode for message ${idx}. Expected: ${editingMessageIndex}, Got: ${idx}`
                                        );
                                        console.log(
                                          `❌ Table will NOT be editable`
                                        );
                                        console.log(
                                          `❌ Current editingMessageIndex: ${editingMessageIndex}, Current idx: ${idx}`
                                        );
                                      }

                                      return true;
                                    })() && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-4 my-4 shadow-sm">
                                        {/* Header */}
                                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-300">
                                          <div>
                                            <h3 className="text-gray-900 m-0 mb-1 text-lg font-semibold">
                                              {editingMessageIndex === idx ||
                                                (msg as any).isBeingEdited
                                                ? "✏️ Edit Attendance Summary"
                                                : "📋 Attendance Summary"}
                                            </h3>
                                            {(editingMessageIndex === idx ||
                                              (msg as any).isBeingEdited) && (
                                                <div className="bg-blue-100 text-blue-900 p-2 rounded-md text-sm mb-4 font-medium">
                                                  ✏️ Edit mode active - You can
                                                  modify student names and
                                                  attendance status below
                                                </div>
                                              )}
                                            {/* Edit Mode Buttons - Show Save/Cancel when in edit mode */}
                                            {(editingMessageIndex === idx ||
                                              (msg as any).isBeingEdited) && (
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
                                                        null
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
                                              editingMessageIndex === idx ||
                                              (msg as any).isBeingEdited;
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
                                                        "Present"
                                                    ).length
                                                  }
                                                </div>
                                                <div className="text-red-500">
                                                  <strong>Absent:</strong>{" "}
                                                  {
                                                    dataToUse.filter(
                                                      (item) =>
                                                        item.attendance_status ===
                                                        "Absent"
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
                                                  editingMessageIndex === idx ||
                                                  (msg as any).isBeingEdited;
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
                                                  }
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
                                                      className={`border-b border-gray-200 ${index % 2 === 0
                                                        ? "bg-white"
                                                        : "bg-gray-50"
                                                        }`}
                                                    >
                                                      <td className="px-3 py-3 border-r border-gray-200 text-gray-900">
                                                        {(() => {
                                                          const isEditing =
                                                            editingMessageIndex ===
                                                            idx ||
                                                            (msg as any)
                                                              .isBeingEdited;
                                                          console.log(
                                                            `Student name field for message ${idx}: isEditing=${isEditing}, editingMessageIndex=${editingMessageIndex}, idx=${idx}, isBeingEdited=${(msg as any)
                                                              .isBeingEdited
                                                            }`
                                                          );
                                                          console.log(
                                                            `Student name field - isEditing check: ${editingMessageIndex} === ${idx} = ${editingMessageIndex ===
                                                            idx
                                                            } OR isBeingEdited=${(msg as any)
                                                              .isBeingEdited
                                                            }`
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
                                                                  e.target.value
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
                                                            editingMessageIndex ===
                                                            idx ||
                                                            (msg as any)
                                                              .isBeingEdited;
                                                          console.log(
                                                            `Attendance status field for message ${idx}: isEditing=${isEditing}, editingMessageIndex=${editingMessageIndex}, isBeingEdited=${(msg as any)
                                                              .isBeingEdited
                                                            }`
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
                                                                  e.target.value
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
                                                              className={`text-sm ${item.attendance_status ===
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
                                                        {(editingMessageIndex ===
                                                          idx ||
                                                          (msg as any)
                                                            .isBeingEdited) && (
                                                            <button
                                                              onClick={() =>
                                                                handleRemoveStudent(
                                                                  index
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
                                                  )
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
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        className={getThumbsDownClass(msg)}
                                        title="Rejected"
                                        disabled={msg.feedback === "Approved"}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowCorrectionBox(showCorrectionBox === idx ? null : idx);
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
                                          <div className="correction-box" ref={correctionBoxRef}>
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
                                                  feedbackComment[idx] || ""
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
                                      }
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
                                          )
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
                          y: [0, -5, 0]
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      >
                        <SlBubbles  />
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
          <div className="chatbot-input-area p-2 sm:p-4">
            {/* Emoji Button */}
            <motion.button
              className="w-10 h-10 sm:w-12 sm:h-12 min-w-10 min-h-10 sm:min-w-12 sm:min-h-12 text-xl sm:text-2xl flex items-center justify-center rounded-full transition-all shadow-[0_2px_8px_rgba(212,165,116,0.25)] bg-gradient-to-br from-[#D4A574] to-[#C9A882] hover:scale-110 hover:shadow-[0_4px_16px_rgba(212,165,116,0.35)]"
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              title="Emoji"
            >
              😊
            </motion.button>
            {/* Single Upload for Excel and Image */}
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls,.csv,image/*"
                id="file-upload-input"
                className="hidden"
                disabled={activeFlow !== "attendance"}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && activeFlow === "attendance") {
                    try {
                      // Show upload message
                      setChatHistory((prev) => [
                        ...prev,
                        {
                          type: "user",
                          text: `Uploaded ${file.type.startsWith("image/") ? "image" : "file"
                            }: ${file.name}`,
                        },
                      ]);

                      if (file.type.startsWith("image/")) {
                        // For images, follow the same step-by-step flow as text-based attendance
                        if (attendanceStep === "class_info") {
                          // If we're in class info step, show class info modal
                          setPendingImageFile(file);
                          setShowClassInfoModal(true);
                        } else if (attendanceStep === "student_details") {
                          // If we're in student details step, process the image directly
                          if (pendingClassInfo) {
                            try {
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

                              const result = await uploadAttendanceImage(
                                file,
                                pendingClassInfo
                              );

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
                                  attendance_summary:
                                    result.data.attendance_summary,
                                  class_info: pendingClassInfo,
                                  bulkattandance: result.data.bulkattandance,
                                  finish_collecting:
                                    result.data.finish_collecting,
                                };

                                // Set global state for editing
                                setAttendanceData(
                                  result.data.attendance_summary
                                );
                                setClassInfo(pendingClassInfo);
                                setAttendanceStep("completed");

                                // Add the same buttons as text-based attendance
                                (newMessage as any).buttons = [
                                  {
                                    label: "Edit Attendance",
                                    action: () => {
                                      console.log(
                                        "Edit Attendance clicked for image-based attendance"
                                      );
                                      console.log(
                                        "Setting attendance data:",
                                        result.data.attendance_summary
                                      );
                                      console.log(
                                        "Setting class info:",
                                        pendingClassInfo
                                      );
                                      console.log(
                                        "Setting editing message index to:",
                                        chatHistory.length
                                      );

                                      // Set the global state for editing
                                      setAttendanceData(
                                        result.data.attendance_summary
                                      );
                                      setClassInfo(pendingClassInfo);
                                      setEditingMessageIndex(
                                        chatHistory.length
                                      );

                                      // Force a re-render by updating the message to trigger edit mode
                                      setChatHistory((prev) => {
                                        const updatedHistory = [...prev];
                                        const lastMessage =
                                          updatedHistory[
                                          updatedHistory.length - 1
                                          ];
                                        if (
                                          lastMessage &&
                                          lastMessage.type === "bot"
                                        ) {
                                          // Mark this message as being edited
                                          (lastMessage as any).isBeingEdited =
                                            true;
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
                            } catch (error) {
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
                                    text: `❌ Image processing failed: ${(error as Error).message
                                      }. Please try uploading a different image or provide attendance data as text.`,
                                  },
                                ];
                              });
                            }
                          }
                        }
                      } else {
                        if (attendanceStep === "class_info") {
                          setChatHistory((prev) => [
                            ...prev,
                            {
                              type: "bot",
                              text: "Please provide class information first before uploading student data files.",
                            },
                          ]);
                        } else if (attendanceStep === "student_details") {
                          const result = await uploadFile(file);
                          setChatHistory((prev) => [
                            ...prev,
                            {
                              type: "bot",
                              text:
                                result.message || "File processing completed.",
                            },
                          ]);
                        }
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
                  }
                  e.target.value = "";
                }}
              />
              <motion.label
                htmlFor={activeFlow === "attendance" ? "file-upload-input" : undefined}
                className={`chatbot-btn upload-btn w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl ${activeFlow === "attendance"
                  ? "cursor-pointer"
                  : "cursor-not-allowed"
                  }`}
                whileHover={activeFlow === "attendance" ? { scale: 1.08, y: -2 } : {}}
                whileTap={activeFlow === "attendance" ? { scale: 0.95 } : {}}
                title={activeFlow === "attendance" ? "Upload Excel or Image" : "Enable attendance flow to upload"}
                onClick={(e) => {
                  if (activeFlow !== "attendance") {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <FiUpload className="w-5 h-5 sm:w-6 sm:h-6" />
              </motion.label>
            </div>
            <input
              type="text"
              placeholder="Ask me anything!"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !isRecording && handleSubmit()
              }
              className="chatbot-input text-base sm:text-lg px-3 py-2 sm:px-4 sm:py-3 min-h-[40px] sm:min-h-[48px]"
              disabled={isRecording}
            />
            <button
              onClick={isRecording ? stopStreaming : startStreaming}
              className={`chatbot-btn mic w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl${isRecording ? " recording" : ""}`}
              title={isRecording ? "Stop Recording" : "Start Recording"}
            >
              {isRecording ? <FiMicOff /> : <FiMic />}
            </button>
            <button
              onClick={handleSubmit}
              className="chatbot-btn send w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl"
              title="Send Message"
              disabled={isRecording}
            >
              <FiSend />
            </button>
          </div>
        </div>
      </div >
    </>
  );
};

export default AudioStreamerChatBot;
