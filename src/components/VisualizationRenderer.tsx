import type { Visualization } from "./types";

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

export default function VisualizationRenderer({
  visualization,
}: {
  visualization: Visualization;
}) {
  if (!visualization.show_chart || visualization.chart_type === "none") {
    return null;
  }

  const { payload, title, chart_type, x_key, y_key } = visualization;

  if (!payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first || typeof first !== "object") {
    return null;
  }

  if (chart_type === "table") {
    const keys = Object.keys(first);
    if (keys.length === 0) return null;
    return (
      <div className="mt-4 w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/80">
        {title ? (
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-800">
            {title}
          </div>
        ) : null}
        <table className="min-w-full text-left text-xs text-slate-800 sm:text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              {keys.map((k) => (
                <th key={k} className="px-3 py-2 font-semibold">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.map((row, i) => (
              <tr
                key={i}
                className={i % 2 === 0 ? "bg-white" : "bg-slate-50/90"}
              >
                {keys.map((k) => (
                  <td key={k} className="px-3 py-2 align-top">
                    {cellText((row as Record<string, unknown>)[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!x_key || !y_key) {
    return null;
  }

  const rows = payload.filter(
    (r) => r && typeof r === "object" && x_key in r && y_key in r,
  ) as Record<string, unknown>[];

  if (rows.length === 0) {
    return null;
  }

  const pairs = rows.map((r) => ({
    label: cellText(r[x_key]),
    value: numericValue(r[y_key]),
  }));

  if (pairs.some((p) => p.value === null)) {
    return null;
  }

  const values = pairs.map((p) => p.value as number);
  const maxY = Math.max(...values, 0);
  if (maxY <= 0) {
    return null;
  }

  if (chart_type === "bar") {
    return (
      <div className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        {title ? (
          <div className="mb-3 text-sm font-medium text-slate-800">{title}</div>
        ) : null}
        <div className="flex flex-col gap-2">
          {pairs.map((p, i) => (
            <div key={i} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 shrink-0 text-xs text-slate-600 sm:w-28 sm:text-sm">
                <span className="block truncate" title={p.label}>
                  {p.label}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                    style={{
                      width: `${Math.min(100, ((p.value as number) / maxY) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right text-xs font-medium tabular-nums text-slate-800 sm:w-14 sm:text-sm">
                {p.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chart_type === "line") {
    const w = 320;
    const h = 140;
    const pad = 8;
    const n = pairs.length;
    const points = pairs.map((p, i) => {
      const x = pad + (n <= 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * (w - 2 * pad));
      const y = pad + (1 - (p.value as number) / maxY) * (h - 2 * pad);
      return `${x},${y}`;
    });
    return (
      <div className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        {title ? (
          <div className="mb-2 text-sm font-medium text-slate-800">{title}</div>
        ) : null}
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto w-full max-w-md"
          role="img"
          aria-label={title || "Line chart"}
        >
          <polyline
            fill="none"
            stroke="rgb(59 130 246)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.join(" ")}
          />
          {pairs.map((p, i) => {
            const x = pad + (n <= 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * (w - 2 * pad));
            const y = pad + (1 - (p.value as number) / maxY) * (h - 2 * pad);
            return <circle key={i} cx={x} cy={y} r="3" fill="rgb(37 99 235)" />;
          })}
        </svg>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600 sm:text-xs">
          {pairs.map((p, i) => (
            <span key={i} className="truncate max-w-[120px]" title={p.label}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (chart_type === "pie") {
    const total = values.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    const formatPercent = (value: number): string => {
      const pct = (value / total) * 100;
      if (pct > 0 && pct < 1) return "<1%";
      if (pct >= 1 && pct < 10) return `${pct.toFixed(1)}%`;
      return `${Math.round(pct)}%`;
    };
    const colorForLabel = (label: string, idx: number): string => {
      const normalized = label.toLowerCase().trim();
      if (normalized.includes("present")) return "rgb(34 197 94)";
      if (normalized.includes("absent")) return "rgb(239 68 68)";
      if (normalized.includes("leave")) return "rgb(234 179 8)";
      const fallback = [
        "rgb(59 130 246)",
        "rgb(168 85 247)",
        "rgb(236 72 153)",
        "rgb(20 184 166)",
        "rgb(249 115 22)",
      ];
      return fallback[idx % fallback.length];
    };
    const colors = pairs.map((p, i) => colorForLabel(p.label, i));
    const rawPercents = pairs.map((p) => ((p.value as number) / total) * 100);
    const nonZeroCount = rawPercents.filter((p) => p > 0).length;
    const minSlicePct = nonZeroCount > 0 ? Math.min(1, 100 / nonZeroCount) : 0;
    const boostedPercents = rawPercents.map((p) =>
      p > 0 && p < minSlicePct ? minSlicePct : p,
    );
    const boostedTotal = boostedPercents.reduce((a, b) => a + b, 0);
    const displayPercents =
      boostedTotal > 0
        ? boostedPercents.map((p) => (p / boostedTotal) * 100)
        : rawPercents;

    let acc = 0;
    const segments = displayPercents.map((pct, i) => {
      const start = acc;
      acc += pct;
      return `${colors[i]} ${start}% ${acc}%`;
    });
    const lead = [...pairs]
      .sort((a, b) => (b.value as number) - (a.value as number))
      .at(0);
    const leadPercent = lead
      ? Math.round(((lead.value as number) / total) * 100)
      : null;
    const isAttendanceLike = pairs.some((p) => {
      const n = p.label.toLowerCase();
      return (
        n.includes("present") || n.includes("absent") || n.includes("leave")
      );
    });
    return (
      <div className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        {title ? (
          <div className="mb-3 text-sm font-semibold text-slate-800">{title}</div>
        ) : null}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="relative h-40 w-40 shrink-0">
            <div
              className="h-40 w-40 rounded-full"
              style={{
                background: `conic-gradient(${segments.join(", ")})`,
              }}
              role="img"
              aria-label={title || "Pie chart"}
            />
            <div className="absolute left-1/2 top-1/2 flex h-[102px] w-[102px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
              {leadPercent !== null ? (
                <>
                  <div className="text-3xl font-bold leading-none text-slate-800">
                    {leadPercent}%
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {lead?.label || "Top"}
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2 text-xs sm:text-sm">
            {pairs.map((p, i) => (
              <li key={i} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: colors[i] }}
                />
                <span className="min-w-0 flex-1 truncate text-slate-700" title={p.label}>
                  {p.label}
                </span>
                <span className="shrink-0 tabular-nums text-slate-600">
                  {formatPercent(p.value as number)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {isAttendanceLike ? (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-center text-[11px] sm:text-xs">
            {pairs.map((p, i) => (
              <div key={i} className="rounded-md bg-slate-50 px-2 py-2">
                <div className="flex items-center justify-center gap-1.5 text-slate-500">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colors[i] }}
                  />
                  <span className="truncate" title={p.label}>
                    {p.label}
                  </span>
                </div>
                <div className="mt-1 text-base font-semibold leading-none text-slate-800 sm:text-lg">
                  {p.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}
