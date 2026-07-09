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

export type Tone = "neutral" | "success" | "warning" | "danger";

/** Matches backend query-handler `data.visualization` contract */
export interface TableMeta {
  total: number;
  page_size: number;
  columns: string[];
  
  row_status_key?: string;
}

/** A single decision button in the L4 ActionEngine block. */
export interface ActionOption {
  id: string;
  label: string;
  icon?: string;
  tone?: Tone;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  action: string;
  severity?: Tone | "info" | "warning" | "critical";
}

export interface TableData {
  rows: Record<string, unknown>[];
  table_meta: TableMeta;
}

export interface TtsQueryContext {
  table_data?: TableData;
  findings?: string[];
  kpi_cards?: KpiCard[];
  /** Speakable summary from query-handler when tts_summary_ready is true. */
  backend_tts_text?: string;
  /** When true, backend_tts_text is production-ready (LLM or table summary). */
  tts_summary_ready?: boolean;
}

export interface KpiCard {
  label: string;
  value: string | number;
  tone?: Tone;
  
  sublabel?: string;
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
  kpi_cards?: KpiCard[];
  findings?: string[];
  ai_level?: string;
  catalog_id?: string;
  /** Pre-resolved voice summary when tts_summary_ready is true. */
  tts_text?: string;
  tts_summary_ready?: boolean;
  
  layout?: string[];
  
  action_options?: ActionOption[];
  recommendations?: Recommendation[];
  interactive_ui?: import("../types/managerBriefTypes").ManagerBriefPayload;  // 3rd-july ko add kiya
  uuid_question?: string;
  board_pack_status?: "draft" | "approved" | "rejected";
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
