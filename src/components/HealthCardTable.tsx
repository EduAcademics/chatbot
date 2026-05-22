import React, { useState } from "react";
import {
  sendHealthCardColumnSave,
  sendHealthCardSave,
  type HealthCardData,
} from "./flows/healthCardFlow";

interface HealthCardStudentRow {
  uuid: string;
  mongo_id?: string;
  name: string;
  admission_no: string;
  roll_no: string | number;
  health_card: HealthCardData;
}

export interface HealthCardTableData {
  class_name: string;
  section_name: string;
  students: HealthCardStudentRow[];
  columns?: string[];
}

interface HealthCardTableProps {
  tableData: HealthCardTableData;
  sessionId: string;
  userId: string;
  userRoles: string[];
  getErpContext: () => { academic_session: string; branch_token: string };
  appendBotMessage?: (msg: {
    type: string;
    answer: string;
    activeTab?: string;
  }) => void;
  speakBotMessage?: (text: string) => void;
}

const EDITABLE_COLUMNS: { key: keyof HealthCardData; label: string }[] = [
  { key: "height", label: "HEIGHT" },
  { key: "weight", label: "WEIGHT" },
  { key: "leftVision", label: "LEFT VISION" },
  { key: "rightVision", label: "RIGHT VISION" },
  { key: "vaccinationRequired", label: "VACCINATION REQUIRED" },
  { key: "dentalExamination", label: "DENTAL EXAMINATION" },
  { key: "observation", label: "OBSERVATION" },
  { key: "followupAdvice", label: "FOLLOWUP ADVICE" },
  { key: "remarks", label: "REMARKS" },
];

const EMPTY_HEALTH_CARD: HealthCardData = {
  height: "",
  weight: "",
  leftVision: "",
  rightVision: "",
  vaccinationRequired: "",
  dentalExamination: "",
  observation: "",
  followupAdvice: "",
  remarks: "",
};

const STICKY_NAME_WIDTH = 140;
const STICKY_ROLL_LEFT = STICKY_NAME_WIDTH;
const STICKY_ROLL_WIDTH = 100;

const stickyCellShadow = "2px 0 4px rgba(0,0,0,0.06)";

const PURPLE_BTN_BG = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
const GREY_BTN_BG = "#9CA3AF";
const SAVING_BTN_BG = "#94a3b8";

const COLUMN_DISPLAY_NAMES: Record<keyof HealthCardData, string> = {
  height: "Height",
  weight: "Weight",
  leftVision: "Left Vision",
  rightVision: "Right Vision",
  vaccinationRequired: "Vaccination Required",
  dentalExamination: "Dental Examination",
  observation: "Observation",
  followupAdvice: "Followup Advice",
  remarks: "Remarks",
};

const isSaveSuccess = (result: {
  success?: boolean;
  data?: { answer?: string };
}): boolean => {
  if (!result?.success) return false;
  const answer = String(result.data?.answer || "").toLowerCase();
  return (
    answer.includes("✅") &&
    answer.includes("health card") &&
    answer.includes("updated")
  );
};

const isColumnSaveSuccess = (
  result: { success?: boolean; data?: { column_saved?: string; answer?: string } },
  fieldKey: string,
): boolean => {
  if (!result?.success) return false;
  if (result.data?.column_saved === fieldKey) return true;
  const answer = String(result.data?.answer || "").toLowerCase();
  return answer.includes("✅") && answer.includes("saved");
};

const Spinner = ({ size = 14, color = "#fff" }: { size?: number; color?: string }) => (
  <span
    style={{
      width: size,
      height: size,
      border: `2px solid ${color === "#fff" ? "rgba(255,255,255,0.3)" : "rgba(102,126,234,0.3)"}`,
      borderTopColor: color,
      borderRadius: "50%",
      animation: "healthCardSpin 0.8s linear infinite",
      display: "inline-block",
      flexShrink: 0,
    }}
  />
);

export const HealthCardTable: React.FC<HealthCardTableProps> = ({
  tableData,
  sessionId,
  userId,
  userRoles,
  getErpContext,
  appendBotMessage,
  speakBotMessage,
}) => {
  const [rows, setRows] = useState<HealthCardStudentRow[]>(
    tableData.students.map((s) => ({
      ...s,
      health_card: { ...EMPTY_HEALTH_CARD, ...(s.health_card || {}) },
    })),
  );
  const [dirtyColumns, setDirtyColumns] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [savingColumns, setSavingColumns] = useState<Set<string>>(new Set());

  const handleFieldChange = (
    studentUuid: string,
    field: keyof HealthCardData,
    value: string,
  ) => {
    setDirtyColumns((prev) => new Set(prev).add(field));
    setRows((prev) =>
      prev.map((row) =>
        row.uuid === studentUuid
          ? {
              ...row,
              health_card: { ...row.health_card, [field]: value },
            }
          : row,
      ),
    );
  };

  const saveRow = async (row: HealthCardStudentRow): Promise<boolean> => {
    try {
      const result = await sendHealthCardSave({
        studentUuid: row.uuid,
        healthCardData: { ...row.health_card },
        sessionId: sessionId || userId,
        userId,
        userRoles,
        getErpContext,
      });

      if (isSaveSuccess(result)) {
        return true;
      }
      return false;
    } catch (error) {
      console.error("Health card row save error:", error);
      return false;
    }
  };

  const handleSaveColumn = async (fieldKey: keyof HealthCardData) => {
    setSavingColumns((prev) => new Set([...prev, fieldKey]));
    try {
      const result = await sendHealthCardColumnSave({
        fieldName: fieldKey,
        rows: rows.map((r) => ({ uuid: r.uuid, health_card: r.health_card })),
        sessionId: sessionId || userId,
        userId,
        userRoles,
        getErpContext,
      });

      if (isColumnSaveSuccess(result, fieldKey)) {
        setDirtyColumns((prev) => {
          const next = new Set(prev);
          next.delete(fieldKey);
          return next;
        });

        const displayName = COLUMN_DISPLAY_NAMES[fieldKey] || fieldKey;
        const saveMessage =
          result.data?.answer || `✅ ${displayName} saved for all students.`;
        appendBotMessage?.({
          type: "bot",
          answer: saveMessage,
          activeTab: "answer",
        });
        speakBotMessage?.(saveMessage);
      }
    } catch (error) {
      console.error("Health card column save error:", error);
    } finally {
      setSavingColumns((prev) => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
    }
  };

  const handleSaveAll = async () => {
    setSavingAll(true);
    let successCount = 0;

    try {
      for (const row of rows) {
        const ok = await saveRow(row);
        if (ok) successCount += 1;
      }

      if (successCount > 0) {
        setDirtyColumns(new Set());

        const classLabel = tableData.class_name || "";
        const sectionLabel = tableData.section_name || "";
        const saveAllMessage = `✅ All health cards saved for ${classLabel}-${sectionLabel} successfully!`;
        appendBotMessage?.({
          type: "bot",
          answer: saveAllMessage,
          activeTab: "answer",
        });
        speakBotMessage?.(saveAllMessage);
      }
    } finally {
      setSavingAll(false);
    }
  };

  const stickyNameStyle = (bg: string, zIndex: number): React.CSSProperties => ({
    position: "sticky",
    left: 0,
    background: bg,
    zIndex,
    minWidth: STICKY_NAME_WIDTH,
    boxShadow: stickyCellShadow,
  });

  const stickyRollStyle = (bg: string, zIndex: number): React.CSSProperties => ({
    position: "sticky",
    left: STICKY_ROLL_LEFT,
    background: bg,
    zIndex,
    minWidth: STICKY_ROLL_WIDTH,
    boxShadow: stickyCellShadow,
  });

  const footerBg = "#f1f5f9";
  const isAnySaving = savingAll || savingColumns.size > 0;

  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        marginTop: "8px",
        background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "#fff",
          padding: "12px 16px",
          borderRadius: "12px 12px 0 0",
          fontWeight: 600,
          fontSize: "14px",
        }}
      >
        🏥 Health Cards | Class {tableData.class_name}-{tableData.section_name}
        <span style={{ marginLeft: "12px", fontSize: "12px", opacity: 0.85 }}>
          {rows.length} students
        </span>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
          minWidth: "900px",
        }}
      >
        <thead>
          <tr style={{ background: "#f8f9fa" }}>
            <th
              style={{
                ...stickyNameStyle("#f8f9fa", 3),
                padding: "8px 12px",
                textAlign: "left",
                borderBottom: "2px solid #e2e8f0",
                fontWeight: 600,
              }}
            >
              STUDENT NAME
            </th>
            <th
              style={{
                padding: "8px 12px",
                textAlign: "center",
                borderBottom: "2px solid #e2e8f0",
                minWidth: "100px",
                fontWeight: 600,
              }}
            >
              ADMISSION NO
            </th>
            <th
              style={{
                ...stickyRollStyle("#f8f9fa", 3),
                padding: "8px 12px",
                textAlign: "center",
                borderBottom: "2px solid #e2e8f0",
                fontWeight: 600,
              }}
            >
              ROLL NO
            </th>
            {EDITABLE_COLUMNS.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: "8px 10px",
                  textAlign: "center",
                  borderBottom: "2px solid #e2e8f0",
                  minWidth: col.key === "remarks" ? "140px" : "110px",
                  fontWeight: 600,
                  color: "#374151",
                }}
              >
                {col.label}
              </th>
            ))}
            <th
              style={{
                padding: "8px 10px",
                textAlign: "center",
                borderBottom: "2px solid #e2e8f0",
                minWidth: "72px",
                fontWeight: 600,
              }}
            >
              STATUS
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rowBg = idx % 2 === 0 ? "#fff" : "#f8f9fc";
            return (
              <tr
                key={row.uuid}
                style={{
                  background: rowBg,
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <td
                  style={{
                    ...stickyNameStyle(rowBg, 1),
                    padding: "8px 12px",
                    fontWeight: 500,
                  }}
                >
                  {row.name}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  {row.admission_no || "—"}
                </td>
                <td
                  style={{
                    ...stickyRollStyle(rowBg, 1),
                    padding: "8px 12px",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  {row.roll_no ?? "—"}
                </td>
                {EDITABLE_COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    style={{ padding: "6px 8px", textAlign: "center" }}
                  >
                    <input
                      type="text"
                      value={String(row.health_card[col.key] ?? "")}
                      onChange={(e) =>
                        handleFieldChange(row.uuid, col.key, e.target.value)
                      }
                      disabled={isAnySaving}
                      style={{
                        width: col.key === "remarks" ? "130px" : "90px",
                        padding: "4px 6px",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "13px",
                        outline: "none",
                        textAlign: "center",
                        background: isAnySaving ? "#f3f4f6" : "#fff",
                      }}
                    />
                  </td>
                ))}
                <td style={{ padding: "6px 8px", textAlign: "center" }} />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: footerBg, borderTop: "2px solid #e2e8f0" }}>
            <td
              style={{
                ...stickyNameStyle(footerBg, 2),
                padding: "10px 12px",
                verticalAlign: "bottom",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={isAnySaving || rows.length === 0}
                  style={{
                    padding: "8px 16px",
                    background: savingAll ? SAVING_BTN_BG : PURPLE_BTN_BG,
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: isAnySaving ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {savingAll ? (
                    <>
                      <Spinner />
                      Saving...
                    </>
                  ) : (
                    "💾 Save All"
                  )}
                </button>
              </div>
            </td>
            <td style={{ padding: "10px 8px" }} />
            <td style={{ ...stickyRollStyle(footerBg, 2), padding: "10px 8px" }} />
            {EDITABLE_COLUMNS.map((col) => {
              const isSavingCol = savingColumns.has(col.key);
              const isDirty = dirtyColumns.has(col.key);
              const columnBtnBg = isSavingCol
                ? SAVING_BTN_BG
                : isDirty
                  ? GREY_BTN_BG
                  : PURPLE_BTN_BG;

              return (
                <td
                  key={col.key}
                  style={{ padding: "8px 6px", textAlign: "center", verticalAlign: "bottom" }}
                >
                  <button
                    type="button"
                    onClick={() => handleSaveColumn(col.key)}
                    disabled={isAnySaving || rows.length === 0}
                    title={`Save ${col.label}`}
                    style={{
                      padding: "4px 10px",
                      background: columnBtnBg,
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 500,
                      cursor: isAnySaving ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isSavingCol ? (
                      <>
                        <Spinner size={12} />
                        Saving...
                      </>
                    ) : (
                      "💾 Save"
                    )}
                  </button>
                </td>
              );
            })}
            <td style={{ padding: "10px 8px" }} />
          </tr>
        </tfoot>
      </table>
      <style>{`
        @keyframes healthCardSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default HealthCardTable;
