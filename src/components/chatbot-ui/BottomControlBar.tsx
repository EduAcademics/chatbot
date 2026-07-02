import { motion } from "framer-motion";
import { FiMic, FiLoader } from "react-icons/fi";

interface BottomControlBarProps {
  isCapturing: boolean;
  isConnecting: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onLostPointerCapture: () => void;
  micRef?: React.Ref<HTMLButtonElement>;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  showHint?: boolean;
}

export default function BottomControlBar({
  isCapturing,
  isConnecting,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  micRef,
  leftSlot,
  rightSlot,
  showHint = true,
}: BottomControlBarProps) {
  const connectingOnly = isConnecting && !isCapturing;
  const hintText = connectingOnly
    ? "Connecting microphone…"
    : isCapturing
      ? "Release to send your message"
      : "Hold to talk";

  return (
    <div className="bottom-control-footer">
      {showHint ? (
        <p className="bottom-control-hint" aria-live="polite">
          {hintText}
        </p>
      ) : null}
      <div className="bottom-control-bar">
        {leftSlot ?? <span className="bottom-control-side-placeholder" />}

        <motion.button
          ref={micRef}
          type="button"
          className={`bottom-control-mic-btn ${
            isCapturing ? "bottom-control-mic-btn--active" : ""
          }`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onLostPointerCapture}
          onContextMenu={(e) => e.preventDefault()}
          aria-pressed={isCapturing}
          title={
            connectingOnly
              ? "Connecting microphone…"
              : isCapturing
                ? "Release to send"
                : "Hold to talk"
          }
          whileTap={{ scale: 0.94 }}
        >
          {isCapturing && (
            <motion.span
              className="bottom-control-mic-ring"
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          {connectingOnly ? (
            <FiLoader size={26} className="animate-spin" />
          ) : (
            <FiMic size={28} />
          )}
        </motion.button>

        {rightSlot ?? <span className="bottom-control-side-placeholder" />}
      </div>
    </div>
  );
}
