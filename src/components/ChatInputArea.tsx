/**
 * Chat input area: text input, push-to-talk mic, send on typed text.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiMic, FiSend } from "react-icons/fi";
import PushToTalkOverlay, { type PttPhase } from "./PushToTalkOverlay";
import type { FlowType } from "./types";
import type {
  AttendanceFlowCallbacks,
  AttendanceState,
  ClassInfo,
} from "./flows/attendanceFlow";
import { handleAssignmentFileUpload } from "./flows/assignmentFlow";
import { handleSubmissionFileUpload } from "./flows/submissionFlow";
import { handleAttendanceImageUpload } from "./flows/attendanceFlow";

export interface ChatInputAreaProps {
  activeFlow: FlowType;
  inputText: string;
  setInputText: (v: string | ((prev: string) => string)) => void;
  isRecording: boolean;
  fullVoiceMode: boolean;
  isFullVoiceConnecting: boolean;
  setFullVoiceMode: (v: boolean) => void;
  isVoiceActive: boolean;
  voiceFinalText: string;
  voiceInterimText: string;
  handleSubmit: (overrideMessage?: string) => Promise<void>;
  startStreaming: (useFullVoice?: boolean) => Promise<void>;
  stopStreaming: (
    skipSubmit?: boolean,
    keepWarmConnection?: boolean,
  ) => Promise<void>;
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
  fullVoiceMode: _fullVoiceMode,
  isFullVoiceConnecting,
  setFullVoiceMode: _setFullVoiceMode,
  isVoiceActive,
  voiceFinalText,
  voiceInterimText,
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
  handlePlayTTS,
}: ChatInputAreaProps) {
  const isAttendanceFlow =
    activeFlow === "attendance" || activeFlow === "voice_attendance";
  const [isMicHeld, setIsMicHeld] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(
    null,
  );
  const [snapshotText, setSnapshotText] = useState({
    final: "",
    interim: "",
  });

  const isPtTSessionRef = useRef(false);
  const endInProgressRef = useRef(false);
  const releaseListenerRef = useRef<(() => void) | null>(null);

  const showSend = inputText.trim().length > 0 && !isMicHeld && !isSendingVoice;
  const showPttOverlay = isMicHeld || isSendingVoice;

  const pttPhase: PttPhase = isSendingVoice
    ? "sending"
    : isRecording
      ? "listening"
      : "connecting";

  const overlayFinalText = isSendingVoice
    ? snapshotText.final
    : voiceFinalText;
  const overlayInterimText = isSendingVoice
    ? snapshotText.interim
    : voiceInterimText;

  useEffect(() => {
    setOverlayContainer(
      document.querySelector(".chatbot-container") as HTMLElement | null,
    );
  }, []);

  const detachReleaseListeners = useCallback(() => {
    if (releaseListenerRef.current) {
      releaseListenerRef.current();
      releaseListenerRef.current = null;
    }
  }, []);

  const endPushToTalk = useCallback(async () => {
    if (!isMicHeld || endInProgressRef.current) return;
    detachReleaseListeners();
    endInProgressRef.current = true;
    setIsMicHeld(false);

    setSnapshotText({
      final: voiceFinalText,
      interim: voiceInterimText,
    });
    setIsSendingVoice(true);

    await new Promise((r) => setTimeout(r, 320));

    try {
      await stopStreaming(false);
    } finally {
      isPtTSessionRef.current = false;
      await new Promise((r) => setTimeout(r, 450));
      setIsSendingVoice(false);
      setSnapshotText({ final: "", interim: "" });
      endInProgressRef.current = false;
    }
  }, [
    detachReleaseListeners,
    isMicHeld,
    stopStreaming,
    voiceFinalText,
    voiceInterimText,
  ]);

  const beginPushToTalk = useCallback(async () => {
    if (isMicHeld || isSendingVoice || isFullVoiceConnecting) return;

    isPtTSessionRef.current = true;
    setIsMicHeld(true);
    setInputText("");
    activeVoiceButtonRef.current = "mic";

    const onRelease = () => {
      void endPushToTalk();
    };

    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    releaseListenerRef.current = () => {
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
    };

    try {
      await startStreaming(false);
    } catch {
      detachReleaseListeners();
      isPtTSessionRef.current = false;
      setIsMicHeld(false);
      activeVoiceButtonRef.current = null;
    }
  }, [
    activeVoiceButtonRef,
    detachReleaseListeners,
    endPushToTalk,
    isFullVoiceConnecting,
    isMicHeld,
    isSendingVoice,
    setInputText,
    startStreaming,
  ]);

  useEffect(() => {
    const onWindowBlur = () => {
      if (isMicHeld) void endPushToTalk();
    };
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      detachReleaseListeners();
    };
  }, [detachReleaseListeners, endPushToTalk, isMicHeld]);

  const canUpload =
    activeFlow === "attendance" ||
    activeFlow === "assignment" ||
    activeFlow === "submission";

  const placeholder = isAttendanceFlow
    ? "Class info or student names…"
    : "Message";

  return (
    <>
      {showPttOverlay && (
        <PushToTalkOverlay
          phase={pttPhase}
          finalText={overlayFinalText}
          interimText={overlayInterimText}
          isVoiceActive={isVoiceActive}
          containerEl={overlayContainer}
        />
      )}

      <div
        className={`chatbot-input-wrapper ${showPttOverlay ? "chatbot-input-wrapper--hidden" : ""}`}
      >
        <div
          className={`chatbot-input-area ${isAttendanceFlow ? "chatbot-input-area-attendance" : ""}`}
        >
          <input
            type="file"
            accept={
              activeFlow === "assignment" || activeFlow === "submission"
                ? ".pdf,.doc,.docx,image/*"
                : ".xlsx,.xls,.csv,image/*"
            }
            id="file-upload-input"
            className="sr-only"
            disabled={!canUpload}
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

          <div className="chatbot-input-row">
            <div className="chatbot-input-pill">
              <input
                type="text"
                placeholder={placeholder}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isRecording && handleSubmit()
                }
                className="chatbot-input"
              />
            </div>

            <div className="chatbot-action-slot">
              <AnimatePresence initial={false}>
                {showSend ? (
                  <motion.button
                    key="send"
                    onClick={() => handleSubmit()}
                    className="chatbot-action-btn send"
                    initial={{ opacity: 0, scale: 0.88, rotate: -30 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.88, rotate: 30 }}
                    transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
                    whileHover={{
                      scale: 1.05,
                      transition: { duration: 0.1 },
                    }}
                    whileTap={{ scale: 0.92, transition: { duration: 0.07 } }}
                    title="Send message"
                  >
                    <FiSend size={22} />
                  </motion.button>
                ) : (
                  <motion.button
                    key="mic"
                    className={`chatbot-action-btn mic ${isMicHeld ? "mic-held" : ""}`}
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.88 }}
                    transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
                    whileHover={{
                      scale: 1.05,
                      transition: { duration: 0.1 },
                    }}
                    whileTap={{ scale: 0.92, transition: { duration: 0.07 } }}
                    title="Hold to speak"
                    disabled={isFullVoiceConnecting || isSendingVoice}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      void beginPushToTalk();
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ touchAction: "none" }}
                  >
                    <FiMic size={22} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
