export interface KpiCard {
  label: string;
  value: string | number;
  tone?: "neutral" | "danger" | "warning" | "success";
}

interface KpiCardRowProps {
  cards: KpiCard[];
}

const toneClass: Record<string, string> = {
  neutral: "kpi-card-neutral",
  danger: "kpi-card-danger",
  warning: "kpi-card-warning",
  success: "kpi-card-success",
};

export default function KpiCardRow({ cards }: KpiCardRowProps) {
  if (!cards?.length) return null;

  return (
    <div className="kpi-card-row mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`kpi-card rounded-lg border px-3 py-2.5 ${toneClass[card.tone || "neutral"] || toneClass.neutral}`}
        >
          <div className="kpi-card-label text-xs font-medium opacity-80">
            {card.label}
          </div>
          <div className="kpi-card-value mt-1 text-lg font-semibold">
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
