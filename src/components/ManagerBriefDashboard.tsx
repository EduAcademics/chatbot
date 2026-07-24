import { useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClipboard,
  FiClock,
  FiDownload,
  FiEye,
  FiHeart,
  FiShield,
  FiTruck,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
import { MdOutlineSchool, MdOutlineAccountBalanceWallet } from "react-icons/md";
import type { IconType } from "react-icons";
import type { ActionOption } from "./types";
import PaginatedDataTable from "./PaginatedDataTable";
import ActionEngine from "./ActionEngine";
import KpiCardRow from "./KpiCardRow";
import type {
  ManagerBriefAction,
  ManagerBriefPayload,
  ManagerBriefSection,
  ManagerBriefBarChart,
  StatusKind,
} from "../types/managerBriefTypes";
import { STATUS_LABELS, statusClass } from "../types/managerBriefTypes";
import { narrativeToBullets } from "../utils/resolveManagerBrief";
import { downloadMultiTableXls, downloadTableXls } from "./utils/exportTableCsv";

const ICONS: Record<string, IconType> = {
  wallet: MdOutlineAccountBalanceWallet,
  graduation: MdOutlineSchool,
  users: FiUsers,
  clipboard: FiClipboard,
  bus: FiTruck,
  shield: FiShield,
  heart: FiHeart,
};

const STATUS_ICONS: Record<StatusKind, IconType> = {
  on_track: FiCheckCircle,
  watch: FiClock,
  urgent: FiAlertCircle,
  no_data: FiXCircle,
};

function SummaryBullets({ bullets }: { bullets: string[] }) {
  const items = bullets.map((b) => b.trim()).filter(Boolean);
  if (!items.length) return null;

  return (
    <ul className="bp-bullet-list">
      {items.map((bullet, i) => (
        <li key={i}>{bullet}</li>
      ))}
    </ul>
  );
}

function SummaryText({
  text,
  highlights,
}: {
  text: string;
  highlights?: string[];
}) {
  const alerts = highlights ?? [];
  if (!alerts.length) {
    return <p className="bp-narrative">{text}</p>;
  }

  let html = text;
  for (const alert of alerts) {
    html = html.replace(
      new RegExp(alert.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      `|||${alert}|||`,
    );
  }

  const chunks = html.split("|||").filter(Boolean);
  return (
    <p className="bp-narrative">
      {chunks.map((chunk, i) =>
        alerts.some((a) => a.toLowerCase() === chunk.toLowerCase()) ? (
          <span key={i} className="bp-narrative-alert">
            {chunk}
          </span>
        ) : (
          <span key={i}>{chunk}</span>
        ),
      )}
    </p>
  );
}

function StatusBadge({ kind, label }: { kind: StatusKind; label?: string }) {
  const Icon = STATUS_ICONS[kind];
  return (
    <span className={`bp-status-badge ${statusClass(kind)}`}>
      <Icon className="bp-status-icon" />
      {label ?? STATUS_LABELS[kind]}
    </span>
  );
}

function MetricBarChart({ metrics }: { metrics: ManagerBriefSection["metrics"] }) {
  const chartMetrics = (metrics ?? [])
    .filter((m) => m.numeric && m.numeric > 0)
    .slice(0, 5);
  if (chartMetrics.length < 2) return null;

  const max = Math.max(...chartMetrics.map((m) => m.numeric ?? 0));

  return (
    <div className="bp-bar-chart">
      {chartMetrics.map((m) => {
        const pct = max > 0 ? ((m.numeric ?? 0) / max) * 100 : 0;
        const shortLabel = m.label
          .replace(/\(session snapshot\)/i, "")
          .replace(/\(.*?\)/g, "")
          .trim()
          .split(" ")
          .slice(0, 2)
          .join(" ");
        return (
          <div key={m.label} className="bp-bar-row">
            <div className="bp-bar-label">{shortLabel}</div>
            <div className="bp-bar-track">
              <div className="bp-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="bp-bar-value">{m.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ pass, fail }: { pass: number; fail: number }) {
  const passPct = Math.min(100, Math.max(0, pass));
  return (
    <div className="bp-donut-wrap">
      <div
        className="bp-donut-ring"
        style={{
          background: `conic-gradient(#16a34a 0% ${passPct}%, #dc2626 ${passPct}% 100%)`,
        }}
        aria-hidden
      />
      <div className="bp-donut-legend">
        <span>
          <i className="bp-dot bp-dot-pass" /> Pass {pass}%
        </span>
        <span>
          <i className="bp-dot bp-dot-fail" /> Fail {fail}%
        </span>
      </div>
    </div>
  );
}

function barFillColor(pct: number): string {
  if (pct < 40) return "#dc2626";
  if (pct < 60) return "#ea580c";
  if (pct < 75) return "#ca8a04";
  return "#16a34a";
}

function L1UtilisationBarChart({ chart }: { chart: ManagerBriefBarChart }) {
  const items = chart.items ?? [];
  if (items.length < 2) return null;

  const threshold = chart.threshold_pct ?? 60;

  return (
    <div className="l1-bar-chart-section">
      {chart.title ? (
        <div className="l1-bar-chart-title">{chart.title.toUpperCase()}</div>
      ) : null}
      <div className="l1-bar-chart">
        {items.map((item) => (
          <div key={item.label} className="l1-bar-row">
            <div className="l1-bar-label" title={item.label}>
              {item.label}
            </div>
            <div className="l1-bar-track-wrap">
              <div className="l1-bar-track">
                <div
                  className="l1-bar-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, item.value))}%`,
                    backgroundColor: barFillColor(item.value),
                  }}
                />
                {threshold > 0 ? (
                  <div
                    className="l1-bar-threshold"
                    style={{ left: `${threshold}%` }}
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>
            <div className="l1-bar-value">{item.value.toFixed(1)}%</div>
          </div>
        ))}
      </div>
      {threshold > 0 ? (
        <div className="l1-bar-chart-footnote">
          Dashed line marks the {threshold}% utilisation threshold.
        </div>
      ) : null}
    </div>
  );
}

function CategoryDetail({ category }: { category: ManagerBriefSection }) {
  const Icon = ICONS[category.icon] ?? FiAlertTriangle;

  return (
    <div className="bp-detail-panel">
      <div className="bp-detail-header">
        <Icon className="bp-detail-icon" />
        <div className="bp-detail-header-text">
          <div className="bp-detail-title">{category.title}</div>
          <div className="bp-detail-summary">{category.summary_line}</div>
        </div>
        <StatusBadge kind={category.status} />
      </div>

      {category.metrics?.length ? (
        <div className="bp-metrics-grid">
          {category.metrics.map((metric) => (
            <div
              key={`${metric.label}-${metric.value}`}
              className={`bp-metric-card bp-metric-${metric.tone || "neutral"}`}
            >
              <div className="bp-metric-label">{metric.label}</div>
              <div className="bp-metric-value">{metric.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="bp-detail-charts">
        {category.id === "financial" || category.icon === "wallet" ? (
          <MetricBarChart metrics={category.metrics} />
        ) : null}
        {category.chart ? (
          <DonutChart pass={category.chart.pass} fail={category.chart.fail} />
        ) : null}
      </div>

      {category.remarks?.length ? (
        <ul className="bp-remarks">
          {category.remarks.map((remark) => (
            <li key={remark}>{remark}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BriefActionButton({
  action,
  tableDetail,
  multiTables,
  onViewTable,
}: {
  action: ManagerBriefAction;
  tableDetail: {
    rows: Record<string, unknown>[];
    table_meta: {
      columns: string[];
    };
  } | null;
  multiTables?: Array<{
    title?: string;
    rows: Record<string, unknown>[];
    columns: string[];
  }>;
  onViewTable: () => void;
}) {
  if (action.id === "download_xls") {
    return (
      <button
        type="button"
        className="board-pack-btn board-pack-btn-download bp-action-btn"
        onClick={() => {
          if (multiTables?.length) {
            downloadMultiTableXls(multiTables, action.filename || "query-results.xls");
            return;
          }
          if (!tableDetail) return;
          downloadTableXls(
            tableDetail.rows,
            tableDetail.table_meta.columns,
            action.filename || "query-results.xls",
          );
        }}
      >
        <FiDownload className="bp-action-icon" />
        {action.label}
      </button>
    );
  }

  if (action.id === "view_table") {
    return (
      <button
        type="button"
        className="board-pack-btn bp-action-btn"
        onClick={onViewTable}
      >
        <FiEye className="bp-action-icon" />
        {action.label}
      </button>
    );
  }

  return null;
}

interface ManagerBriefDashboardProps {
  data: ManagerBriefPayload;
  actionOptions?: ActionOption[];
}

export default function ManagerBriefDashboard({
  data,
  actionOptions,
}: ManagerBriefDashboardProps) {
  const tableCollapsedDefault = data.detail?.collapsed_default ?? false;
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showTable, setShowTable] = useState(!tableCollapsedDefault);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const showHeader = Boolean(
    data.header.eyebrow?.trim() ||
      data.header.title?.trim() ||
      data.header.meta?.trim(),
  );

  const kpiCards = (data.kpi_strip ?? []).map((k) => ({
    label: k.label,
    value: k.value,
    tone: k.tone,
  }));

  const multiTableBlocks = useMemo(() => {
    if (data.detail?.type !== "tables" || !data.detail.tables?.length) {
      return [];
    }
    return data.detail.tables
      .filter((block) => block.table_rows?.length)
      .map((block) => {
        const columns = (
          block.columns?.length
            ? block.columns
            : Object.keys(block.table_rows[0] ?? {})
        ).filter((c) => !c.startsWith("__"));
        return {
          title: block.title,
          rows: block.table_rows,
          columns,
          tableDetail: {
            rows: block.table_rows,
            table_meta: {
              total: block.table_rows.length,
              page_size: 10,
              columns,
              row_status_key: data.detail?.row_status_key,
            },
          },
        };
      });
  }, [data.detail]);

  const tableTotal =
    multiTableBlocks.reduce((sum, block) => sum + block.rows.length, 0) ||
    data.detail?.table_rows?.length ||
    0;
  const hasViewAction = (data.actions ?? []).some(
    (action) => action.id === "view_table",
  );

  const selected = useMemo(
    () => data.sections.find((c) => c.id === selectedId),
    [data.sections, selectedId],
  );

  const handleCategoryClick = (id: string) => {
    setShowBreakdown(true);
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const tableDetail =
    data.detail?.type === "table" && data.detail.table_rows?.length
      ? {
          rows: data.detail.table_rows,
          table_meta: {
            total: data.detail.table_rows.length,
            page_size: 10,
            columns: (data.detail.columns?.length
              ? data.detail.columns
              : Object.keys(data.detail.table_rows[0] ?? {})
            ).filter(
              (c) => !c.startsWith("__") && c !== data.detail?.row_status_key,
            ),
            row_status_key: data.detail.row_status_key,
          },
        }
      : null;

  const hasTableContent = Boolean(tableDetail || multiTableBlocks.length);

  return (
    <div className="board-pack-dashboard manager-brief-dashboard">
      {showHeader ? (
        <div className="bp-header">
          {data.header.eyebrow ? (
            <div className="bp-eyebrow">{data.header.eyebrow}</div>
          ) : null}
          {data.header.title ? (
            <h3 className="bp-school">{data.header.title}</h3>
          ) : null}
          {data.header.meta ? (
            <div className="bp-meta">{data.header.meta}</div>
          ) : null}
        </div>
      ) : null}

      <div className="bp-narrative-card">
        {(() => {
          const bullets =
            data.bullets?.map((b) => b.trim()).filter(Boolean) ?? [];
          const narrative = (data.narrative || "").trim();
          const intro = (data.intro || "").trim();
          const narrativeBullets =
            bullets.length || narrative
              ? bullets
              : narrativeToBullets(narrative);

          if (narrativeBullets.length && narrative) {
            return (
              <>
                {intro ? <p className="bp-narrative">{intro}</p> : null}
                <SummaryBullets bullets={narrativeBullets} />
                <p className="bp-attachment-note">{narrative}</p>
              </>
            );
          }
          if (narrativeBullets.length) {
            return (
              <>
                {intro ? <p className="bp-narrative">{intro}</p> : null}
                <SummaryBullets bullets={narrativeBullets} />
              </>
            );
          }
          if (narrative) {
            return (
              <SummaryText text={narrative} highlights={data.highlights} />
            );
          }
          return null;
        })()}
      </div>

      {data.actions?.length && hasTableContent ? (
        <div className="bp-action-row">
          {data.actions.map((action) => (
            <BriefActionButton
              key={action.id}
              action={action}
              tableDetail={tableDetail}
              multiTables={
                multiTableBlocks.length
                  ? multiTableBlocks.map((block) => ({
                      title: block.title,
                      rows: block.rows,
                      columns: block.columns,
                    }))
                  : undefined
              }
              onViewTable={() => setShowTable(true)}
            />
          ))}
        </div>
      ) : null}

      {kpiCards.length ? <KpiCardRow cards={kpiCards} /> : null}

      {data.bar_chart ? <L1UtilisationBarChart chart={data.bar_chart} /> : null}

      <div className="bp-area-list">
        {data.sections.map((cat) => {
          const Icon = ICONS[cat.icon] ?? FiAlertTriangle;
          return (
            <div key={cat.id} className="bp-area-row">
              <Icon className="bp-area-icon" />
              <div className="bp-area-body">
                <div className="bp-area-title">{cat.title}</div>
                <div className="bp-area-summary">{cat.summary_line}</div>
              </div>
              <StatusBadge kind={cat.status} />
            </div>
          );
        })}
      </div>

      {data.sections.length > 1 ? (
        <button
          type="button"
          className="bp-breakdown-toggle"
          onClick={() => setShowBreakdown((v) => !v)}
        >
          {showBreakdown ? (
            <>
              <FiChevronUp className="bp-toggle-icon" /> Hide full breakdown
            </>
          ) : (
            <>
              <FiChevronDown className="bp-toggle-icon" /> See full breakdown by
              area
            </>
          )}
        </button>
      ) : null}

      {showBreakdown && data.sections.length > 1 ? (
        <>
          <div className="bp-category-grid">
            {data.sections.map((cat) => {
              const Icon = ICONS[cat.icon] ?? FiAlertTriangle;
              const active = cat.id === selectedId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`bp-category-card ${active ? "bp-category-active" : ""}`}
                  onClick={() => handleCategoryClick(cat.id)}
                >
                  <span
                    className={`bp-category-dot ${statusClass(cat.status)}`}
                  />
                  <Icon className="bp-category-icon" />
                  <span className="bp-category-name">{cat.title}</span>
                </button>
              );
            })}
          </div>
          {selected ? <CategoryDetail category={selected} /> : null}
        </>
      ) : null}

      {hasTableContent ? (
        <>
          {tableCollapsedDefault && !hasViewAction ? (
            <button
              type="button"
              className="bp-table-toggle"
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? (
                <>
                  <FiChevronUp className="bp-toggle-icon" /> Hide full table
                </>
              ) : (
                <>
                  <FiChevronDown className="bp-toggle-icon" /> See all {tableTotal}{" "}
                  {tableTotal === 1 ? "row" : "rows"}
                </>
              )}
            </button>
          ) : null}
          {showTable ? (
            <div className="bp-table-detail">
              {multiTableBlocks.length ? (
                multiTableBlocks.map((block) => (
                  <div key={block.title || "table"} className="bp-table-block">
                    {block.title ? (
                      <h4 className="bp-table-title">{block.title}</h4>
                    ) : null}
                    <PaginatedDataTable
                      tableData={block.tableDetail}
                      downloadFilename="manager-brief-results.csv"
                      showDownload={false}
                    />
                  </div>
                ))
              ) : tableDetail ? (
                <PaginatedDataTable
                  tableData={tableDetail}
                  downloadFilename="manager-brief-results.csv"
                  showDownload={false}
                />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {data.decisions.length ? (
        <div className="bp-decisions-section">
          <div className="bp-decisions-heading">
            <FiClipboard className="bp-decisions-icon" />
            Everything that needs a decision
          </div>
          <ul className="bp-decisions-list">
            {data.decisions.map((item) => (
              <li
                key={item.id}
                className={`bp-decision-item ${statusClass(item.priority)}`}
              >
                <span
                  className={`bp-decision-dot ${statusClass(item.priority)}`}
                />
                <div className="bp-decision-body">
                  <div className="bp-decision-note">{item.note}</div>
                  <div className="bp-decision-category">{item.category}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {actionOptions?.length ? (
        <ActionEngine options={actionOptions} title="Recommended actions" />
      ) : null}
    </div>
  );
}
