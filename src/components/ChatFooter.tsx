import React from "react";
import { motion } from "framer-motion";
import { FiMic, FiMicOff, FiSend, FiUpload, FiVoicemail } from "react-icons/fi";
import type { FlowType } from "./types";

export interface ChatFooterProps {
  activeFlow: FlowType;
  inputText: string;
  onInputTextChange: (value: string) => void;
  onSubmit: () => void;
  // In default mode: "recording" means STT recording.
  // In voice mode: "recording" means mic is enabled.
  isRecording: boolean;
  onToggleMic: () => void;
  onFileSelected: (file: File) => void | Promise<void>;
  onStartVoiceMode: () => void;
  onStopVoiceMode: () => void;
  isVoiceMode?: boolean;
}

export const ChatFooter: React.FC<ChatFooterProps> = ({
  activeFlow,
  inputText,
  onInputTextChange,
  onSubmit,
  isRecording,
  onToggleMic,
  onFileSelected,
  onStartVoiceMode,
  onStopVoiceMode,
  isVoiceMode = false,
}) => {
  const hasTypedText = inputText.trim().length > 0;
  const showSend = !isVoiceMode && (hasTypedText || isRecording);
  const showStartVoiceMode = !isVoiceMode && !showSend;

  return (
    <div className="chatbot-input-area">
      {!isVoiceMode && (
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
          disabled={activeFlow !== "attendance" && activeFlow !== "assignment"}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await onFileSelected(file);
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
            if (activeFlow !== "attendance" && activeFlow !== "assignment") {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <FiUpload />
        </motion.label>
        </div>
      )}

      <input
        type="text"
        placeholder="Ask me anything!"
        value={inputText}
        onChange={(e) => onInputTextChange(e.target.value)}
        onKeyDown={(e) => {
          // In voice mode, Enter should not trigger connect/disconnect or "send".
          if (isVoiceMode) return;
          if (e.key === "Enter" && !isRecording) onSubmit();
        }}
        className="chatbot-input text-base sm:text-lg px-3 py-2 sm:px-4 sm:py-3 min-h-[40px] sm:min-h-[48px]"
        disabled={!isVoiceMode && isRecording}
      />

      {!isVoiceMode && (
        <>
          <button
            onClick={onToggleMic}
            className={`chatbot-btn mic w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl${
              isRecording ? " recording" : ""
            }`}
            title={isRecording ? "Stop Recording" : "Start Recording"}
          >
            {isRecording ? <FiMicOff /> : <FiMic />}
          </button>

          {showSend && (
            <button
              onClick={onSubmit}
              className="chatbot-btn send"
              title="Send Message"
              disabled={isRecording}
            >
              <FiSend />
            </button>
          )}

          {showStartVoiceMode && (
            <button
              onClick={onStartVoiceMode}
              className="chatbot-btn send"
              title="Start Voice Mode"
            >
              <FiVoicemail />
            </button>
          )}
        </>
      )}

      {isVoiceMode && (
        <>
          <button
            onClick={onStopVoiceMode}
            className="chatbot-btn send"
            title="Stop Voice Mode"
          >
            X
          </button>
          <button
            onClick={onToggleMic}
            className={`chatbot-btn mic w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl${
              isRecording ? " recording" : ""
            }`}
            title={isRecording ? "Mic Off" : "Mic On"}
          >
            {isRecording ? <FiMic /> : <FiMicOff />}
          </button>
        </>
      )}
    </div>
  );
};

export default ChatFooter;
