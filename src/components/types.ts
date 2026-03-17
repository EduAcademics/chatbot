export type TabType = "answer" | "references" | "query";

export type FlowType =
  | "none"
  | "query"
  | "attendance"
  | "voice_attendance"
  | "full_voice_attendance"
  | "leave"
  | "leave_approval"
  | "assignment"
  | "submission"
  | "review"
  | "course_progress"
  | "_legacy_attendance_disabled"
  | "_legacy_voice_attendance_disabled";

export interface ClassSectionOption {
  classId: string;
  sectionId: string;
  className?: string;
  sectionName?: string;
}

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
  classSections?: any[];
  courseProgress?: any;
  classSection?: ClassSectionOption;
  classSectionsOptions?: any[];
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
