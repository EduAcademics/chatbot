/**
 * Chat input area: file upload, text input, voice buttons, send.
 * Extracted from AudioStreamerChatBot to reduce main file size.
 */
import { motion } from "framer-motion";
import { FiMic, FiSend, FiUpload } from "react-icons/fi";
import type { FlowType } from "./types";
import type { AttendanceFlowCallbacks, AttendanceState, ClassInfo } from "./flows/attendanceFlow";
import { handleAssignmentFileUpload } from "./flows/assignmentFlow";
import { handleAttendanceImageUpload } from "./flows/attendanceFlow";

export interface ChatInputAreaProps {
  activeFlow: FlowType;
  inputText: string;
  setInputText: (v: string | ((prev: string) => string)) => void;
  isRecording: boolean;
  fullVoiceMode: boolean;
  setFullVoiceMode: (v: boolean) => void;
  isVoiceActive: boolean;
  handleSubmit: (overrideMessage?: string) => Promise<void>;
  startStreaming: (useFullVoice?: boolean) => Promise<void>;
  stopStreaming: (skipSubmit?: boolean) => Promise<void>;
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  sessionId: string;
  userId: string;
  classInfo: ClassInfo | null;
  pendingClassInfo: ClassInfo | null;
  attendanceFlowState: AttendanceState;
  attendanceStep: "class_info" | "student_details" | "completed";
  getAttendanceFlowCallbacks: () => AttendanceFlowCallbacks;
  setPendingImageFile: (f: File | null) => void;
  setShowClassInfoModal: (v: boolean) => void;
  uploadFile: (file: File) => Promise<any>;
  getErpContext: () => { academic_session: string; branch_token: string };
  activeVoiceButtonRef: React.MutableRefObject<"audio" | "mic" | null>;
}

export default function ChatInputArea({
  activeFlow,
  inputText,
  setInputText,
  isRecording,
  fullVoiceMode,
  setFullVoiceMode,
  isVoiceActive: _isVoiceActive,
  handleSubmit,
  startStreaming,
  stopStreaming,
  setChatHistory,
  sessionId,
  userId,
  classInfo,
  pendingClassInfo,
  attendanceFlowState,
  attendanceStep,
  getAttendanceFlowCallbacks,
  setPendingImageFile,
  setShowClassInfoModal,
  uploadFile,
  getErpContext,
  activeVoiceButtonRef,
}: ChatInputAreaProps) {
  const isAttendanceFlow = activeFlow === "attendance" || activeFlow === "voice_attendance";
  return (
    <div className={`chatbot-input-area ${isAttendanceFlow ? "chatbot-input-area-attendance" : ""}`}>
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
                  const existingClassInfo =
                    classInfo ||
                    pendingClassInfo ||
                    attendanceFlowState.classInfo;

                  if (existingClassInfo) {
                    await handleAttendanceImageUpload({
                      file,
                      sessionId: sessionId || userId || "",
                      userId,
                      classInfo: existingClassInfo,
                      isVoiceTriggered: false,
                      callbacks: getAttendanceFlowCallbacks(),
                    });
                  } else {
                    setPendingImageFile(file);
                    setShowClassInfoModal(true);
                  }
                } else if (attendanceStep === "student_details") {
                  const result = await uploadFile(file);
                  setChatHistory((prev) => [
                    ...prev,
                    {
                      type: "bot",
                      text: result.message || "File processing completed.",
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

      <input
        type="text"
        placeholder={
          fullVoiceMode
            ? "Speak naturally — I'll respond when you finish..."
            : isAttendanceFlow
              ? "Class info, student names, or type here..."
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
          activeVoiceButtonRef.current = "audio";
          if (fullVoiceMode) {
            setFullVoiceMode(false);
            stopStreaming(true);
          } else {
            setFullVoiceMode(true);
            startStreaming(true);
          }
        }}
        className={`chatbot-btn chatbot-btn-full-voice w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl flex items-center justify-center ${
          fullVoiceMode ? " full-voice-active" : ""
        }`}
        title={
          fullVoiceMode
            ? "Exit Full Voice Mode (Hands-Free)"
            : "Full Voice Mode — Mic always on, auto turn detection"
        }
      >
        <FiMic />
      </button>
      <button
        onClick={() => handleSubmit()}
        className="chatbot-btn send"
        title="Send Message"
        disabled={isRecording && fullVoiceMode}
      >
        <FiSend />
      </button>
    </div>
  );
}
