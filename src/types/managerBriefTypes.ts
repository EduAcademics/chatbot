/** 3rd july ko add kiya */

export type StatusKind = "on_track" | "watch" | "urgent" | "no_data";

export interface CategoryMetric {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "success" | "warning";
  numeric?: number;
}

export interface ManagerBriefSection {
  id: string;
  title: string;
  icon: string;
  summary_line: string;
  status: StatusKind;
  metrics?: CategoryMetric[];
  remarks?: string[];
  chart?: { pass: number; fail: number };
}

export interface ManagerBriefDecision {
  id: string;
  category: string;
  note: string;
  priority: StatusKind;
}

export interface ManagerBriefKpiItem {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "success" | "warning";
}

export interface ManagerBriefBarChartItem {
  label: string;
  value: number;
}

export interface ManagerBriefBarChart {
  title?: string;
  items: ManagerBriefBarChartItem[];
  threshold_pct?: number;
}

export interface ManagerBriefAction {
  id: "download_xls" | "view_table" | string;
  label: string;
  filename?: string;
}

export interface ManagerBriefPayload {
  template: "manager_brief";
  header: {
    eyebrow: string;
    title: string;
    meta?: string;
  };
  narrative: string;
  intro?: string;
  highlights?: string[];
  bullets?: string[];
  kpi_strip?: ManagerBriefKpiItem[];
  bar_chart?: ManagerBriefBarChart;
  sections: ManagerBriefSection[];
  decisions: ManagerBriefDecision[];
  footer?: string | null;
  actions?: ManagerBriefAction[];
  detail?: {
    type: "none" | "table";
    table_rows?: Record<string, unknown>[];
    columns?: string[];
    row_status_key?: string;
    collapsed_default?: boolean;
  };
}

export const STATUS_LABELS: Record<StatusKind, string> = {
  on_track: "On track",
  watch: "Keep an eye on it",
  urgent: "Needs attention now",
  no_data: "No data linked",
};

export function statusClass(kind: StatusKind): string {
  return `bp-status-${kind}`;
}
