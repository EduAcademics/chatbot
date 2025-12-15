export type TabType = "answer" | "references" | "query";
export type FlowType = "none" | "query" | "attendance" | "voice_attendance" | "full_voice_attendance";

export interface ChatMessage {
  type: "user" | "bot";
  text?: string;
  answer?: string;
  references?: any[];
  mongodbquery?: string[];
  activeTab?: TabType;
  feedback?: "Approved" | "Rejected";
  feedbackMessage?: string;
  attendance_summary?: any[];
  class_info?: any;
  buttons?: { label: string; action: () => void }[];
  bulkattandance?: boolean;
  finish_collecting?: boolean;
  voice_processed?: boolean;
  isProcessing?: boolean;
  isBeingEdited?: boolean;
}

export interface ClassInfo {
  class_: string;
  section: string;
  date: string;
}

export interface AttendanceData {
  student_name: string;
  attendance_status: string;
}

export const LANGUAGES = [
  { label: "Auto Detect", value: "auto" },
  { label: "English (US)", value: "en-US" },
  { label: "Hindi (India)", value: "hi-IN" },
  { label: "Marathi (India)", value: "mr-IN" },
] as const;

export const WS_BASE = import.meta.env.VITE_WS_BASE_URL;

