import React, { useMemo, useState } from "react";

export interface HealthCardSectionOption {
  class?: { uuid?: string; name?: string; _id?: string };
  section?: { uuid?: string; name?: string; _id?: string };
}

interface HealthCardSelectorProps {
  sections: HealthCardSectionOption[];
  onConfirm: (message: string) => void | Promise<void>;
  disabled?: boolean;
}

const classKey = (opt: HealthCardSectionOption): string =>
  opt.class?.uuid || opt.class?._id || opt.class?.name || "";

const sectionKey = (opt: HealthCardSectionOption): string =>
  opt.section?.uuid || opt.section?._id || opt.section?.name || "";

export const HealthCardSelector: React.FC<HealthCardSelectorProps> = ({
  sections,
  onConfirm,
  disabled = false,
}) => {
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [selectedSectionKey, setSelectedSectionKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const classOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const opt of sections) {
      const key = classKey(opt);
      if (!key || seen.has(key)) continue;
      seen.set(key, opt.class?.name || "Unknown Class");
    }
    return Array.from(seen.entries())
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sections]);

  const sectionOptions = useMemo(() => {
    if (!selectedClassKey) return [];
    return sections
      .filter((opt) => classKey(opt) === selectedClassKey)
      .map((opt) => ({
        key: sectionKey(opt),
        name: opt.section?.name || "Unknown Section",
      }))
      .filter((s) => s.key)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sections, selectedClassKey]);

  const canConfirm =
    selectedClassKey.length > 0 && selectedSectionKey.length > 0;

  const handleClassChange = (key: string) => {
    setSelectedClassKey(key);
    setSelectedSectionKey("");
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    const match = sections.find(
      (opt) =>
        classKey(opt) === selectedClassKey &&
        sectionKey(opt) === selectedSectionKey,
    );
    if (!match) return;

    const className = match.class?.name || "Unknown";
    const sectionName = match.section?.name || "Unknown";
    setConfirmed(true);
    await onConfirm(`${className} - ${sectionName}`);
  };

  const isLocked = disabled || confirmed;

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    background: isLocked ? "#f3f4f6" : "#fff",
    color: "#111827",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#475569",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  return (
    <div
      style={{
        marginTop: "12px",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "#fff",
          padding: "12px 16px",
          fontWeight: 600,
          fontSize: "14px",
        }}
      >
        🏥 Select Class & Section
        <span style={{ marginLeft: "10px", fontSize: "12px", opacity: 0.9 }}>
          {sections.length} options
        </span>
      </div>

      <div style={{ padding: "16px", display: "grid", gap: "14px" }}>
          <div>
          <label style={labelStyle}>Class</label>
          <select
            value={selectedClassKey}
            onChange={(e) => handleClassChange(e.target.value)}
            disabled={isLocked}
            style={selectStyle}
          >
            <option value="">Select class...</option>
            {classOptions.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Section</label>
          <select
            value={selectedSectionKey}
            onChange={(e) => setSelectedSectionKey(e.target.value)}
            disabled={isLocked || !selectedClassKey}
            style={selectStyle}
          >
            <option value="">
              {selectedClassKey ? "Select section..." : "Select class first"}
            </option>
            {sectionOptions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isLocked || !canConfirm}
            style={{
              padding: "10px 20px",
              background:
                isLocked || !canConfirm
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: isLocked || !canConfirm ? "not-allowed" : "pointer",
            }}
          >
            {confirmed ? "Confirmed" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HealthCardSelector;

