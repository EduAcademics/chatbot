/**
 * Chat input area: file upload, text input, push-to-talk mic, send.
 * PTT: hold mic → live transcript in text box → release → auto-send.
 */
import { useRef } from "react";
import { motion } from "framer-motion";
import { FiLoader, FiMic, FiSend, FiUpload } from "react-icons/fi";
import type { FlowType } from "./types";
import type {
  AttendanceFlowCallbacks,
  AttendanceState,
  ClassInfo,
} from "./flows/attendanceFlow";
import { handleAssignmentFileUpload } from "./flows/assignmentFlow";
import { handleMessageFileUpload } from "./flows/messageFlow";
import { handleSubmissionFileUpload } from "./flows/submissionFlow";
import { handleAttendanceImageUpload } from "./flows/attendanceFlow";

export interface ChatInputAreaProps {
  activeFlow: FlowType;
  inputText: string;
  setInputText: (v: string | ((prev: string) => string)) => void;
  isRecording: boolean;
  isPttCapturing: boolean;
  isPttConnecting: boolean;
  isVoiceActive: boolean;
  handleSubmit: (overrideMessage?: string) => Promise<void>;
  handlePttDown: () => Promise<void>;
  handlePttUp: () => Promise<void>;
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  fullVoiceMode: boolean;
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
  handlePlayTTS: (
    index: number,
    text: string,
    bypassSummary?: boolean,
  ) => Promise<void>;
}

export default function ChatInputArea({
  activeFlow,
  inputText,
  setInputText,
  isRecording,
  isPttCapturing,
  isPttConnecting,
  isVoiceActive,
  handleSubmit,
  handlePttDown,
  handlePttUp,
  setChatHistory,
  fullVoiceMode,
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
  handlePlayTTS,
}: ChatInputAreaProps) {
  const isAttendanceFlow =
    activeFlow === "attendance" || activeFlow === "voice_attendance";
  const pttBtnRef = useRef<HTMLButtonElement>(null);
  const isPttBusy = isPttCapturing || isRecording;
  const pttConnectingOnly = isPttConnecting && !isRecording;
  // Show the send icon only when the user has TYPED text. During push-to-talk the
  // box fills with the live transcript, so we keep the mic icon while capturing.
  const showSend = inputText.trim().length > 0 && !isPttBusy;
  // The upload icon only does something in these flows; hide it otherwise so the
  // default view shows just the mic (file-upload functionality is unchanged).
  const canUpload =
    activeFlow === "attendance" ||
    activeFlow === "assignment" ||
    activeFlow === "message" ||
    activeFlow === "submission";

  const releasePttPointer = (e: React.PointerEvent) => {
    const btn = pttBtnRef.current;
    if (btn?.hasPointerCapture(e.pointerId)) {
      btn.releasePointerCapture(e.pointerId);
    }
  };

  const handlePttPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isPttConnecting && !isPttCapturing) return;
    // Pointer capture keeps pointerup/cancel on this button even if the finger
    // slides. Some Android/iOS WebViews throw or no-op here — PTT must still work,
    // so guard it and rely on the up/cancel/lost-capture handlers below.
    try {
      pttBtnRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported in this WebView — ignore */
    }
    void handlePttDown();
  };

  const handlePttPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    releasePttPointer(e);
    // Call unconditionally: handlePttUp self-guards via isPttCapturingRef.
    // Gating on the isPttCapturing STATE here can skip submit on a fast
    // press→release because state lags a render behind the ref.
    void handlePttUp();
  };

  const handlePttPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    releasePttPointer(e);
    void handlePttUp();
  };

  // Safety net: if a WebView drops pointer capture without firing pointerup
  // (observed on some Android/iOS in-app browsers), still release so the mic
  // can never get stuck on. handlePttUp self-guards, so this is a no-op after a
  // normal release.
  const handlePttLostCapture = () => {
    void handlePttUp();
  };

  const inputPlaceholder = isPttBusy
    ? isVoiceActive
      ? "Listening… speak now"
      : pttConnectingOnly
        ? "Connecting microphone…"
        : "Hold mic and speak… release to send"
    : isAttendanceFlow
      ? "Class info, student names, or type here..."
      : "Ask me anything!";

  return (
    <div
      className={`chatbot-input-area ${isAttendanceFlow ? "chatbot-input-area-attendance" : ""}`}
    >
      <div className="relative">
        <input
          type="file"
          accept={
            activeFlow === "assignment" ||
            activeFlow === "message" ||
            activeFlow === "submission"
              ? ".pdf,.doc,.docx,image/*"
              : ".xlsx,.xls,.csv,image/*"
          }
          id="file-upload-input"
          className="hidden"
          disabled={
            activeFlow !== "attendance" &&
            activeFlow !== "assignment" &&
            activeFlow !== "message" &&
            activeFlow !== "submission"
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
            } else if (activeFlow === "message") {
              await handleMessageFileUpload({
                file,
                sessionId,
                userId,
                isVoiceTriggered:
                  fullVoiceMode || activeVoiceButtonRef.current !== null,
                getErpContext,
                appendBotMessage: (msg) =>
                  setChatHistory((prev) => [...prev, msg]),
                playTTS: (idx, text) => void handlePlayTTS(idx, text, true),
                getTTSSummary: (text) => text,
              });
            } else if (activeFlow === "submission") {
              await handleSubmissionFileUpload({
                file,
                sessionId,
                userId,
                getErpContext,
                isVoiceTriggered: activeVoiceButtonRef.current !== null,
                appendBotMessage: (msg) =>
                  setChatHistory((prev) => [...prev, msg]),
                playTTS: (idx, text) => void handlePlayTTS(idx, text, true),
              });
            }
            e.target.value = "";
          }}
        />
        {canUpload && (
        <motion.label
          htmlFor={
            activeFlow === "attendance" ||
            activeFlow === "assignment" ||
            activeFlow === "message" ||
            activeFlow === "submission"
              ? "file-upload-input"
              : undefined
          }
          className={`chatbot-btn upload-btn w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl ${
            activeFlow === "attendance" ||
            activeFlow === "assignment" ||
            activeFlow === "message" ||
            activeFlow === "submission"
              ? "cursor-pointer"
              : "cursor-not-allowed"
          }`}
          whileHover={
            activeFlow === "attendance" ||
            activeFlow === "assignment" ||
            activeFlow === "message" ||
            activeFlow === "submission"
              ? { scale: 1.08, y: -2 }
              : {}
          }
          whileTap={
            activeFlow === "attendance" ||
            activeFlow === "assignment" ||
            activeFlow === "message" ||
            activeFlow === "submission"
              ? { scale: 0.95 }
              : {}
          }
          title={
            activeFlow === "attendance"
              ? "Upload Excel or Image"
              : activeFlow === "assignment"
                ? "Upload Assignment File (PDF, DOCX, Image)"
                : activeFlow === "message"
                  ? "Upload Message Attachment (PDF, DOCX, Image)"
                  : activeFlow === "submission"
                    ? "Upload Submission File"
                    : "Enable assignment or attendance flow to upload"
          }
          onClick={(e) => {
            if (
              activeFlow !== "attendance" &&
              activeFlow !== "assignment" &&
              activeFlow !== "message" &&
              activeFlow !== "submission"
            ) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <FiUpload />
        </motion.label>
        )}
      </div>

      <div className="chatbot-input-wrap flex-1 min-w-0 relative">
        <input
          type="text"
          placeholder={inputPlaceholder}
          value={inputText}
          onChange={(e) => {
            if (!isPttBusy) setInputText(e.target.value);
          }}
          onKeyDown={(e) =>
            e.key === "Enter" && !isPttBusy && void handleSubmit()
          }
          readOnly={isPttBusy}
          aria-live={isPttBusy ? "polite" : "off"}
          aria-label={
            isPttBusy ? "Live voice transcript" : "Message input"
          }
          className={`chatbot-input text-base sm:text-lg px-3 py-2 sm:px-4 sm:py-3 min-h-[40px] sm:min-h-[48px] w-full${
            isPttBusy ? " ptt-input-capturing" : ""
          }${isVoiceActive ? " ptt-input-voice-active" : ""}`}
        />
        {isPttBusy && (
          <span
            className={`ptt-live-badge${isVoiceActive ? " ptt-live-badge-active" : ""}`}
            aria-hidden="true"
          >
            {isVoiceActive ? "● Live" : isRecording ? "Mic on" : "…"}
          </span>
        )}
      </div>

      {showSend ? (
        <button
          onClick={() => void handleSubmit()}
          className="chatbot-btn send"
          title="Send Message"
          disabled={isPttBusy}
        >
          <FiSend />
        </button>
      ) : (
        <button
          ref={pttBtnRef}
          type="button"
          className={`chatbot-btn chatbot-btn-ptt w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl flex items-center justify-center${
            isPttBusy ? " ptt-active" : ""
          }${pttConnectingOnly ? " ptt-connecting" : ""}${
            isVoiceActive ? " ptt-voice-active" : ""
          }`}
          title={
            pttConnectingOnly
              ? "Connecting microphone…"
              : isPttBusy
                ? "Release to send"
                : "Hold to speak (Push-to-Talk)"
          }
          aria-pressed={isPttBusy}
          onPointerDown={handlePttPointerDown}
          onPointerUp={handlePttPointerUp}
          onPointerCancel={handlePttPointerCancel}
          onLostPointerCapture={handlePttLostCapture}
          onContextMenu={(e) => e.preventDefault()}
        >
          {pttConnectingOnly ? <FiLoader /> : <FiMic />}
        </button>
      )}
    </div>
  );
}
