import { useMemo, useRef, useEffect } from "react";
import { FiMessageCircle } from "react-icons/fi";
import ScreenHeader from "./ScreenHeader";
import AiMascot from "./AiMascot";
import VoiceActivePanel from "./VoiceActivePanel";
import BottomControlBar from "./BottomControlBar";
import VoiceResponseCard from "./VoiceResponseCard";
import { usePttButtonHandlers } from "../hooks/usePttButtonHandlers";

interface VoiceViewProps {
  onBack: () => void;
  onOpenChat: () => void;
  transcript: string;
  isCapturing: boolean;
  isConnecting: boolean;
  isListening: boolean;
  isProcessing: boolean;
  handlePttDown: () => Promise<void> | void;
  handlePttUp: () => Promise<void> | void;
  chatHistory: any[];
  ttsLoading: number | null;
  handlePlayTTS: (
    idx: number,
    text: string,
    isQuery?: boolean,
    uuidQuestion?: string,
    ttsContext?: import("../types").TtsQueryContext,
  ) => Promise<void>;
  handleSendFeedback: (
    idx: number,
    type: "Approved" | "Rejected",
    comment?: string,
  ) => Promise<void>;
  showCorrectionBox: number | null;
  setShowCorrectionBox: (v: number | null) => void;
  feedbackComment: { [idx: number]: string };
  setFeedbackComment: React.Dispatch<
    React.SetStateAction<{ [idx: number]: string }>
  >;
  correctionBoxRef: React.RefObject<HTMLDivElement | null>;
  onOpenPreview: (url: string, filename: string) => void;
}

export default function VoiceView({
  onBack,
  onOpenChat,
  transcript,
  isCapturing,
  isConnecting,
  isListening,
  isProcessing,
  handlePttDown,
  handlePttUp,
  chatHistory,
  ttsLoading,
  handlePlayTTS,
  handleSendFeedback,
  showCorrectionBox,
  setShowCorrectionBox,
  feedbackComment,
  setFeedbackComment,
  correctionBoxRef,
  onOpenPreview,
}: VoiceViewProps) {
  const ptt = usePttButtonHandlers({
    handlePttDown,
    handlePttUp,
    isConnecting,
    isCapturing,
  });

  const active = isCapturing || isConnecting;
  const scrollRef = useRef<HTMLDivElement>(null);

  const isRenderableBot = (m: any) =>
    m?.type === "bot" &&
    (m.answer ||
      m.text ||
      m.kpi_cards?.length ||
      m.findings?.length ||
      m.table_data?.rows?.length ||
      m.visualization?.show_chart);

  // Full conversation (all questions + answers) for the voice screen.
  const conversation = useMemo(
    () =>
      chatHistory
        .map((m, i) => ({ m, i }))
        .filter(
          ({ m }) =>
            (m?.type === "user" && m.text) || isRenderableBot(m),
        ),
    [chatHistory],
  );

  const hasConversation = chatHistory.some((m) => m?.type === "user");

  // Keep the newest exchange in view as answers stream in.
  useEffect(() => {
    if (active) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.length, isProcessing, active]);

  return (
    <div className="chatbot-screen">
      <ScreenHeader title="Voice Chat AI" onBack={onBack} />

      <div className="voice-view-body">
        {active ? (
          <VoiceActivePanel transcript={transcript} isListening={isListening} />
        ) : isProcessing ? (
          <div className="voice-view-center">
            <AiMascot size={150} />
            <div className="voice-processing">
              <div className="typing-dots" aria-label="Thinking">
                <span />
                <span />
                <span />
              </div>
              <span className="thinking-text">SchoolOS AI is thinking…</span>
            </div>
          </div>
        ) : hasConversation ? (
          <div className="voice-response-scroll" ref={scrollRef}>
            {conversation.map(({ m, i }) =>
              m.type === "user" ? (
                <div key={i} className="voice-question-row">
                  <span className="voice-question-bubble">{m.text}</span>
                </div>
              ) : (
                <VoiceResponseCard
                  key={i}
                  message={m}
                  index={i}
                  ttsLoading={ttsLoading}
                  handlePlayTTS={handlePlayTTS}
                  handleSendFeedback={handleSendFeedback}
                  showCorrectionBox={showCorrectionBox}
                  setShowCorrectionBox={setShowCorrectionBox}
                  feedbackComment={feedbackComment}
                  setFeedbackComment={setFeedbackComment}
                  correctionBoxRef={correctionBoxRef}
                  onOpenPreview={onOpenPreview}
                />
              ),
            )}
          </div>
        ) : (
          <div className="voice-view-center">
            <AiMascot size={200} />
            <p className="voice-view-instruction">
              Press and hold the microphone below, speak your question, then
              release to send.
            </p>
            <div className="voice-view-steps" aria-label="How to use voice chat">
              <span className="voice-view-step">
                <strong>1</strong> Hold mic
              </span>
              <span className="voice-view-step">
                <strong>2</strong> Speak
              </span>
              <span className="voice-view-step">
                <strong>3</strong> Release
              </span>
            </div>
          </div>
        )}
      </div>

      <BottomControlBar
        micRef={ptt.btnRef}
        isCapturing={isCapturing}
        isConnecting={isConnecting}
        onPointerDown={ptt.onPointerDown}
        onPointerUp={ptt.onPointerUp}
        onPointerCancel={ptt.onPointerCancel}
        onLostPointerCapture={ptt.onLostPointerCapture}
        leftSlot={
          <button
            type="button"
            className="bottom-control-side-btn"
            onClick={onOpenChat}
            aria-label="Continue in chat"
            title="Continue in chat"
          >
            <FiMessageCircle size={22} />
          </button>
        }
      />
    </div>
  );
}
