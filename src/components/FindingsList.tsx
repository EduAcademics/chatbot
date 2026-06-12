interface FindingsListProps {
  items: string[];
  title?: string;
}

export default function FindingsList({
  items,
  title = "Insights",
}: FindingsListProps) {
  if (!items?.length) return null;

  return (
    <div className="findings-list mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="findings-title mb-2 text-sm font-semibold text-slate-800">
        {title}
      </div>
      <ul className="findings-items list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((item, idx) => (
          <li key={`${idx}-${item.slice(0, 24)}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
