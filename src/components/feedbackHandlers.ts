import React from "react";
import { aiAPI } from "../services/api";
import { ChatMessage } from "./types";

export const handlePlayTTS = async (
  idx: number,
  text: string,
  setTtsLoading: (idx: number | null) => void
) => {
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

export const getThumbsUpClass = (msg: ChatMessage): string => {
  return msg.feedback === "Approved" ? "bot-action-btn thumbs-up-active" : "bot-action-btn";
};

export const getThumbsDownClass = (msg: ChatMessage): string => {
  return msg.feedback === "Rejected" ? "bot-action-btn thumbs-down-active" : "bot-action-btn";
};

export const handleSendFeedback = async (
  idx: number,
  type: "Approved" | "Rejected",
  comment: string | undefined,
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setFeedbackComment: React.Dispatch<React.SetStateAction<{ [idx: number]: string }>>,
  setShowCorrectionBox: React.Dispatch<React.SetStateAction<number | null>>,
  aiAPI: any
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

