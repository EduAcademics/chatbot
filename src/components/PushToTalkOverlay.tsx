import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiLoader, FiMic } from "react-icons/fi";

export type PttPhase = "connecting" | "listening" | "sending";

interface PushToTalkOverlayProps {
  phase: PttPhase;
  finalText: string;
  interimText: string;
  isVoiceActive: boolean;
  containerEl: HTMLElement | null;
}

function SoundRipples({ active }: { active: boolean }) {
  return (
    <div
      className={`ptt-sound-ripples ${active ? "ptt-sound-ripples--active" : ""}`}
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="ptt-sound-ring"
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}
    </div>
  );
}

function LiveTranscript({
  finalText,
  interimText,
  phase,
}: {
  finalText: string;
  interimText: string;
  phase: PttPhase;
}) {
  const hasContent = finalText.trim() || interimText.trim();

  if (phase === "sending" && hasContent) {
    return (
      <p className="ptt-transcript-block">
        <span className="ptt-text-active ptt-text-sending">
          {`${finalText}${interimText ? ` ${interimText}` : ""}`.trim()}
        </span>
      </p>
    );
  }

  if (!hasContent) {
    return (
      <p className="ptt-transcript-block ptt-text-placeholder">
        {phase === "connecting" ? "Connecting…" : "Speak now…"}
      </p>
    );
  }

  return (
    <p className="ptt-transcript-block">
      {finalText.trim() && (
        <span className="ptt-text-final">{finalText.trim()}</span>
      )}
      {interimText.trim() ? (
        <>
          {finalText.trim() && " "}
          <span className="ptt-text-active">{interimText.trim()}</span>
          {phase === "listening" && (
            <span className="ptt-cursor" aria-hidden="true" />
          )}
        </>
      ) : (
        phase === "listening" && (
          <span className="ptt-cursor" aria-hidden="true" />
        )
      )}
    </p>
  );
}

export default function PushToTalkOverlay({
  phase,
  finalText,
  interimText,
  isVoiceActive,
  containerEl,
}: PushToTalkOverlayProps) {
  if (!containerEl) return null;

  const ripplesActive =
    phase === "listening" && (isVoiceActive || !!interimText.trim());

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="ptt-fullscreen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        role="dialog"
        aria-label="Voice input"
        aria-live="polite"
      >
        <div className="ptt-fullscreen-backdrop" />

        <div className="ptt-fullscreen-body">
          <div className="ptt-transcript-scroll">
            <LiveTranscript
              finalText={finalText}
              interimText={interimText}
              phase={phase}
            />
          </div>

          <div className="ptt-mic-zone">
            <SoundRipples active={ripplesActive || phase === "connecting"} />
            <div
              className={`ptt-mic-button ${phase === "sending" ? "ptt-mic-button--sending" : ""}`}
            >
              {phase === "connecting" ? (
                <FiLoader size={28} className="ptt-mic-spinner" />
              ) : (
                <FiMic size={28} />
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    containerEl,
  );
}
