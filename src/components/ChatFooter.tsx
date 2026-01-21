import React, { useRef } from "react";
import { FiCrosshair, FiMic, FiMicOff, FiSend, FiUpload } from "react-icons/fi";

export interface FooterButton {
    icon: React.ReactNode;
    tooltip: string;
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    className?: string;
}

interface ChatFooterProps {
    inputValue: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onMicClick?: () => void;
    onUploadClick?: () => void;
    isRecording?: boolean;
    isProcessing?: boolean;
    isConnected?: boolean;
    inputPlaceholder?: string;
    children?: React.ReactNode;
    chatType?: string;
}

export const ChatFooter: React.FC<ChatFooterProps> = ({
    inputValue,
    onInputChange,
    onSend,
    onMicClick,
    onUploadClick,
    isRecording = false,
    isProcessing = false,
    isConnected = false,
    inputPlaceholder = "Ask me anything!",
    chatType = "text",
    children,
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !isRecording && !isProcessing) {
            e.preventDefault();
            onSend();
        }
    };

    return (
        <div className="chatbot-input-area">
        
            <input
                type="text"
                placeholder={inputPlaceholder}
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="chatbot-input text-base sm:text-lg px-3 py-2 sm:px-4 sm:py-3 min-h-[40px] sm:min-h-[48px]"
                disabled={isRecording || isProcessing}
            />

            {/* File Upload Input - Hidden */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={(e) => {
                    if (e.target.files?.[0]) {
                        onUploadClick?.();
                    }
                }}
            />

            {/* Mic Button - Only show when onMicClick is provided (connected) */}
            {onMicClick && (
                <button
                    onClick={() => {
                        onMicClick();
                    }}
                    className={`chatbot-btn mic${isRecording ? " recording" : ""}${!isRecording ? " streaming" : ""}`}
                    title={isRecording ? "Stop Recording" : "Start Recording"}
                    disabled={isProcessing}
                >
                    {isRecording ? <FiMicOff /> : <FiMic />}
                </button>
            )}

            {/* Upload Button */}
            {onUploadClick && (
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="chatbot-btn upload-btn"
                    title="Upload File"
                    disabled={isRecording || isProcessing}
                >
                    <FiUpload />
                </button>
            )}

            {/* TEXT CHAT: Show Send button */}
            {chatType === "text" && (
                <button
                    onClick={onSend}
                    className="chatbot-btn send-btn"
                    title="Send Message"
                    disabled={
                        isRecording ||
                        isProcessing ||
                        inputValue.trim().length === 0
                    }
                >
                    <FiSend />
                </button>
            )}

            {/* VOICE CHAT: Show Connect/Disconnect button based on connection status */}
            {chatType === "voice" && (
                <>
                    {!isConnected ? (
                        <button
                            onClick={onSend}
                            className="chatbot-btn connect-btn"
                            title="Connect to Bot"
                            disabled={isProcessing}
                        >
                            <FiMic />
                        </button>
                    ) : (
                        <button
                            onClick={onSend}
                            className="chatbot-btn disconnect-btn"
                            title="Disconnect from Bot"
                            disabled={isProcessing}
                        >
                            <FiCrosshair />
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default ChatFooter;
