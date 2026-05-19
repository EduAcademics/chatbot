import React, { useEffect, useRef, useState } from "react";
import {
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
  const [savedRows, setSavedRows] = useState<Set<string>>(new Set());
  const [rowSaveToasts, setRowSaveToasts] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const toastTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  useEffect(() => {
    return () => {
      Object.values(toastTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  const handleFieldChange = (
    studentUuid: string,
    field: keyof HealthCardData,
    value: string,
  ) => {
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

  const showRowSavedToast = (studentUuid: string) => {
    setRowSaveToasts((prev) => new Set([...prev, studentUuid]));

    if (toastTimersRef.current[studentUuid]) {
      clearTimeout(toastTimersRef.current[studentUuid]);
    }

    toastTimersRef.current[studentUuid] = setTimeout(() => {
      setRowSaveToasts((prev) => {
        const next = new Set(prev);
        next.delete(studentUuid);
        return next;
      });
      delete toastTimersRef.current[studentUuid];
    }, 2000);
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
        setSavedRows((prev) => new Set([...prev, row.uuid]));
        showRowSavedToast(row.uuid);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Health card row save error:", error);
      return false;
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

      if (successCount > 0 && appendBotMessage) {
        const classLabel = tableData.class_name || "";
        const sectionLabel = tableData.section_name || "";
        const saveAllMessage = `✅ All health cards saved for ${classLabel} - ${sectionLabel} successfully!`;
        appendBotMessage({
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
                position: "sticky",
                left: 0,
                background: "#f8f9fa",
                padding: "8px 12px",
                textAlign: "left",
                borderBottom: "2px solid #e2e8f0",
                minWidth: "140px",
                fontWeight: 600,
                zIndex: 2,
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
                padding: "8px 12px",
                textAlign: "center",
                borderBottom: "2px solid #e2e8f0",
                minWidth: "80px",
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
          {rows.map((row, idx) => (
            <tr
              key={row.uuid}
              style={{
                background: idx % 2 === 0 ? "#fff" : "#f8f9fc",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <td
                style={{
                  position: "sticky",
                  left: 0,
                  background: idx % 2 === 0 ? "#fff" : "#f8f9fc",
                  padding: "8px 12px",
                  fontWeight: 500,
                  zIndex: 1,
                  minWidth: "140px",
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
                    disabled={savingAll}
                    style={{
                      width: col.key === "remarks" ? "130px" : "90px",
                      padding: "4px 6px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "13px",
                      outline: "none",
                      textAlign: "center",
                      background: savingAll ? "#f3f4f6" : "#fff",
                    }}
                  />
                </td>
              ))}
              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                    minHeight: "24px",
                  }}
                >
                  {rowSaveToasts.has(row.uuid) && (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#16a34a",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✅ Saved!
                    </span>
                  )}
                  {savedRows.has(row.uuid) && (
                    <span
                      style={{ fontSize: "16px" }}
                      title="Health card saved"
                    >
                      ✅
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "flex-end",
          background: "#f8f9fa",
          borderRadius: "0 0 12px 12px",
        }}
      >
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={savingAll || rows.length === 0}
          style={{
            padding: "10px 20px",
            background: savingAll
              ? "#94a3b8"
              : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "14px",
            cursor: savingAll ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {savingAll ? (
            <>
              <span
                style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "healthCardSpin 0.8s linear infinite",
                }}
              />
              Saving...
            </>
          ) : (
            "💾 Save All"
          )}
        </button>
      </div>
      <style>{`
        @keyframes healthCardSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default HealthCardTable;
