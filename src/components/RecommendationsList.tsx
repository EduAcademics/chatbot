import type { Recommendation } from "./types";

interface RecommendationsListProps {
  items: Recommendation[];
  title?: string;
}

const severityClass: Record<string, string> = {
  info: "recommendation-info",
  warning: "recommendation-warning",
  critical: "recommendation-critical",
};

export default function RecommendationsList({
  items,
  title = "Suggested Actions",
}: RecommendationsListProps) {
  if (!items?.length) return null;

  return (
    <div className="recommendations-list mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="recommendations-title mb-2 text-sm font-semibold text-slate-800">
        {title}
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={`recommendation-item rounded-md border px-3 py-2 text-sm ${
              severityClass[item.severity || "info"] || severityClass.info
            }`}
          >
            <div className="font-medium text-slate-800">{item.title}</div>
            <div className="mt-1 text-slate-600">{item.detail}</div>
            <div className="mt-1 text-slate-700">
              <span className="font-medium">Action:</span> {item.action}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
