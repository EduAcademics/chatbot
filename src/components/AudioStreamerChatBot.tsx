import { useEffect, useRef, useState } from "react";
import {
  FiCopy,
  FiCpu,
  FiMaximize2,
  FiMic,
  FiMicOff,
  FiMinimize2,
  FiSend,
  FiThumbsDown,
  FiThumbsUp,
  FiUpload,
  FiUser,
  FiVolume2
} from "react-icons/fi"; // Added icons
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ClassInfoModal from "./ClassInfoModal";
// Removed separate editable component - using inline editing instead
type TabType = "answer" | "references" | "query";
type FlowType = "none" | "query" | "attendance" | "voice_attendance"; // <-- add voice attendance
const apiBase = import.meta.env.VITE_API_BASE_URL;
const wsBase = import.meta.env.VITE_WS_BASE_URL;
const AudioStreamerChatBot = ({
  darkMode,
  userId,
  roles,
  email,
}: {
  darkMode: boolean;
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

  const [isRecording, setIsRecording] = useState(false);
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
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<number | null>(null);
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
  const [attendanceStep, setAttendanceStep] = useState<'class_info' | 'student_details' | 'completed'>('class_info'); // <-- add for step tracking
  const [pendingClassInfo, setPendingClassInfo] = useState<{ class_: string; section: string; date: string } | null>(null); // <-- add for pending class info
  const [isProcessingImage, setIsProcessingImage] = useState(false); // <-- add for image processing state
  // Debug wrapper for setAttendanceData
  const setAttendanceDataDebug = (newData: any[]) => {
    console.log("setAttendanceData called with:", newData);
    console.trace("setAttendanceData call stack");
    setAttendanceData(newData);
  };
  const [classInfo, setClassInfo] = useState<any>(null); // <-- add for class info
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null); // Track which message is being edited
  const [showClassInfoModal, setShowClassInfoModal] = useState(false); // <-- add for class info modal
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null); // <-- add for pending image

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
        answer: "Welcome! I'm ready to help you with queries. You can ask me anything or use the dropdown to select a specific flow.",
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
        const resp = await fetch(`${apiBase}/v1/user/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email }), // <-- only pass email
        });
        const data = await resp.json();
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
    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", sessionId || userId);
    const resp = await fetch(`${apiBase}/v1/ai/upload-file`, {
      method: "POST",
      body: formData,
    });
    if (!resp.ok) throw new Error("Upload failed");
    return await resp.json();
  };

  // Upload attendance image through OCR processing
  const uploadAttendanceImage = async (file: File, classInfo: { class_: string; section: string; date: string }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("session_id", sessionId || userId);
      formData.append("class_", classInfo.class_);
      formData.append("section", classInfo.section);
      formData.append("date", classInfo.date);

      const resp = await fetch(`${apiBase}/v1/ai/process-attendance-image`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) throw new Error("Image processing failed");
      const result = await resp.json();

      if (result.status === "success") {
        return {
          message: result.data.message, // Use the backend message which contains the markdown table
          data: {
            attendance_summary: result.data.attendance_summary,
            class_info: result.data.class_info,
            ocr_text: result.data.ocr_text,
            bulkattandance: result.data.bulkattandance,
            finish_collecting: result.data.finish_collecting
          }
        };
      } else {
        // Handle the case where vision model is not available
        if (result.message && result.message.includes("vision-capable model")) {
          return {
            message: "Image processing is not available with the current model. Please provide attendance data as text instead.",
            data: {
              attendance_summary: [],
              class_info: classInfo,
              ocr_text: "",
              bulkattandance: false,
              finish_collecting: false,
              fallback_message: "Please type the attendance data directly. For example: 'Mark all present for Class 6 A on 2025-10-08' or list individual students."
            }
          };
        }
        throw new Error(result.message || "Image processing failed");
      }
    } catch (err) {
      console.error("Error processing attendance image:", err);
      // Provide helpful fallback message
      return {
        message: "Image processing failed. Please provide attendance data as text instead.",
        data: {
          attendance_summary: [],
          class_info: classInfo,
          ocr_text: "",
          bulkattandance: false,
          finish_collecting: false,
          fallback_message: "You can type the attendance data directly. For example: 'Mark all present for Class 6 A on 2025-10-08' or list individual students."
        }
      };
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim()) return;
    const userMessage = inputText.trim();
    setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
    setInputText("");

    if (!userOptionSelected || activeFlow === "none") {
      setChatHistory((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Please select an option first.",
        },
      ]);
      return;
    }

    if (activeFlow === "query") {
      // Query handler API
      try {
        const resp = await fetch(`${apiBase}/v1/ai/query-handler`, {
          method: "POST",
          headers: {
            "x-academic-session": "2025-26",
            "x-branch-token": "indp",
            Authorization: "Bearer <your-token>",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            user_roles: roles,
            query: userMessage,
          }),
        });
        const data = await resp.json();
        if (data.status === "success" && data.data) {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "bot",
              answer: data.data.answer,
              references: data.data.references,
              mongodbquery: data.data.mongodbquery,
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
      }
    } else if (activeFlow === "attendance") {
      // Step-by-step attendance flow
      if (attendanceStep === 'class_info') {
        // First step: Collect class information
        try {
          const resp = await fetch(`${apiBase}/v1/ai/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: sessionId || userId,
              query: `Extract class information from: "${userMessage}". Please identify and extract:
              1. Class name/number (e.g., 6, 10, Class 6, Grade 6, Standard 6, Nursery, KG, Pre-K, LKG, UKG, etc.)
              2. Section (e.g., A, B, C, Section A, etc.) 
              3. Date (any format: 2025-01-15, 15/01/2025, Jan 15 2025, 15th January 2025, 5 August 2025, etc.)
              
              Return the information in a structured format with class_info object containing class_, section, and date fields. If any information is missing, ask for clarification.`,
            }),
          });

          const data = await resp.json();

          if (data.status === "success" && data.data) {
            // Try to extract class info from the response
            const classInfo = data.data.class_info;
            const answer = data.data.answer || '';

            // Enhanced validation for class information
            if (classInfo && classInfo.class_ && classInfo.section && classInfo.date) {
              // Class info successfully extracted
              setPendingClassInfo(classInfo);
              setAttendanceStep('student_details');
              setChatHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  text: `✅ Class information confirmed: Class ${classInfo.class_} ${classInfo.section} on ${classInfo.date}. Now please provide student details for attendance. You can type the student names and their attendance status, or upload an image with the attendance list.`
                }
              ]);
            } else {
              // Enhanced parsing from the answer text if structured data is not available
              // Try multiple patterns to extract class information
              let classMatch = answer.match(/class[:\s]*(\w+)/i);
              let sectionMatch = answer.match(/section[:\s]*(\w+)/i);
              let dateMatch = answer.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);

              // If no matches from answer, try parsing from user message directly
              if (!classMatch || !sectionMatch || !dateMatch) {
                // Try to parse from the original user message

                // Enhanced class pattern matching - handle various formats
                classMatch = userMessage.match(/(?:class|grade|standard|nursery|kg|pre-k|prek|lkg|ukg)[:\s]*(\w+)/i) ||
                  userMessage.match(/(\w+)\s+(?:class|grade|standard)/i) ||
                  userMessage.match(/(nursery|kg|pre-k|prek|lkg|ukg)/i) ||
                  userMessage.match(/class\s+(\w+)/i) ||
                  userMessage.match(/mark\s+attendance\s+for\s+class\s+(\w+)/i);

                // Enhanced section pattern matching - handle various formats
                sectionMatch = userMessage.match(/(?:section|sec)[:\s]*(\w+)/i) ||
                  userMessage.match(/(\w+)\s+(?:section|sec)/i) ||
                  userMessage.match(/\b([a-z])\b/i) ||
                  userMessage.match(/class\s+\w+\s+(\w+)/i) ||
                  userMessage.match(/nursery\s+(\w+)/i) ||
                  userMessage.match(/for\s+(\w+)/i);

                // Enhanced date pattern matching - handle various formats
                dateMatch = userMessage.match(/(\d{4}-\d{2}-\d{2})/i) ||
                  userMessage.match(/(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
                  userMessage.match(/(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i) ||
                  userMessage.match(/(\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})/i) ||
                  userMessage.match(/(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i);
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
                  /mark\s+attendance\s+for\s+class\s+(\w+)\s+(\w+)\s+for\s+(\d{1,2}\s+\w+\s+\d{4})/i
                ];

                for (const pattern of specificPatterns) {
                  const match = userMessage.match(pattern);
                  if (match) {
                    classMatch = { 1: match[1] };
                    sectionMatch = { 1: match[2] };
                    dateMatch = { 1: match[3] };
                    break;
                  }
                }
              }

              if (classMatch && sectionMatch && dateMatch) {
                const extractedClassInfo = {
                  class_: classMatch[1].toUpperCase(),
                  section: sectionMatch[1].toUpperCase(),
                  date: dateMatch[1]
                };

                console.log("🎯 Extracted class info:", extractedClassInfo);
                console.log("🎯 Date match result:", dateMatch[1]);
                setPendingClassInfo(extractedClassInfo);
                setAttendanceStep('student_details');
                setChatHistory((prev) => [
                  ...prev,
                  {
                    type: "bot",
                    text: `✅ Class information confirmed: Class ${extractedClassInfo.class_} ${extractedClassInfo.section} on ${extractedClassInfo.date}. Now please provide student details for attendance.`
                  }
                ]);
              } else {
                // Ask for clarification with more specific examples including nursery
                setChatHistory((prev) => [
                  ...prev,
                  {
                    type: "bot",
                    text: `I need more specific class information. Please provide:\n• Class/Standard/Grade (e.g., 6, Class 6, Grade 6, Standard 6, Nursery, KG, Pre-K)\n• Section (e.g., A, B, C, Section A)\n• Date (e.g., 2025-01-15, 15/01/2025, Jan 15 2025)\n\nExamples: "Class 6 A on 2025-01-15", "Nursery B on 2025-08-14", or "Grade 10 Section B for 15th January 2025"`
                  }
                ]);
              }
            }
          } else {
            setChatHistory((prev) => [
              ...prev,
              { type: "bot", text: data.data?.answer || "Please provide class information clearly." }
            ]);
          }
        } catch (err) {
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: "Sorry, there was an error processing your request. Please try again." }
          ]);
        }
      } else if (attendanceStep === 'student_details') {
        // Second step: Collect student details
        try {
          const resp = await fetch(`${apiBase}/v1/ai/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: sessionId || userId,
              query: `Process and verify attendance for ${pendingClassInfo ? `Class ${pendingClassInfo.class_} ${pendingClassInfo.section} on ${pendingClassInfo.date}` : 'the class'}: ${userMessage}. Please extract student names and attendance status, and verify the information for accuracy.`,
            }),
          });

          const data = await resp.json();

          if (data.status === "success" && data.data) {
            // Process the attendance data
            let parsedAttendanceData = data.data.attendance_summary;
            let parsedClassInfo = pendingClassInfo || data.data.class_info;

            // Parse markdown table if present
            const answer = data.data.answer || '';
            if (answer.includes('| Student Name |') && answer.includes('| Attendance Status |')) {
              const lines = answer.split('\n');
              const tableStartIndex = lines.findIndex((line: string) => line.includes('| Student Name |'));
              if (tableStartIndex !== -1) {
                const tableLines = lines.slice(tableStartIndex + 2);
                const extractedData = [];

                for (const line of tableLines) {
                  if (line.includes('|') && !line.includes('---')) {
                    const cells = line.split('|').map((cell: string) => cell.trim()).filter((cell: string) => cell);
                    if (cells.length >= 2) {
                      extractedData.push({
                        student_name: cells[0],
                        attendance_status: cells[1]
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
              answer: data.data.answer,
              references: data.data.references,
              mongodbquery: data.data.mongodbquery,
              activeTab: "answer" as const,
              attendance_summary: parsedAttendanceData,
              class_info: parsedClassInfo,
              bulkattandance: data.data.bulkattandance,
              finish_collecting: data.data.finish_collecting
            };

            console.log("Creating new message with attendance data:", {
              attendance_summary: parsedAttendanceData,
              class_info: parsedClassInfo,
              messageType: newMessage.type
            });

            if (parsedAttendanceData && parsedAttendanceData.length > 0) {
              console.log("🎯 Setting global state for text-based attendance:", {
                parsedAttendanceData: parsedAttendanceData,
                parsedClassInfo: parsedClassInfo,
                dataLength: parsedAttendanceData.length
              });
              setAttendanceData(parsedAttendanceData);
              setClassInfo(parsedClassInfo);
              setAttendanceStep('completed');

              // Add the specific buttons as requested (initial state: read-only mode)
              (newMessage as any).buttons = [
                {
                  label: "Edit Attendance",
                  action: () => {
                    console.log("Edit Attendance clicked for text-based attendance");
                    console.log("Setting attendance data:", parsedAttendanceData);
                    console.log("Setting class info:", parsedClassInfo);
                    console.log("Setting editing message index to:", chatHistory.length);

                    // Set the global state for editing
                    console.log("Loading data into global state for editing:", {
                      parsedAttendanceData,
                      parsedClassInfo,
                      messageIndex: chatHistory.length
                    });
                    setAttendanceData(parsedAttendanceData);
                    setClassInfo(parsedClassInfo);
                    setEditingMessageIndex(chatHistory.length);

                    // Verify the data was set
                    setTimeout(() => {
                      console.log("Global state after setting:", {
                        attendanceData: attendanceData,
                        classInfo: classInfo,
                        editingMessageIndex: editingMessageIndex
                      });
                    }, 100);

                    // Force a re-render by updating the message to trigger edit mode
                    setChatHistory(prev => {
                      const updatedHistory = [...prev];
                      const lastMessage = updatedHistory[updatedHistory.length - 1];
                      if (lastMessage && lastMessage.type === 'bot') {
                        // Mark this message as being edited
                        (lastMessage as any).isBeingEdited = true;
                        console.log("Set isBeingEdited flag to true for message:", updatedHistory.length - 1);
                      }
                      return updatedHistory;
                    });

                    // Add a message to indicate edit mode is active
                    setChatHistory(prev => [
                      ...prev,
                      {
                        type: 'bot',
                        text: '✅ Edit mode activated! You can now modify the attendance data in the table above. Use the Save/Cancel buttons in the table to save or discard your changes.'
                      }
                    ]);
                  }
                },
                {
                  label: "Approve",
                  action: () => {
                    console.log("🎯 Approve button clicked for text-based attendance");
                    console.log("🎯 Current chatHistory.length:", chatHistory.length);
                    console.log("🎯 Current global state:", {
                      attendanceData: attendanceData,
                      classInfo: classInfo,
                      editingMessageIndex: editingMessageIndex
                    });
                    handleTextAttendanceApproval(chatHistory.length);
                  }
                },
                {
                  label: "Reject",
                  action: () => handleTextAttendanceRejection()
                }
              ];
            }

            setChatHistory((prev) => [...prev, newMessage]);
          } else {
            setChatHistory((prev) => [
              ...prev,
              { type: "bot", text: data.data?.answer || "Please provide student details clearly." }
            ]);
          }
        } catch (err) {
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: "Sorry, there was an error processing your attendance request." }
          ]);
        }
      }
    } else if (activeFlow === "voice_attendance") {
      // Voice-based attendance flow
      if (attendanceStep === 'class_info') {
        // First step: Process voice input for class information
        try {
          const resp = await fetch(`${apiBase}/v1/ai/process-voice-class-info`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: sessionId || userId,
              voice_text: userMessage,
            }),
          });

          const data = await resp.json();

          if (data.status === "success" && data.data) {
            const classInfo = data.data.class_info;
            setPendingClassInfo(classInfo);
            setAttendanceStep('student_details');
            setChatHistory((prev) => [
              ...prev,
              {
                type: "bot",
                text: `✅ ${data.data.message} Now you can speak the student names and their attendance status. For example: "Aarav present, Diya absent" or "Mark all present except John".`
              }
            ]);
          } else {
            setChatHistory((prev) => [
              ...prev,
              { type: "bot", text: data.message || "Please provide class information clearly via voice." }
            ]);
          }
        } catch (err) {
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: "Sorry, there was an error processing your voice input. Please try again." }
          ]);
        }
      } else if (attendanceStep === 'student_details') {
        // Second step: Process voice input for student attendance
        try {
          const resp = await fetch(`${apiBase}/v1/ai/process-voice-attendance`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: sessionId || userId,
              voice_text: userMessage,
              class_info: pendingClassInfo,
            }),
          });

          const data = await resp.json();

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
              setAttendanceStep('completed');

              // Add buttons for voice attendance
              (newMessage as any).buttons = [
                {
                  label: "Edit Attendance",
                  action: () => {
                    setAttendanceData(parsedAttendanceData);
                    setClassInfo(parsedClassInfo);
                    setEditingMessageIndex(chatHistory.length);

                    setChatHistory(prev => {
                      const updatedHistory = [...prev];
                      const lastMessage = updatedHistory[updatedHistory.length - 1];
                      if (lastMessage && lastMessage.type === 'bot') {
                        (lastMessage as any).isBeingEdited = true;
                      }
                      return updatedHistory;
                    });

                    setChatHistory(prev => [
                      ...prev,
                      {
                        type: 'bot',
                        text: '✅ Edit mode activated! You can now modify the attendance data in the table above. Use the Save/Cancel buttons in the table to save or discard your changes.'
                      }
                    ]);
                  }
                },
                {
                  label: "Approve",
                  action: () => {
                    handleVoiceAttendanceApproval(chatHistory.length);
                  }
                },
                {
                  label: "Reject",
                  action: () => handleVoiceAttendanceRejection()
                }
              ];
            }

            setChatHistory((prev) => [...prev, newMessage]);
          } else {
            setChatHistory((prev) => [
              ...prev,
              { type: "bot", text: data.message || "Please provide student attendance information clearly via voice." }
            ]);
          }
        } catch (err) {
          setChatHistory((prev) => [
            ...prev,
            { type: "bot", text: "Sorry, there was an error processing your voice attendance request." }
          ]);
        }
      }
    }
  };

  const handleTabChange = (messageIndex: number, tab: TabType) => {
    setChatHistory((prev) =>
      prev.map((msg, idx) =>
        idx === messageIndex ? { ...msg, activeTab: tab } : msg
      )
    );
  };

  const handleCopyQuery = (idx: number, query: string[]) => {
    navigator.clipboard.writeText(query.join("\n"));
    setCopiedQuery(idx);
    setTimeout(() => setCopiedQuery(null), 2000);
  };

  // TTS playback function
  const handlePlayTTS = async (idx: number, text: string) => {
    setTtsLoading(idx);
    try {
      const resp = await fetch(`${apiBase}/v1/ai/text-to-speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) throw new Error("TTS failed");
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream");
      const audioChunks: BlobPart[] = [];
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (value) audioChunks.push(value);
        done = streamDone;
      }
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
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
      const resp = await fetch(`${apiBase}/v1/ai/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_index: idx,
          feedback: type,
          comment: feedbackCommentValue,
        }),
      });
      const data = await resp.json();
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

  const handleAttendanceDataChange = (index: number, field: string, value: string) => {
    const updatedData = [...attendanceData];
    updatedData[index] = { ...updatedData[index], [field]: value };
    setAttendanceData(updatedData);
  };

  const handleAddStudent = () => {
    const newStudent = { student_name: '', attendance_status: 'Present' };
    setAttendanceData([...attendanceData, newStudent]);
  };

  const handleRemoveStudent = (index: number) => {
    const updatedData = attendanceData.filter((_, i) => i !== index);
    setAttendanceData(updatedData);
  };

  // Handle class info modal confirmation
  const handleClassInfoConfirm = async (classInfo: { class_: string; section: string; date: string }) => {
    if (pendingImageFile) {
      try {
        // Set the class info and move to student details step
        setPendingClassInfo(classInfo);
        setAttendanceStep('student_details');

        // Show processing indicator
        setIsProcessingImage(true);
        setChatHistory(prev => [
          ...prev,
          {
            type: 'bot',
            text: '🔄 Processing image... Please wait while I extract attendance information from your image.',
            isProcessing: true
          }
        ]);

        const result = await uploadAttendanceImage(pendingImageFile, classInfo);

        // Clear processing state
        setIsProcessingImage(false);

        // Remove the processing message
        setChatHistory(prev => prev.filter(msg => !(msg as any).isProcessing));

        if (result.data.attendance_summary && result.data.attendance_summary.length > 0) {
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
            finish_collecting: result.data.finish_collecting
          };

          // Set global state for editing
          setAttendanceData(result.data.attendance_summary);
          setClassInfo(classInfo);
          setAttendanceStep('completed');

          // Add the same buttons as text-based attendance
          (newMessage as any).buttons = [
            {
              label: "Edit Attendance",
              action: () => {
                console.log("Edit Attendance clicked for OCR-based attendance");
                console.log("Setting attendance data:", result.data.attendance_summary);
                console.log("Setting class info:", classInfo);
                console.log("Setting editing message index to:", chatHistory.length);

                // Set the global state for editing
                setAttendanceData(result.data.attendance_summary);
                setClassInfo(classInfo);
                setEditingMessageIndex(chatHistory.length);

                // Force a re-render by updating the message to trigger edit mode
                setChatHistory(prev => {
                  const updatedHistory = [...prev];
                  const lastMessage = updatedHistory[updatedHistory.length - 1];
                  if (lastMessage && lastMessage.type === 'bot') {
                    // Mark this message as being edited
                    (lastMessage as any).isBeingEdited = true;
                    console.log("Set isBeingEdited flag to true for message:", updatedHistory.length - 1);
                  }
                  return updatedHistory;
                });

                // Add a message to indicate edit mode is active
                setChatHistory(prev => [
                  ...prev,
                  {
                    type: 'bot',
                    text: '✅ Edit mode activated! You can now modify the attendance data in the table above. Use the Save/Cancel buttons in the table to save or discard your changes.'
                  }
                ]);
              }
            },
            {
              label: "Approve",
              action: () => handleOCRApproval() // No need to pass message index, will search automatically
            },
            {
              label: "Reject",
              action: () => handleOCRRejection()
            }
          ];

          setChatHistory((prev) => [...prev, newMessage]);
        } else {
          // If no attendance data from image, ask for student details
          setChatHistory(prev => [
            ...prev,
            {
              type: 'bot',
              text: 'Image processed but no attendance data found. Please provide student details manually or try uploading a different image.'
            }
          ]);
        }
      } catch (err) {
        // Clear processing state on error
        setIsProcessingImage(false);
        setChatHistory(prev => {
          // Remove processing message and add error message
          const filteredHistory = prev.filter(msg => !(msg as any).isProcessing);
          return [
            ...filteredHistory,
            {
              type: 'bot',
              text: `❌ Image processing failed: ${(err as Error).message}. Please try uploading a different image or provide attendance data as text.`
            }
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
    return handleUnifiedAttendanceApproval(messageIndex, 'image');
  };


  // Handle OCR rejection - clear data and show upload option
  const handleOCRRejection = () => {
    console.log("OCR Rejection clicked");

    // Clear the attendance data
    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);

    // Show rejection message with upload option
    setChatHistory(prev => [
      ...prev,
      {
        type: 'bot',
        text: '❌ Attendance rejected. You can upload a new image or provide attendance data manually.',
        buttons: [
          {
            label: "Upload New Image",
            action: () => {
              // Trigger file input click
              const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
              if (fileInput) {
                fileInput.click();
              }
            }
          },
          {
            label: "Enter Manually",
            action: () => {
              // Clear the message and let user type manually
              setChatHistory(prev => [
                ...prev,
                { type: 'bot', text: 'Please provide attendance data manually. For example: "Mark all present for Class 4 A on 2025-02-08" or list individual students.' }
              ]);
            }
          }
        ]
      }
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
        hasButtons: !!(msg as any).buttons
      });
    });

    // Priority 1: If we're currently editing, use the global state (edited data)
    if (editingMessageIndex !== null && attendanceData.length > 0) {
      console.log("✅ Priority 1: Using edited data from global state");
      return {
        attendanceData: attendanceData,
        classInfo: classInfo,
        source: 'edited_global_state'
      };
    }

    // Priority 2: Try to find the most recent message with attendance data
    console.log("🔍 Priority 2: Searching for attendance data in chat history...");
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msg = chatHistory[i];
      console.log(`Checking message ${i}:`, {
        type: msg.type,
        hasAttendanceSummary: !!msg.attendance_summary,
        attendanceSummaryLength: msg.attendance_summary?.length || 0,
        hasClassInfo: !!msg.class_info,
        classInfo: msg.class_info,
        hasButtons: !!(msg as any).buttons
      });

      if (msg.type === 'bot' && msg.attendance_summary && msg.attendance_summary.length > 0) {
        console.log(`✅ Found attendance data in message ${i}:`, msg.attendance_summary);
        return {
          attendanceData: msg.attendance_summary,
          classInfo: msg.class_info || classInfo,
          source: `message_${i}`
        };
      }
    }

    // Priority 2.5: Try to find any message with buttons (attendance message)
    console.log("🔍 Priority 2.5: Searching for messages with buttons...");
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msg = chatHistory[i];
      if (msg.type === 'bot' && (msg as any).buttons && (msg as any).buttons.length > 0) {
        console.log(`Found message with buttons at index ${i}:`, (msg as any).buttons);
        // Try to get data from this message or use global state
        if (msg.attendance_summary && msg.attendance_summary.length > 0) {
          console.log(`✅ Using attendance data from button message ${i}:`, msg.attendance_summary);
          return {
            attendanceData: msg.attendance_summary,
            classInfo: msg.class_info || classInfo,
            source: `button_message_${i}`
          };
        } else if (attendanceData.length > 0) {
          console.log(`✅ Using global state for button message ${i}:`, attendanceData);
          return {
            attendanceData: attendanceData,
            classInfo: classInfo,
            source: `button_message_global_${i}`
          };
        }
      }
    }

    // Priority 3: Use provided message index if valid
    if (messageIndex !== undefined && messageIndex < chatHistory.length) {
      const currentMessage = chatHistory[messageIndex];
      console.log(`🔍 Priority 3: Checking provided message index ${messageIndex}:`, {
        hasAttendanceSummary: !!currentMessage?.attendance_summary,
        attendanceSummaryLength: currentMessage?.attendance_summary?.length || 0,
        hasClassInfo: !!currentMessage?.class_info
      });

      if (currentMessage?.attendance_summary && currentMessage.attendance_summary.length > 0) {
        console.log(`✅ Using provided message index ${messageIndex}:`, currentMessage.attendance_summary);
        return {
          attendanceData: currentMessage.attendance_summary,
          classInfo: currentMessage.class_info || classInfo,
          source: `provided_message_${messageIndex}`
        };
      }
    }

    // Priority 4: Use global state as fallback
    if (attendanceData.length > 0) {
      console.log("✅ Priority 4: Using global state as fallback");
      return {
        attendanceData: attendanceData,
        classInfo: classInfo,
        source: 'global_state_fallback'
      };
    }

    // Priority 5: Last resort - try to get data from session storage
    try {
      const sessionAttendanceData = sessionStorage.getItem('pendingAttendanceData');
      const sessionClassInfo = sessionStorage.getItem('pendingClassInfo');

      if (sessionAttendanceData) {
        const parsedAttendanceData = JSON.parse(sessionAttendanceData);
        const parsedClassInfo = sessionClassInfo ? JSON.parse(sessionClassInfo) : null;

        console.log("✅ Priority 5: Using session storage data:", {
          attendanceData: parsedAttendanceData,
          classInfo: parsedClassInfo
        });

        return {
          attendanceData: parsedAttendanceData,
          classInfo: parsedClassInfo,
          source: 'session_storage'
        };
      }
    } catch (err) {
      console.log("Error reading from session storage:", err);
    }

    console.log("❌ No attendance data found in any priority");
    return null;
  };

  // Unified attendance approval handler
  const handleUnifiedAttendanceApproval = async (messageIndex?: number, attendanceType: 'text' | 'image' | 'voice' = 'text') => {
    console.log(`🚀 ${attendanceType.toUpperCase()} Attendance Approval clicked for message:`, messageIndex);
    console.log(`🚀 Current global state:`, {
      attendanceData: attendanceData,
      attendanceDataLength: attendanceData.length,
      classInfo: classInfo,
      editingMessageIndex: editingMessageIndex,
      chatHistoryLength: chatHistory.length
    });

    // Add loading state to prevent multiple clicks
    setChatHistory(prev => [
      ...prev,
      { type: 'bot', text: `⏳ Processing ${attendanceType} attendance approval...` }
    ]);

    try {
      // Get attendance data using unified method
      const dataToSave = getAttendanceDataForApproval(messageIndex);

      console.log(`🚀 Data to save result:`, dataToSave);

      if (!dataToSave) {
        console.error(`❌ No attendance data found for ${attendanceType} approval`);
        setChatHistory(prev => [
          ...prev,
          { type: 'bot', text: `❌ No attendance data found. Please try ${attendanceType === 'text' ? 'entering' : 'uploading'} the attendance information again.` }
        ]);
        return;
      }

      console.log(`Sending ${attendanceType} attendance data to backend:`, {
        attendanceData: dataToSave.attendanceData,
        classInfo: dataToSave.classInfo,
        source: dataToSave.source,
        dataLength: dataToSave.attendanceData.length
      });

      console.log(`🎯 Date being sent to backend: '${dataToSave.classInfo?.date}'`);

      // Send approval message to backend with the current data
      const resp = await fetch(`${apiBase}/v1/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId || userId,
          query: `approve_attendance: ${JSON.stringify({
            attendance_summary: dataToSave.attendanceData,
            class_info: dataToSave.classInfo
          })}`, // Send the current attendance data
        }),
      });

      const data = await resp.json();
      if (data.status === "success") {
        // Remove the loading message and show success message
        setChatHistory(prev => {
          const filtered = prev.filter(msg => !(msg.text && msg.text.includes('⏳ Processing')));
          return [
            ...filtered,
            {
              type: 'bot',
              text: `✅ ${attendanceType.charAt(0).toUpperCase() + attendanceType.slice(1)} attendance saved successfully! ${data.data?.message || 'Data has been saved to MongoDB.'}`,
              answer: data.data?.answer || data.data?.message
            }
          ];
        });

        // Clear the editing state
        setEditingMessageIndex(null);
        setAttendanceData([]);
        setClassInfo(null);

        // Return to default query flow after completion
        setTimeout(() => {
          setActiveFlow("query");
          setChatHistory(prev => [
            ...prev,
            { type: "bot", text: "Attendance saved! You're now back to the default query flow. Feel free to ask me anything else." }
          ]);
        }, 1000);
      } else {
        throw new Error(data.message || "Failed to save attendance");
      }
    } catch (err) {
      console.error(`Error saving ${attendanceType} attendance:`, err);
      setChatHistory(prev => {
        const filtered = prev.filter(msg => !(msg.text && msg.text.includes('⏳ Processing')));
        return [
          ...filtered,
          { type: 'bot', text: `❌ Failed to save ${attendanceType} attendance: ${(err as Error).message}` }
        ];
      });
    }
  };

  // Handle text-based attendance approval - save to MongoDB
  const handleTextAttendanceApproval = async (messageIndex: number) => {
    return handleUnifiedAttendanceApproval(messageIndex, 'text');
  };

  // Handle text-based attendance rejection - clear data and show options
  const handleTextAttendanceRejection = () => {
    console.log("Text Attendance Rejection clicked");

    // Clear the attendance data
    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);

    // Show rejection message with options
    setChatHistory(prev => [
      ...prev,
      {
        type: 'bot',
        text: '❌ Attendance rejected. You can provide new attendance data or try a different approach.',
        buttons: [
          {
            label: "Try Again",
            action: () => {
              // Clear the message and let user type manually
              setChatHistory(prev => [
                ...prev,
                { type: 'bot', text: 'Please provide attendance data again. For example: "Mark all present for Class 6 A on 2025-10-08" or list individual students.' }
              ]);
            }
          },
          {
            label: "Upload Image",
            action: () => {
              // Trigger file input click
              const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
              if (fileInput) {
                fileInput.click();
              }
            }
          }
        ]
      }
    ]);
  };

  // Handle voice-based attendance approval - save to MongoDB
  const handleVoiceAttendanceApproval = async (messageIndex: number) => {
    return handleUnifiedAttendanceApproval(messageIndex, 'voice');
  };

  // Handle voice-based attendance rejection - clear data and show options
  const handleVoiceAttendanceRejection = () => {
    console.log("Voice Attendance Rejection clicked");

    // Clear the attendance data
    setAttendanceData([]);
    setClassInfo(null);
    setEditingMessageIndex(null);

    // Show rejection message with options
    setChatHistory(prev => [
      ...prev,
      {
        type: 'bot',
        text: '❌ Voice attendance rejected. You can provide new attendance data via voice or try a different approach.',
        buttons: [
          {
            label: "Try Voice Again",
            action: () => {
              setChatHistory(prev => [
                ...prev,
                { type: 'bot', text: 'Please speak the attendance data again. For example: "Aarav present, Diya absent" or "Mark all present except John".' }
              ]);
            }
          },
          {
            label: "Switch to Text",
            action: () => {
              setActiveFlow("attendance");
              setAttendanceStep('student_details');
              setChatHistory(prev => [
                ...prev,
                { type: 'bot', text: 'Switched to text-based attendance. Please type the student names and their attendance status.' }
              ]);
            }
          },
          {
            label: "Upload Image",
            action: () => {
              const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
              if (fileInput) {
                fileInput.click();
              }
            }
          }
        ]
      }
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
      console.log("Message attendance_summary:", currentMessage?.attendance_summary);

      // Use global state if we're editing, otherwise use message data
      const currentAttendanceData = attendanceData.length > 0 ? attendanceData : (currentMessage?.attendance_summary || []);
      const currentClassInfo = classInfo || currentMessage?.class_info;

      console.log("Data to save:", {
        currentAttendanceData,
        currentClassInfo,
        fromGlobal: attendanceData.length > 0,
        fromMessage: currentMessage?.attendance_summary?.length || 0
      });

      if (currentAttendanceData && currentAttendanceData.length > 0) {
        // Update the specific message's attendance_summary with the edited data
        setChatHistory(prev => {
          const updatedHistory = prev.map((msg, idx) => {
            if (idx === messageIndex && msg.type === 'bot') {
              return {
                ...msg,
                attendance_summary: [...currentAttendanceData], // Update with edited data
                class_info: currentClassInfo,
                // Update the answer text to reflect the changes
                answer: `Attendance Summary Updated:\n\n| Student Name | Attendance Status |\n|--------------|------------------|\n${currentAttendanceData.map(item => `| ${item.student_name} | ${item.attendance_status} |`).join('\n')}\n\nClass: ${currentClassInfo?.class_} ${currentClassInfo?.section} on ${currentClassInfo?.date}`
              };
            }
            return msg;
          });
          return updatedHistory;
        });

        // Store in session storage for persistence
        sessionStorage.setItem('pendingAttendanceData', JSON.stringify(currentAttendanceData));
        sessionStorage.setItem('pendingClassInfo', JSON.stringify(currentClassInfo));

        // Exit edit mode
        setEditingMessageIndex(null);

        // Clear the isBeingEdited flag from the message
        setChatHistory(prev => {
          const updatedHistory = [...prev];
          if (updatedHistory[messageIndex] && updatedHistory[messageIndex].type === 'bot') {
            (updatedHistory[messageIndex] as any).isBeingEdited = false;
            console.log("Cleared isBeingEdited flag for message:", messageIndex);
          }
          return updatedHistory;
        });

        // Show success message with updated buttons (no Save button since we're now in read-only mode)
        setChatHistory(prev => [
          ...prev,
          {
            type: 'bot',
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
                    setChatHistory(prev => {
                      const updatedHistory = [...prev];
                      if (updatedHistory[messageIndex] && updatedHistory[messageIndex].type === 'bot') {
                        (updatedHistory[messageIndex] as any).isBeingEdited = true;
                      }
                      return updatedHistory;
                    });

                    // Add edit mode message
                    setChatHistory(prev => [
                      ...prev,
                      {
                        type: 'bot',
                        text: '✅ Edit mode activated! You can now modify the attendance data in the table above. Make your changes and click Save when done.'
                      }
                    ]);
                  }
                }
              },
              {
                label: "Approve",
                action: () => {
                  // Use unified approval handler - it will automatically detect the attendance type
                  const dataToSave = getAttendanceDataForApproval(messageIndex);
                  if (dataToSave) {
                    // Determine attendance type based on the source
                    let attendanceType: 'text' | 'image' | 'voice' = 'text';
                    if (dataToSave.source.includes('image') || dataToSave.source.includes('ocr')) {
                      attendanceType = 'image';
                    } else if (dataToSave.source.includes('voice')) {
                      attendanceType = 'voice';
                    }
                    handleUnifiedAttendanceApproval(messageIndex, attendanceType);
                  } else {
                    // Fallback to text-based approval
                    handleTextAttendanceApproval(messageIndex);
                  }
                }
              },
              {
                label: "Reject",
                action: () => handleTextAttendanceRejection()
              }
            ]
          }
        ]);
      } else {
        console.log("No attendance data found. Global state:", attendanceData);
        console.log("Message state:", currentMessage?.attendance_summary);
        setChatHistory(prev => [
          ...prev,
          { type: 'bot', text: '❌ No attendance data to save. Please click "Edit Attendance" first to load the data, then make your changes and save again.' }
        ]);
      }
    } catch (err) {
      console.error("Error saving attendance:", err);
      setChatHistory(prev => [
        ...prev,
        { type: 'bot', text: `❌ Failed to save attendance: ${(err as Error).message}` }
      ]);
    }
  };


  // Scroll chat to bottom on new message
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);


  // Add these styles to your existing styles
  const additionalStyles = `
    .tab-container {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .tab-button {
      padding: 0.3rem 0.8rem;
      border-radius: 12px;
      border: none;
      font-size: 0.9rem;
      cursor: pointer;
      background: ${darkMode ? "#2d2d2d" : "#e4e4e7"};
      color: ${darkMode ? "#888" : "#666"};
      transition: all 0.2s;
    }
    .tab-button.active {
      background: ${darkMode ? "#3f3f46" : "#d4d4d8"};
      color: ${darkMode ? "#fff" : "#000"};
    }
    .reference-item {
      padding: 0.5rem;
      margin: 0.3rem 0;
      border-radius: 8px;
      background: ${darkMode ? "#2d2d2d" : "#f8fafc"};
      font-size: 0.9rem;
    }
    .query-container {
      position: relative;
      max-height: ${expandedQuery !== null ? "none" : "300px"};
      overflow-y: auto;
      background: ${darkMode ? "#1a1a1a" : "#f8fafc"};
      border-radius: 8px;
      padding: 1rem;
      font-size: 0.9rem;
    }
    .query-actions {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      display: flex;
      gap: 0.5rem;
    }
    .query-button {
      background: ${darkMode ? "#2d2d2d" : "#e4e4e7"};
      color: ${darkMode ? "#888" : "#666"};
      border: none;
      border-radius: 4px;
      padding: 0.3rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .query-button:hover {
      background: ${darkMode ? "#3f3f46" : "#d4d4d8"};
      color: ${darkMode ? "#fff" : "#000"};
    }
    .copied-tooltip {
      position: absolute;
      top: -25px;
      right: 0;
      background: ${darkMode ? "#2d2d2d" : "#e4e4e7"};
      color: ${darkMode ? "#fff" : "#000"};
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .bot-actions {
      display: flex;
      gap: 0.7rem;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .bot-actions-bottom {
      display: flex;
      gap: 0.7rem;
      align-items: flex-end;
      justify-content: flex-end;
      margin-top: 1.1rem;
      margin-bottom: 0.2rem;
      position: relative;
    }
    .bot-action-btn {
      background: ${darkMode ? "#23272f" : "#e0e7ff"};
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.2em;
      transition: all 0.2s ease;
      position: relative;
      color: ${darkMode ? "#888" : "#666"};
    }
    .bot-action-btn:hover {
      background: ${darkMode ? "#6366f1" : "#60a5fa"};
      color: #fff;
    }
    .bot-action-btn.thumbs-up-active {
      background: #22c55e;
      color: white;
    }
    .bot-action-btn.thumbs-down-active {
      background: #ef4444;
      color: white;
    }
    .bot-action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: ${darkMode ? "#23272f" : "#e0e7ff"};
      color: ${darkMode ? "#888" : "#666"};
    }
    .feedback-sent-tooltip {
      display: none;
    }
    .correction-box {
      position: absolute;
      bottom: 42px;
      right: 0;
      background: ${darkMode ? "#23272f" : "#fff"};
      color: ${darkMode ? "#eee" : "#222"};
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.10);
      padding: 0.7rem 1rem;
      min-width: 220px;
      max-width: 90vw;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      z-index: 10;
    }
    .correction-title {
      font-weight: 500;
      font-size: 0.98rem;
      margin-bottom: 0.2rem;
    }
    .correction-input {
      padding: 0.4rem 0.7rem;
      border-radius: 7px;
      border: 1px solid #bfcfff;
      font-size: 0.98rem;
      background: ${darkMode ? "#18181b" : "#f8fafc"};
      color: ${darkMode ? "#eee" : "#222"};
      margin-bottom: 0.3rem;
    }
    .correction-btn {
      padding: 0.28rem 0.9rem;
      border-radius: 7px;
      border: none;
      background: ${darkMode ? "#6366f1" : "#60a5fa"};
      color: #fff;
      font-weight: 500;
      cursor: pointer;
      font-size: 0.98rem;
      transition: background 0.2s;
      margin-left: auto;
    }
    .feedback-status-msg {
      margin-top: 0.3rem;
      font-size: 0.95rem;
      color: ${darkMode ? "#60a5fa" : "#6366f1"};
      font-weight: 500;
      text-align: right;
    }
    /* Add markdown table styles */
    .chatbot-msg-bubble.bot table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5em 0;
      font-size: 0.98em;
      background: ${darkMode ? "#23272f" : "#fff"};
    }
    .chatbot-msg-bubble.bot th,
    .chatbot-msg-bubble.bot td {
      border: 1px solid ${darkMode ? "#444" : "#bfcfff"};
      padding: 6px 12px;
      text-align: left;
    }
    .chatbot-msg-bubble.bot th {
      background: ${darkMode ? "#18181b" : "#e0e7ff"};
      font-weight: 600;
    }
    .chatbot-msg-bubble.bot tr:nth-child(even) {
      background: ${darkMode ? "#23272f" : "#f4f4f8"};
    }
  `;

  return (
    <>
      {/* Class Info Modal */}
      <ClassInfoModal
        isOpen={showClassInfoModal}
        onClose={handleClassInfoCancel}
        onConfirm={handleClassInfoConfirm}
        darkMode={darkMode}
      />

      <style>
        {`
        .bot-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.8rem;
}

.bot-text-btn {
  padding: 6px 14px;
  border-radius: 8px;
  background: #6366f1;
  color: #fff;
  border: none;
  cursor: pointer;
  min-width: 100px;
  flex: 1 1 auto;         /* allow responsive resizing */
  white-space: normal;
  word-break: break-word;
  text-align: center;
  transition: background 0.2s;
}

.bot-text-btn:hover {
  background: #4f46e5;
}

        .chatbot-root {
          width: 100vw;
          height: 100vh;
          min-height: 100vh;
          min-width: 100vw;
          background: ${darkMode
            ? "linear-gradient(135deg, #232526 0%, #414345 100%)"
            : "linear-gradient(135deg, #e0e7ff 0%, #f5f7fa 100%)"
          };
          display: flex;
          flex-direction: column;
          justify-content: stretch;
          align-items: stretch;
          font-family: 'Inter', sans-serif;
          transition: background 0.4s;
          padding: 0;
          margin: 0;
          box-sizing: border-box;
        }
        .chatbot-topbar {
          position: absolute;
          top: 1rem;
          right: 1rem;
          display: flex;
          gap: 1rem;
          z-index: 11;
          flex-wrap: wrap;
        }
        .chatbot-dropdown-group-topbar {
          display: flex;
          align-items: center;
          min-width: 90px;
          margin-right: 0.2rem;
        }
        .chatbot-label-topbar {
          font-size: 1.1rem;
          margin-right: 0.3rem;
          color: #888;
          display: flex;
          align-items: center;
        }
        .chatbot-select-topbar {
          width: 110px;
          padding: 0.25rem 0.7rem 0.25rem 0.5rem;
          border-radius: 6px;
          border: 1px solid #bfcfff;
          background: transparent;
          color: #222;
          font-size: 0.95rem;
          font-weight: 500;
          outline: none;
        }
        .chatbot-container {
          width: 100%;
          height: 100%;
          background: ${darkMode ? "rgba(30,30,30,0.98)" : "rgba(255,255,255,0.98)"
          };
          padding: 2.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
          min-height: 100vh;
          box-sizing: border-box;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .chatbot-header {
          color: ${darkMode ? "#f0f0f0" : "#222"};
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
          color: ${darkMode ? "#ccc" : "#444"};
          font-weight: 600;
          margin-bottom: 0.25rem;
          display: block;
        }
        .chatbot-select {
          width: 100%;
          padding: 0.6rem;
          border-radius: 8px;
          border: ${darkMode ? "1.5px solid #444" : "1.5px solid #bfcfff"};
          background-color: ${darkMode ? "#23272f" : "#f7faff"};
          color: ${darkMode ? "#eee" : "#222"};
          font-size: 1rem;
          font-weight: 500;
          outline: none;
          margin-top: 0.15rem;
        }
        .chatbot-chatbox {
          flex: 1;
          overflow-y: auto;
          border: ${darkMode ? "1.5px solid #333" : "1.5px solid #e0e7ff"};
          border-radius: 14px;
          padding: clamp(0.5rem, 2vw, 1.2rem);
          background: ${darkMode ? "#18181b" : "#f8fafc"};
          box-shadow: ${darkMode
            ? "0 2px 8px rgba(0,0,0,0.18)"
            : "0 2px 8px rgba(99,102,241,0.06)"
          };
          transition: background 0.4s;
          display: flex;
          flex-direction: column;
          margin-bottom: 1rem;
          min-height: 0; /* Important for Firefox */
        }
        .chatbot-messages {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .chatbot-msg-row {
          display: flex;
          margin-bottom: 0.85rem;
          align-items: flex-end;
        }
        .chatbot-msg-row.user {
          flex-direction: row-reverse;
        }
        .chatbot-msg-bubble {
          display: inline-block;
          padding: 10px 14px;
          border-radius: 22px;
          max-width: 90vw;
          word-break: break-word;
          font-size: clamp(0.95rem, 2vw, 1.08rem);
        }
        .chatbot-msg-bubble.user {
          background: linear-gradient(90deg, #6366f1 0%, #60a5fa 100%);
          color: #fff;
          box-shadow: 0 2px 8px rgba(99,102,241,0.10);
          border: none;
        }
        .chatbot-msg-bubble.bot {
          background: ${darkMode ? "#23272f" : "#e0e7ff"};
          color: ${darkMode ? "#f3f4f6" : "#222"};
          border: ${darkMode ? "1px solid #333" : "1px solid #e0e7ff"};
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
          opacity: 0.85;
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
          gap: 0.7rem;
          align-items: center;
          margin-top: 0.5rem;
          flex-wrap: wrap;
        }
        .chatbot-input {
          flex: 1;
          min-width: 0;
          padding: 12px;
          border-radius: 22px;
          border: ${darkMode ? "1.5px solid #444" : "1.5px solid #bfcfff"};
          font-size: clamp(0.95rem, 2vw, 1.08rem);
          background-color: ${darkMode ? "#23272f" : "#f7faff"};
          color: ${darkMode ? "#eee" : "#222"};
          outline: none;
          box-shadow: 0 1px 4px rgba(99,102,241,0.04);
          transition: background 0.4s;
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
          font-size: 20px;
          box-shadow: 0 2px 8px rgba(99,102,241,0.10);
          transition: background 0.3s;
        }
        .chatbot-btn.mic {
          background: linear-gradient(90deg, #6366f1 0%, #60a5fa 100%);
        }
        .chatbot-btn.mic.recording {
          background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
        }
        .chatbot-btn.send {
          background: linear-gradient(90deg, #6366f1 0%, #60a5fa 100%);
          opacity: 1;
          transition: opacity 0.3s;
        }
        .chatbot-btn.send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        @media (max-width: 900px) {
          .chatbot-topbar {
            right: 0.5rem;
            top: 3.2rem;
            flex-direction: column;
            align-items: flex-end;
            gap: 0.5rem;
          }
          .chatbot-dropdown-group-topbar {
            min-width: 80px;
            margin-right: 0;
          }
          .chatbot-select-topbar {
            width: 90px;
            font-size: 0.9rem;
          }
          .chatbot-container {
            padding: 1.2rem 0.5rem;
          }
        }
        @media (max-width: 1200px) {
          .chatbot-topbar {
            right: 0.5rem;
            gap: 0.5rem;
          }
          .chatbot-dropdown-group-topbar {
            min-width: 80px;
          }
          .chatbot-select-topbar {
            width: 90px;
            font-size: 0.9rem;
          }
        }
        @media (max-width: 600px) {
          .chatbot-header {
            font-size: 0.95rem;
            margin: 1rem auto 1.5rem auto;
          }
          .chatbot-dropdowns {
            flex-direction: column;
            gap: 0.7rem;
          }
          .chatbot-container {
            padding: 0.5rem 0.1rem;
          }
          .chatbot-chatbox {
            padding: 0.5rem;
          }
        }
        ${additionalStyles}
        `}
      </style>
      {/* Topbar Dropdowns */}
      <div className="chatbot-topbar">
        <div className="chatbot-dropdown-group-topbar">
          <span className="chatbot-label-topbar" title="Flow">
            🔄
          </span>
          <select
            value={activeFlow}
            onChange={(e) => {
              const newFlow = e.target.value as FlowType;
              setActiveFlow(newFlow);
              setUserOptionSelected(true);

              // Add a message about the flow change
              if (newFlow === "query") {
                setChatHistory(prev => [
                  ...prev,
                  { type: "bot", text: "Query flow activated. You can now ask me anything!" }
                ]);
              } else if (newFlow === "attendance") {
                setAttendanceStep('class_info');
                setPendingClassInfo(null);
                setChatHistory(prev => [
                  ...prev,
                  { type: "bot", text: "Attendance flow activated. First, please provide class information (class name, section, and date). For example: 'Class 6 A on 2025-01-15' or upload an image with class details." }
                ]);
              } else if (newFlow === "voice_attendance") {
                setAttendanceStep('class_info');
                setPendingClassInfo(null);
                setChatHistory(prev => [
                  ...prev,
                  { type: "bot", text: "Voice attendance flow activated! 🎤 You can now use voice commands to mark attendance. First, speak the class information (class name, section, and date), then speak the student names and their attendance status. For example: 'Class 6 A on 2025-01-15' then 'Aarav present, Diya absent'." }
                ]);
              }
            }}
            disabled={isRecording}
            className="chatbot-select-topbar"
          >
            <option value="query">Query</option>
            <option value="attendance">Mark Attendance (Text/Image)</option>
            <option value="voice_attendance">Mark Attendance (Voice)</option>
            <option value="none">Select Flow</option>
          </select>
        </div>
        <div className="chatbot-dropdown-group-topbar">
          <span className="chatbot-label-topbar" title="Microphone">
            🎧
          </span>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={isRecording}
            className="chatbot-select-topbar"
          >
            <option value="default">Default</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Mic (${d.deviceId.slice(-4)})`}
              </option>
            ))}
          </select>
        </div>
        <div className="chatbot-dropdown-group-topbar">
          <span className="chatbot-label-topbar" title="Language">
            🌐
          </span>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            disabled={isRecording}
            className="chatbot-select-topbar"
          >
            {languages.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="chatbot-root">
        <div className="chatbot-container">
          {/* Remove the h2 header from here */}
          <div className="chatbot-chatbox" ref={chatBoxRef}>
            {/* Attendance Flow Step Indicator */}
            {(activeFlow === "attendance" || activeFlow === "voice_attendance") && (
              <div style={{
                background: darkMode ? '#2a2a2a' : '#f0f9ff',
                border: `1px solid ${darkMode ? '#444' : '#e0e7ff'}`,
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: attendanceStep === 'class_info' ? (darkMode ? '#60a5fa' : '#2563eb') : (darkMode ? '#888' : '#666'),
                  fontWeight: attendanceStep === 'class_info' ? '600' : '400'
                }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: attendanceStep === 'class_info' ? (darkMode ? '#60a5fa' : '#2563eb') : (darkMode ? '#444' : '#e0e7ff'),
                    color: attendanceStep === 'class_info' ? 'white' : (darkMode ? '#888' : '#666'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.875rem',
                    fontWeight: '600'
                  }}>
                    {attendanceStep === 'class_info' ? '1' : '✓'}
                  </span>
                  {activeFlow === "voice_attendance" ? "Class Info (Voice)" : "Class Information"}
                </div>
                <div style={{
                  width: '2px',
                  height: '20px',
                  background: darkMode ? '#444' : '#e0e7ff'
                }}></div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: attendanceStep === 'student_details' ? (darkMode ? '#60a5fa' : '#2563eb') : (darkMode ? '#888' : '#666'),
                  fontWeight: attendanceStep === 'student_details' ? '600' : '400'
                }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: attendanceStep === 'student_details' ? (darkMode ? '#60a5fa' : '#2563eb') : (darkMode ? '#444' : '#e0e7ff'),
                    color: attendanceStep === 'student_details' ? 'white' : (darkMode ? '#888' : '#666'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.875rem',
                    fontWeight: '600'
                  }}>
                    {attendanceStep === 'completed' ? '✓' : '2'}
                  </span>
                  {activeFlow === "voice_attendance" ? "Student Details (Voice)" : "Student Details"}
                </div>
                <div style={{
                  width: '2px',
                  height: '20px',
                  background: darkMode ? '#444' : '#e0e7ff'
                }}></div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: attendanceStep === 'completed' ? (darkMode ? '#22c55e' : '#16a34a') : (darkMode ? '#888' : '#666'),
                  fontWeight: attendanceStep === 'completed' ? '600' : '400'
                }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: attendanceStep === 'completed' ? (darkMode ? '#22c55e' : '#16a34a') : (darkMode ? '#444' : '#e0e7ff'),
                    color: attendanceStep === 'completed' ? 'white' : (darkMode ? '#888' : '#666'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.875rem',
                    fontWeight: '600'
                  }}>
                    {attendanceStep === 'completed' ? '✓' : '3'}
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
                      <span className="chatbot-msg-icon">
                        <FiUser />
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="chatbot-msg-icon">
                        <FiCpu />
                      </span>
                      <div
                        className="chatbot-msg-bubble bot"
                        style={{ position: "relative" }}
                      >
                        {/* Processing indicator for image processing */}
                        {(msg as any).isProcessing && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.5rem',
                            padding: '0.5rem',
                            backgroundColor: darkMode ? '#374151' : '#e5e7eb',
                            borderRadius: '0.375rem',
                            border: `1px solid ${darkMode ? '#4b5563' : '#d1d5db'}`
                          }}>
                            <div style={{
                              width: '20px',
                              height: '20px',
                              border: `2px solid ${darkMode ? '#6b7280' : '#9ca3af'}`,
                              borderTop: `2px solid ${darkMode ? '#3b82f6' : '#2563eb'}`,
                              borderRadius: '50%',
                              animation: 'spin 1s linear infinite'
                            }}></div>
                            <span style={{
                              fontSize: '0.875rem',
                              color: darkMode ? '#d1d5db' : '#6b7280'
                            }}>
                              Processing image...
                            </span>
                          </div>
                        )}
                        {msg.text ? (
                          <div>{msg.text}</div>
                        ) : (
                          <>
                            <div className="tab-container">
                              <button
                                className={`tab-button ${msg.activeTab === "answer" ? "active" : ""
                                  }`}
                                onClick={() => handleTabChange(idx, "answer")}
                              >
                                Answer
                              </button>
                              <button
                                className={`tab-button ${msg.activeTab === "references" ? "active" : ""
                                  }`}
                                onClick={() =>
                                  handleTabChange(idx, "references")
                                }
                              >
                                References
                              </button>
                              <button
                                className={`tab-button ${msg.activeTab === "query" ? "active" : ""
                                  }`}
                                onClick={() => handleTabChange(idx, "query")}
                              >
                                Query
                              </button>
                            </div>

                            {msg.activeTab === "answer" && (
                              <>
                                {/* Show table if this message has attendance data */}
                                {(() => {
                                  console.log(`Checking message ${idx} for attendance data:`, {
                                    hasAttendanceSummary: !!msg.attendance_summary,
                                    attendanceSummaryLength: msg.attendance_summary?.length || 0,
                                    attendanceSummary: msg.attendance_summary,
                                    messageType: msg.type,
                                    hasButtons: !!(msg as any).buttons
                                  });
                                  return msg.attendance_summary && msg.attendance_summary.length > 0;
                                })() ? (
                                  (() => {
                                    console.log(`Rendering table for message ${idx}, editingMessageIndex: ${editingMessageIndex}, isEditing: ${editingMessageIndex === idx}`);
                                    console.log(`Message ${idx} attendance_summary length:`, msg.attendance_summary?.length || 0);
                                    console.log(`Global attendanceData length:`, attendanceData.length);
                                    console.log(`Message type:`, msg.type);
                                    console.log(`Message has attendance_summary:`, !!msg.attendance_summary);

                                    // Add a simple test to see if the edit mode is detected
                                    if (editingMessageIndex === idx) {
                                      console.log(`✅ EDIT MODE DETECTED for message ${idx}!`);
                                      console.log(`✅ Table should be editable now!`);
                                      console.log(`✅ Current editingMessageIndex: ${editingMessageIndex}, Current idx: ${idx}`);
                                      console.log(`✅ Global attendanceData:`, attendanceData);
                                    } else {
                                      console.log(`❌ NOT in edit mode for message ${idx}. Expected: ${editingMessageIndex}, Got: ${idx}`);
                                      console.log(`❌ Table will NOT be editable`);
                                      console.log(`❌ Current editingMessageIndex: ${editingMessageIndex}, Current idx: ${idx}`);
                                    }

                                    return true;
                                  })() &&
                                  <div style={{
                                    background: darkMode ? '#1a1a1a' : '#ffffff',
                                    border: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`,
                                    borderRadius: '8px',
                                    padding: '1rem',
                                    margin: '1rem 0',
                                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                                  }}>
                                    {/* Header */}
                                    <div style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      marginBottom: '1rem',
                                      paddingBottom: '0.5rem',
                                      borderBottom: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`
                                    }}>
                                      <div>
                                        <h3 style={{
                                          color: darkMode ? '#f3f4f6' : '#111827',
                                          margin: '0 0 0.25rem 0',
                                          fontSize: '1.125rem',
                                          fontWeight: '600'
                                        }}>
                                          {(editingMessageIndex === idx || (msg as any).isBeingEdited) ? '✏️ Edit Attendance Summary' : '📋 Attendance Summary'}
                                        </h3>
                                        {(editingMessageIndex === idx || (msg as any).isBeingEdited) && (
                                          <div style={{
                                            background: darkMode ? '#1e40af' : '#dbeafe',
                                            color: darkMode ? '#dbeafe' : '#1e40af',
                                            padding: '0.5rem',
                                            borderRadius: '6px',
                                            fontSize: '0.875rem',
                                            marginBottom: '1rem',
                                            fontWeight: '500'
                                          }}>
                                            ✏️ Edit mode active - You can modify student names and attendance status below
                                          </div>
                                        )}
                                        {/* Edit Mode Buttons - Show Save/Cancel when in edit mode */}
                                        {(editingMessageIndex === idx || (msg as any).isBeingEdited) && (
                                          <div style={{
                                            display: 'flex',
                                            gap: '0.5rem',
                                            marginBottom: '1rem',
                                            padding: '0.5rem',
                                            background: darkMode ? '#23272f' : '#f8fafc',
                                            borderRadius: '6px',
                                            border: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`
                                          }}>
                                            <button
                                              onClick={() => handleSaveAttendance(idx)}
                                              style={{
                                                padding: '0.5rem 1rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: '#22c55e',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                                fontWeight: '500',
                                                transition: 'background 0.2s'
                                              }}
                                            >
                                              💾 Save
                                            </button>
                                            <button
                                              onClick={() => {
                                                // Cancel editing - exit edit mode without saving
                                                setEditingMessageIndex(null);
                                                setChatHistory(prev => {
                                                  const updatedHistory = [...prev];
                                                  if (updatedHistory[idx] && updatedHistory[idx].type === 'bot') {
                                                    (updatedHistory[idx] as any).isBeingEdited = false;
                                                  }
                                                  return updatedHistory;
                                                });
                                                setChatHistory(prev => [
                                                  ...prev,
                                                  { type: 'bot', text: '❌ Edit cancelled. No changes were saved.' }
                                                ]);
                                              }}
                                              style={{
                                                padding: '0.5rem 1rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: '#ef4444',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                                fontWeight: '500',
                                                transition: 'background 0.2s'
                                              }}
                                            >
                                              ❌ Cancel
                                            </button>
                                          </div>
                                        )}
                                        {classInfo && (
                                          <p style={{
                                            color: darkMode ? '#9ca3af' : '#6b7280',
                                            margin: '0',
                                            fontSize: '0.875rem'
                                          }}>
                                            Class {classInfo.class_} {classInfo.section} • {classInfo.date}
                                          </p>
                                        )}
                                      </div>

                                      {/* Inline editing buttons removed - using main approval buttons instead */}
                                    </div>

                                    {/* Statistics */}
                                    <div style={{
                                      display: 'flex',
                                      gap: '1rem',
                                      marginBottom: '1rem',
                                      padding: '0.75rem',
                                      background: darkMode ? '#23272f' : '#f8fafc',
                                      borderRadius: '6px',
                                      fontSize: '0.875rem'
                                    }}>
                                      {(() => {
                                        const isEditing = editingMessageIndex === idx || (msg as any).isBeingEdited;
                                        const dataToUse = isEditing ? attendanceData : (msg.attendance_summary || []);
                                        return (
                                          <>
                                            <div style={{ color: darkMode ? '#f3f4f6' : '#111827' }}>
                                              <strong>Total:</strong> {dataToUse.length}
                                            </div>
                                            <div style={{ color: '#22c55e' }}>
                                              <strong>Present:</strong> {dataToUse.filter(item => item.attendance_status === 'Present').length}
                                            </div>
                                            <div style={{ color: '#ef4444' }}>
                                              <strong>Absent:</strong> {dataToUse.filter(item => item.attendance_status === 'Absent').length}
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>

                                    {/* Editable Table */}
                                    <div style={{
                                      overflow: 'auto',
                                      border: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`,
                                      borderRadius: '6px'
                                    }}>
                                      <table style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: '0.875rem'
                                      }}>
                                        <thead>
                                          <tr style={{
                                            background: darkMode ? '#2a2a2a' : '#f9fafb',
                                            borderBottom: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`
                                          }}>
                                            <th style={{
                                              padding: '0.75rem',
                                              textAlign: 'left',
                                              color: darkMode ? '#f3f4f6' : '#111827',
                                              fontWeight: '600',
                                              borderRight: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`
                                            }}>
                                              Student Name
                                            </th>
                                            <th style={{
                                              padding: '0.75rem',
                                              textAlign: 'left',
                                              color: darkMode ? '#f3f4f6' : '#111827',
                                              fontWeight: '600',
                                              borderRight: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`
                                            }}>
                                              Status
                                            </th>
                                            <th style={{
                                              padding: '0.75rem',
                                              textAlign: 'center',
                                              color: darkMode ? '#f3f4f6' : '#111827',
                                              fontWeight: '600',
                                              width: '100px'
                                            }}>
                                              Actions
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(() => {
                                            const isEditing = editingMessageIndex === idx || (msg as any).isBeingEdited;
                                            const dataToUse = isEditing ? attendanceData : (msg.attendance_summary || []);
                                            console.log(`Table data for message ${idx}:`, {
                                              attendanceDataLength: attendanceData.length,
                                              msgAttendanceSummaryLength: msg.attendance_summary?.length || 0,
                                              dataToUseLength: dataToUse.length,
                                              isEditing: isEditing,
                                              msgAttendanceSummary: msg.attendance_summary,
                                              usingGlobalState: isEditing
                                            });

                                            // Show empty state if no data
                                            if (dataToUse.length === 0) {
                                              return (
                                                <tr>
                                                  <td colSpan={3} style={{
                                                    padding: '2rem',
                                                    textAlign: 'center',
                                                    color: darkMode ? '#9ca3af' : '#6b7280',
                                                    fontStyle: 'italic'
                                                  }}>
                                                    {isEditing ? 'No attendance data available for editing. Please check if the data was loaded properly.' : 'No attendance data available. Please check if the class exists or try entering student information manually.'}
                                                  </td>
                                                </tr>
                                              );
                                            }

                                            return dataToUse.map((item, index) => (
                                              <tr key={index} style={{
                                                borderBottom: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`,
                                                background: index % 2 === 0 ? (darkMode ? '#1a1a1a' : '#ffffff') : (darkMode ? '#23272f' : '#f9fafb')
                                              }}>
                                                <td style={{
                                                  padding: '0.75rem',
                                                  borderRight: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`,
                                                  color: darkMode ? '#f3f4f6' : '#111827'
                                                }}>
                                                  {(() => {
                                                    const isEditing = editingMessageIndex === idx || (msg as any).isBeingEdited;
                                                    console.log(`Student name field for message ${idx}: isEditing=${isEditing}, editingMessageIndex=${editingMessageIndex}, idx=${idx}, isBeingEdited=${(msg as any).isBeingEdited}`);
                                                    console.log(`Student name field - isEditing check: ${editingMessageIndex} === ${idx} = ${editingMessageIndex === idx} OR isBeingEdited=${(msg as any).isBeingEdited}`);
                                                    return isEditing ? (
                                                      <input
                                                        type="text"
                                                        value={item.student_name}
                                                        onChange={(e) => handleAttendanceDataChange(index, 'student_name', e.target.value)}
                                                        style={{
                                                          width: '100%',
                                                          padding: '0.5rem',
                                                          border: `1px solid ${darkMode ? '#555' : '#d1d5db'}`,
                                                          borderRadius: '4px',
                                                          background: darkMode ? '#2a2a2a' : '#ffffff',
                                                          color: darkMode ? '#f3f4f6' : '#111827',
                                                          fontSize: '0.875rem'
                                                        }}
                                                      />
                                                    ) : (
                                                      <span style={{ fontSize: '0.875rem' }}>{item.student_name}</span>
                                                    );
                                                  })()}
                                                </td>
                                                <td style={{
                                                  padding: '0.75rem',
                                                  borderRight: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`,
                                                  color: darkMode ? '#f3f4f6' : '#111827'
                                                }}>
                                                  {(() => {
                                                    const isEditing = editingMessageIndex === idx || (msg as any).isBeingEdited;
                                                    console.log(`Attendance status field for message ${idx}: isEditing=${isEditing}, editingMessageIndex=${editingMessageIndex}, isBeingEdited=${(msg as any).isBeingEdited}`);
                                                    return isEditing ? (
                                                      <select
                                                        value={item.attendance_status}
                                                        onChange={(e) => handleAttendanceDataChange(index, 'attendance_status', e.target.value)}
                                                        style={{
                                                          width: '100%',
                                                          padding: '0.5rem',
                                                          border: `1px solid ${darkMode ? '#555' : '#d1d5db'}`,
                                                          borderRadius: '4px',
                                                          background: darkMode ? '#2a2a2a' : '#ffffff',
                                                          color: darkMode ? '#f3f4f6' : '#111827',
                                                          fontSize: '0.875rem'
                                                        }}
                                                      >
                                                        <option value="Present">Present</option>
                                                        <option value="Absent">Absent</option>
                                                      </select>
                                                    ) : (
                                                      <span
                                                        style={{
                                                          fontSize: '0.875rem',
                                                          color: item.attendance_status === 'Present' ? '#22c55e' :
                                                            item.attendance_status === 'Absent' ? '#ef4444' : '#6b7280'
                                                        }}
                                                      >
                                                        {item.attendance_status}
                                                      </span>
                                                    );
                                                  })()}
                                                </td>
                                                <td style={{
                                                  padding: '0.75rem',
                                                  textAlign: 'center'
                                                }}>
                                                  {(editingMessageIndex === idx || (msg as any).isBeingEdited) && (
                                                    <button
                                                      onClick={() => handleRemoveStudent(index)}
                                                      style={{
                                                        padding: '0.25rem',
                                                        border: 'none',
                                                        background: '#ef4444',
                                                        color: 'white',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.875rem'
                                                      }}
                                                      title="Remove Student"
                                                    >
                                                      🗑️
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                            ));
                                          })()}
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* Add New Student - only show in edit mode */}
                                    {(editingMessageIndex === idx || (msg as any).isBeingEdited) && (
                                      <div style={{
                                        marginTop: '1rem',
                                        padding: '1rem',
                                        background: darkMode ? '#23272f' : '#f8fafc',
                                        borderRadius: '6px',
                                        border: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`
                                      }}>
                                        <button
                                          onClick={handleAddStudent}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.5rem 1rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: darkMode ? '#3b82f6' : '#2563eb',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '0.875rem',
                                            fontWeight: '500',
                                            transition: 'background 0.2s'
                                          }}
                                        >
                                          ➕ Add New Student
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    {/* Render answer as Markdown with GFM (tables) */}
                                    <div>
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.answer || ""}
                                      </ReactMarkdown>
                                    </div>

                                    {/* Duplicate Edit Attendance button removed - using main approval buttons instead */}
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
                                      onClick={() => setShowCorrectionBox(idx)}
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
                                        <div className="correction-box">
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
                              </>
                            )}

                            {(() => {
                              console.log(`Checking buttons for message ${idx}:`, {
                                hasButtons: !!(msg as any).buttons,
                                buttonsLength: (msg as any).buttons?.length || 0,
                                buttons: (msg as any).buttons
                              });
                              return (msg as any).buttons && (msg as any).buttons.length > 0;
                            })() && (
                                <div className="bot-buttons">
                                  {(msg as any).buttons.map((btn: any, i: number) => (
                                    <button
                                      key={i}
                                      className="bot-text-btn" // <-- new class
                                      onClick={btn.action}
                                    >
                                      {btn.label}
                                    </button>
                                  ))}
                                </div>
                              )}

                            {msg.activeTab === "references" &&
                              msg.references && (
                                <div>
                                  {/* Ensure references is always an array */}
                                  {(!Array.isArray(msg.references) ||
                                    msg.references.length === 0) && (
                                      <div className="reference-item">
                                        No references found.
                                      </div>
                                    )}
                                  {Array.isArray(msg.references) &&
                                    msg.references.map((ref, i) => (
                                      <div key={i} className="reference-item">
                                        {Object.entries(ref).map(
                                          ([key, value]) => (
                                            <div key={key}>
                                              <strong>{key}:</strong>{" "}
                                              {typeof value === "object" &&
                                                value !== null
                                                ? JSON.stringify(value)
                                                : String(value)}
                                            </div>
                                          )
                                        )}
                                      </div>
                                    ))}
                                </div>
                              )}

                            {msg.activeTab === "query" && msg.mongodbquery && (
                              <div className="query-container">
                                <div className="query-actions">
                                  <button
                                    className="query-button"
                                    onClick={() =>
                                      handleCopyQuery(idx, msg.mongodbquery!)
                                    }
                                    title="Copy query"
                                  >
                                    <FiCopy />
                                    {copiedQuery === idx && (
                                      <span className="copied-tooltip">
                                        Copied!
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    className="query-button"
                                    onClick={() =>
                                      setExpandedQuery(
                                        expandedQuery === idx ? null : idx
                                      )
                                    }
                                    title={
                                      expandedQuery === idx
                                        ? "Collapse"
                                        : "Expand"
                                    }
                                  >
                                    {expandedQuery === idx ? (
                                      <FiMinimize2 />
                                    ) : (
                                      <FiMaximize2 />
                                    )}
                                  </button>
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {msg.mongodbquery.join("\n")}
                                </pre>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Input Area with Upload Buttons */}
          <div className="chatbot-input-area" style={{ gap: '0.7rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {/* Single Upload for Excel and Image */}
            <label
              className={`chatbot-btn send${activeFlow === "attendance" ? "" : " disabled"}`}
              title="Upload Excel or Image"
              style={{
                marginRight: '0.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: activeFlow === "attendance" ? "pointer" : "not-allowed",
                fontSize: '20px',
                opacity: activeFlow === "attendance" ? 1 : 0.5,
              }}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv,image/*"
                style={{ display: 'none' }}
                disabled={activeFlow !== "attendance"}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (file && activeFlow === "attendance") {
                    try {
                      // Show upload message
                      setChatHistory(prev => [
                        ...prev,
                        { type: 'user', text: `Uploaded ${file.type.startsWith('image/') ? 'image' : 'file'}: ${file.name}` }
                      ]);

                      if (file.type.startsWith('image/')) {
                        // For images, follow the same step-by-step flow as text-based attendance
                        if (attendanceStep === 'class_info') {
                          // If we're in class info step, show class info modal
                          setPendingImageFile(file);
                          setShowClassInfoModal(true);
                        } else if (attendanceStep === 'student_details') {
                          // If we're in student details step, process the image directly
                          if (pendingClassInfo) {
                            try {
                              // Show processing indicator
                              setIsProcessingImage(true);
                              setChatHistory(prev => [
                                ...prev,
                                {
                                  type: 'bot',
                                  text: '🔄 Processing image... Please wait while I extract attendance information from your image.',
                                  isProcessing: true
                                }
                              ]);

                              const result = await uploadAttendanceImage(file, pendingClassInfo);

                              // Clear processing state
                              setIsProcessingImage(false);

                              // Remove the processing message
                              setChatHistory(prev => prev.filter(msg => !(msg as any).isProcessing));

                              if (result.data.attendance_summary && result.data.attendance_summary.length > 0) {
                                // Create the message with attendance data (same as text-based)
                                const newMessage = {
                                  type: "bot" as const,
                                  answer: result.message,
                                  references: undefined,
                                  mongodbquery: undefined,
                                  activeTab: "answer" as const,
                                  attendance_summary: result.data.attendance_summary,
                                  class_info: pendingClassInfo,
                                  bulkattandance: result.data.bulkattandance,
                                  finish_collecting: result.data.finish_collecting
                                };

                                // Set global state for editing
                                setAttendanceData(result.data.attendance_summary);
                                setClassInfo(pendingClassInfo);
                                setAttendanceStep('completed');

                                // Add the same buttons as text-based attendance
                                (newMessage as any).buttons = [
                                  {
                                    label: "Edit Attendance",
                                    action: () => {
                                      console.log("Edit Attendance clicked for image-based attendance");
                                      console.log("Setting attendance data:", result.data.attendance_summary);
                                      console.log("Setting class info:", pendingClassInfo);
                                      console.log("Setting editing message index to:", chatHistory.length);

                                      // Set the global state for editing
                                      setAttendanceData(result.data.attendance_summary);
                                      setClassInfo(pendingClassInfo);
                                      setEditingMessageIndex(chatHistory.length);

                                      // Force a re-render by updating the message to trigger edit mode
                                      setChatHistory(prev => {
                                        const updatedHistory = [...prev];
                                        const lastMessage = updatedHistory[updatedHistory.length - 1];
                                        if (lastMessage && lastMessage.type === 'bot') {
                                          // Mark this message as being edited
                                          (lastMessage as any).isBeingEdited = true;
                                          console.log("Set isBeingEdited flag to true for message:", updatedHistory.length - 1);
                                        }
                                        return updatedHistory;
                                      });

                                      // Add a message to indicate edit mode is active
                                      setChatHistory(prev => [
                                        ...prev,
                                        {
                                          type: 'bot',
                                          text: '✅ Edit mode activated! You can now modify the attendance data in the table above. Use the Save/Cancel buttons in the table to save or discard your changes.'
                                        }
                                      ]);
                                    }
                                  },
                                  {
                                    label: "Approve",
                                    action: () => handleOCRApproval() // No need to pass message index, will search automatically
                                  },
                                  {
                                    label: "Reject",
                                    action: () => handleOCRRejection()
                                  }
                                ];

                                setChatHistory((prev) => [...prev, newMessage]);
                              } else {
                                // If no attendance data from image, ask for student details
                                setChatHistory(prev => [
                                  ...prev,
                                  {
                                    type: 'bot',
                                    text: 'Image processed but no attendance data found. Please provide student details manually or try uploading a different image.'
                                  }
                                ]);
                              }
                            } catch (error) {
                              // Clear processing state on error
                              setIsProcessingImage(false);
                              setChatHistory(prev => {
                                // Remove processing message and add error message
                                const filteredHistory = prev.filter(msg => !(msg as any).isProcessing);
                                return [
                                  ...filteredHistory,
                                  {
                                    type: 'bot',
                                    text: `❌ Image processing failed: ${(error as Error).message}. Please try uploading a different image or provide attendance data as text.`
                                  }
                                ];
                              });
                            }
                          }
                        }
                      } else {
                        // For other files (Excel, CSV), process normally
                        if (attendanceStep === 'class_info') {
                          setChatHistory(prev => [
                            ...prev,
                            { type: 'bot', text: 'Please provide class information first before uploading student data files.' }
                          ]);
                        } else if (attendanceStep === 'student_details') {
                          const result = await uploadFile(file);
                          setChatHistory(prev => [
                            ...prev,
                            { type: 'bot', text: result.message || 'File processing completed.' }
                          ]);
                        }
                      }
                    } catch (err) {
                      setChatHistory(prev => [
                        ...prev,
                        { type: 'bot', text: `File upload failed: ${(err as Error).message}` }
                      ]);
                    }
                  }
                  e.target.value = '';
                }}
              />
              <FiUpload />
            </label>
            {/* ...existing code... */}
            <input
              type="text"
              placeholder="Type your message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !isRecording && handleSubmit()
              }
              className="chatbot-input"
              disabled={isRecording}
            />
            <button
              onClick={isRecording ? stopStreaming : startStreaming}
              className={`chatbot-btn mic${isRecording ? " recording" : ""}`}
              title={isRecording ? "Stop Recording" : "Start Recording"}
            >
              {isRecording ? <FiMicOff /> : <FiMic />}
            </button>
            <button
              onClick={handleSubmit}
              className="chatbot-btn send"
              title="Send Message"
              disabled={isRecording}
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
