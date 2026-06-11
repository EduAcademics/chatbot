export type TabType = "answer" | "references" | "query";

export type FlowType =
  | "none"
  | "query"
  | "faq"
  | "attendance"
  | "voice_attendance"
  | "full_voice_attendance"
  | "leave"
  | "leave_approval"
  | "assignment"
  | "submission"
  | "review"
  | "marks"
  | "health_card"
  | "teacher_diary"
  | "course_progress"
  | "_legacy_attendance_disabled"
  | "_legacy_voice_attendance_disabled";

export type ChartType = "bar" | "line" | "pie" | "table" | "none";

/** Matches backend query-handler `data.visualization` contract */
export interface TableMeta {
  total: number;
  page_size: number;
  columns: string[];
}

export interface TableData {
  rows: Record<string, unknown>[];
  table_meta: TableMeta;
}

export interface Visualization {
  show_chart: boolean;
  chart_type: ChartType;
  title: string;
  x_key: string | null;
  y_key: string | null;
  payload: Record<string, unknown>[];
  reason: string;
  /** Non-holiday working day count for attendance % denominator */
  attendance_working_days?: number | null;
}

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
  visualization?: Visualization;
  table_data?: TableData;
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

import { WS_BASE_URL } from "../config/settings";
export const WS_BASE = WS_BASE_URL;
