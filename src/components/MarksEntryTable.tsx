import React, { useState, useRef, useEffect } from "react";

interface Column {
  title: string;
  type: "numeric" | "grade" | "readonly";
  grades: string[];
  items?: Array<Record<string, any>>;
}

interface StudentRow {
  uuid: string;
  mongo_id: string;
  name: string;
  roll_no: number | string;
  marks: Record<string, string | number>;
  remarks: string;
}

interface MarksTableData {
  examination_uuid: string;
  subject_uuid: string;
  term_uuid: string;
  subject_name: string;
  class_name: string;
  section_name: string;
  term_name: string;
  max_marks: number;
  grade_type?: {
    grades?: Array<Record<string, any>>;
  };
  total_marks_grade_type?: {
    grades?: Array<Record<string, any>>;
  };
  columns: Column[];
  students: StudentRow[];
}

interface MarksEntryTableProps {
  data: MarksTableData;
  onSaveColumn: (
    columnTitle: string,
    studentData: any[],
    sessionId?: string,
  ) => Promise<boolean>;
}

const REMARKS_OPTIONS = [
  "Good",
  "Needs Improvement",
  "Excellent",
  "Average",
  "Outstanding",
  "Below Average",
];

export const MarksEntryTable: React.FC<MarksEntryTableProps> = ({
  data,
  onSaveColumn,
}) => {
  const [tableData, setTableData] = useState<StudentRow[]>(
    data.students.map((s) => ({ ...s, marks: { ...s.marks } })),
  );
  const [savedColumns, setSavedColumns] = useState<Set<string>>(new Set());
  const [remarksOpen, setRemarksOpen] = useState<string | null>(null);
  const remarksRef = useRef<HTMLDivElement>(null);
  const editVersionRef = useRef<Record<string, number>>({});

  const markColumnUnsaved = (columnTitle: string) => {
    editVersionRef.current[columnTitle] =
      (editVersionRef.current[columnTitle] ?? 0) + 1;
    setSavedColumns((prev) => {
      if (!prev.has(columnTitle)) return prev;
      const next = new Set(prev);
      next.delete(columnTitle);
      return next;
    });
  };

  // Close remarks dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        remarksRef.current &&
        !remarksRef.current.contains(e.target as Node)
      ) {
        setRemarksOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Get numeric columns for total calculation
  const numericCols = data.columns.filter((c) => c.type === "numeric");

  const calcTotal = (row: StudentRow): number => {
    return numericCols.reduce((sum, col) => {
      const val = parseFloat(String(row.marks[col.title] || 0));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  };

  const hasAnyNumericValue = (row: StudentRow): boolean => {
    return numericCols.some((col) => {
      const raw = row.marks[col.title];
      if (raw === undefined || raw === null) return false;
      const text = String(raw).trim();
      return text !== "";
    });
  };

  const getMarkByTitle = (
    marks: Record<string, string | number>,
    columnTitle: string,
  ): string | number | undefined => {
    if (Object.prototype.hasOwnProperty.call(marks, columnTitle)) {
      return marks[columnTitle];
    }
    const wanted = columnTitle.trim().toLowerCase();
    const key = Object.keys(marks).find(
      (k) => k.trim().toLowerCase() === wanted,
    );
    return key ? marks[key] : undefined;
  };

  const resolveGradeFromRules = (row: StudentRow, column: Column): string => {
    const total = calcTotal(row);
    const percentage =
      data.max_marks > 0 ? (total / Number(data.max_marks)) * 100 : total;
    const gradeRules = [
      ...(Array.isArray(column.items) ? column.items : []),
      ...(data.total_marks_grade_type?.grades || []),
      ...(data.grade_type?.grades || []),
    ];

    const resolveNumber = (rule: Record<string, any>, keys: string[]) => {
      for (const k of keys) {
        const raw = rule[k];
        const val = Number(raw);
        if (!Number.isNaN(val)) return val;
      }

      const flattened: Array<{ key: string; value: any }> = [];
      const walk = (obj: any, prefix = "", depth = 0) => {
        if (!obj || typeof obj !== "object" || depth > 2) return;
        for (const [k, v] of Object.entries(obj)) {
          const fullKey = `${prefix}${k}`.toLowerCase();
          flattened.push({ key: fullKey, value: v });
          if (v && typeof v === "object") {
            walk(v, `${fullKey}.`, depth + 1);
          }
        }
      };
      walk(rule);

      for (const k of keys) {
        const wanted = k.toLowerCase();
        const hit = flattened.find((item) => item.key.includes(wanted));
        if (!hit) continue;
        const val = Number(hit.value);
        if (!Number.isNaN(val)) return val;
      }

      return undefined;
    };

    const resolveLevel = (rule: Record<string, any>) => {
      const level =
        rule.level ??
        rule.grade ??
        rule.name ??
        rule.title ??
        rule.label ??
        rule.value ??
        rule.display_name ??
        rule.level_name ??
        rule.grade_name ??
        rule.code;
      if (typeof level === "string" && level.trim()) {
        return level.trim();
      }

      const flattened: Array<{ key: string; value: any }> = [];
      const walk = (obj: any, prefix = "", depth = 0) => {
        if (!obj || typeof obj !== "object" || depth > 2) return;
        for (const [k, v] of Object.entries(obj)) {
          const fullKey = `${prefix}${k}`.toLowerCase();
          flattened.push({ key: fullKey, value: v });
          if (v && typeof v === "object") {
            walk(v, `${fullKey}.`, depth + 1);
          }
        }
      };
      walk(rule);

      const labelKeys = [
        "grade",
        "level",
        "label",
        "name",
        "title",
        "code",
        "value",
      ];
      const hit = flattened.find(
        (item) =>
          typeof item.value === "string" &&
          labelKeys.some((token) => item.key.includes(token)),
      );
      return hit ? String(hit.value).trim() : "";
    };

    for (const rule of gradeRules) {
      const minPercent = resolveNumber(rule, [
        "min_percentage",
        "minimum_percentage",
        "from_percentage",
        "min_percent",
        "from_percent",
      ]);
      const maxPercent = resolveNumber(rule, [
        "max_percentage",
        "maximum_percentage",
        "to_percentage",
        "max_percent",
        "to_percent",
      ]);
      const min = resolveNumber(rule, [
        "min_mark",
        "min_marks",
        "minimum_marks",
        "minimum_mark",
        "from_marks",
        "from_mark",
        "start_mark",
        "lower_limit",
        "lowerLimit",
        "lower_bound",
        "min",
        "from",
      ]);
      const max = resolveNumber(rule, [
        "max_mark",
        "max_marks",
        "maximum_marks",
        "maximum_mark",
        "to_marks",
        "to_mark",
        "end_mark",
        "upper_limit",
        "upperLimit",
        "upper_bound",
        "max",
        "to",
      ]);
      const level = resolveLevel(rule);
      if (!level) continue;

      if (
        minPercent !== undefined &&
        maxPercent !== undefined &&
        percentage >= minPercent &&
        percentage <= maxPercent
      ) {
        return level;
      }
      if (
        minPercent !== undefined &&
        maxPercent === undefined &&
        percentage >= minPercent
      ) {
        return level;
      }
      if (
        minPercent === undefined &&
        maxPercent !== undefined &&
        percentage <= maxPercent
      ) {
        return level;
      }

      if (
        min !== undefined &&
        max !== undefined &&
        total >= min &&
        total <= max
      ) {
        return level;
      }
      if (min !== undefined && max === undefined && total >= min) {
        return level;
      }
      if (min === undefined && max !== undefined && total <= max) {
        return level;
      }
    }

    return "";
  };

  const getReadonlyDisplayValue = (row: StudentRow, column: Column) => {
    const columnTitle = column.title;
    if (columnTitle.toUpperCase().includes("GRADE")) {
      const liveGrade = resolveGradeFromRules(row, column);
      if (liveGrade) return liveGrade;

      const storedGrade = getMarkByTitle(row.marks, columnTitle);
      if (
        storedGrade !== undefined &&
        storedGrade !== null &&
        storedGrade !== ""
      ) {
        return storedGrade;
      }
      return "—";
    }

    const exactValue = getMarkByTitle(row.marks, columnTitle);
    if (exactValue !== undefined && exactValue !== null && exactValue !== "") {
      return exactValue;
    }

    if (
      columnTitle.toUpperCase().includes("TOTAL") &&
      hasAnyNumericValue(row)
    ) {
      return Math.round(calcTotal(row) * 100) / 100;
    }

    return "—";
  };

  const getSafeNumericInputValue = (
    value: string | number | undefined,
  ): string => {
    if (value === undefined || value === null || value === "") return "";
    const strVal = String(value).trim();
    return /^-?\d+(\.\d+)?$/.test(strVal) ? strVal : "";
  };

  const handleMarkChange = (
    studentUuid: string,
    colTitle: string,
    value: string,
  ) => {
    markColumnUnsaved(colTitle);
    setTableData((prev) =>
      prev.map((row) => {
        if (row.uuid !== studentUuid) return row;
        const updated = {
          ...row,
          marks: { ...row.marks, [colTitle]: value },
        };
        // Update total column live
        const total = calcTotal(updated);
        const totalCol = data.columns.find(
          (c) =>
            c.type === "readonly" && c.title.toUpperCase().includes("TOTAL"),
        );
        if (totalCol) {
          updated.marks[totalCol.title] = Math.round(total * 100) / 100;
        }

        const gradeCol = data.columns.find(
          (c) =>
            c.type === "readonly" && c.title.toUpperCase().includes("GRADE"),
        );
        if (gradeCol) {
          const liveGrade = resolveGradeFromRules(updated, gradeCol);
          updated.marks[gradeCol.title] = liveGrade || "";
        }

        return updated;
      }),
    );
  };

  const handleRemarksToggle = (studentUuid: string) => {
    setRemarksOpen((prev) => (prev === studentUuid ? null : studentUuid));
  };

  const handleRemarksAdd = (studentUuid: string, option: string) => {
    markColumnUnsaved("remarks");
    setTableData((prev) =>
      prev.map((row) => {
        if (row.uuid !== studentUuid) return row;
        const current = row.remarks
          ? row.remarks
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean)
          : [];
        if (current.includes(option)) return row;
        return {
          ...row,
          remarks: [...current, option].join(", "),
        };
      }),
    );
  };

  const handleRemarksRemove = (studentUuid: string, tag: string) => {
    markColumnUnsaved("remarks");
    setTableData((prev) =>
      prev.map((row) => {
        if (row.uuid !== studentUuid) return row;
        const current = row.remarks
          ? row.remarks
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean)
          : [];
        return {
          ...row,
          remarks: current.filter((r) => r !== tag).join(", "),
        };
      }),
    );
  };

  const handleSaveColumn = async (colTitle: string) => {
    const saveVersion = editVersionRef.current[colTitle] ?? 0;
    const studentData = tableData.map((row) => ({
      uuid: row.uuid,
      mark: row.marks[colTitle] ?? "",
      remarks: row.remarks,
    }));
    const saveSucceeded = await onSaveColumn(colTitle, studentData);
    if (!saveSucceeded) return;
    if ((editVersionRef.current[colTitle] ?? 0) !== saveVersion) return;
    setSavedColumns((prev) => new Set([...prev, colTitle]));
  };

  const handleSaveRemarks = async () => {
    const saveVersion = editVersionRef.current.remarks ?? 0;
    const studentData = tableData.map((row) => ({
      uuid: row.uuid,
      mark: "",
      remarks: row.remarks,
    }));
    const saveSucceeded = await onSaveColumn("remarks", studentData);
    if (!saveSucceeded) return;
    if ((editVersionRef.current.remarks ?? 0) !== saveVersion) return;
    setSavedColumns((prev) => new Set([...prev, "remarks"]));
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
      {/* Header */}
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
        📊 {data.subject_name} | Class {data.class_name}-{data.section_name} |{" "}
        {data.term_name}
        <span
          style={{
            marginLeft: "12px",
            fontSize: "12px",
            opacity: 0.85,
          }}
        >
          {data.students.length} students
        </span>
      </div>

      {/* Table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
          minWidth: "600px",
        }}
      >
        <thead>
          <tr style={{ background: "#f8f9fa" }}>
            {/* Student Name - sticky */}
            <th
              style={{
                position: "sticky",
                left: 0,
                background: "#f8f9fa",
                padding: "8px 12px",
                textAlign: "left",
                borderBottom: "2px solid #e2e8f0",
                minWidth: "160px",
                fontWeight: 600,
                zIndex: 2,
              }}
            >
              STUDENT NAME
            </th>

            {/* Data columns */}
            {data.columns.map((col) => (
              <th
                key={col.title}
                style={{
                  padding: "4px 8px",
                  textAlign: "center",
                  borderBottom: "2px solid #e2e8f0",
                  minWidth: col.type === "readonly" ? "80px" : "120px",
                  fontWeight: 600,
                  color: col.type === "readonly" ? "#94a3b8" : "#374151",
                }}
              >
                <div>{col.title}</div>
                {/* Save button below each non-readonly column */}
                {col.type !== "readonly" && (
                  <button
                    onClick={() => handleSaveColumn(col.title)}
                    style={{
                      marginTop: "4px",
                      padding: "2px 10px",
                      background: savedColumns.has(col.title)
                        ? "#10b981"
                        : "#6366f1",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "11px",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    {savedColumns.has(col.title) ? "✅ Saved" : "💾 Save"}
                  </button>
                )}
              </th>
            ))}

            {/* Remarks column */}
            <th
              style={{
                padding: "4px 8px",
                textAlign: "center",
                borderBottom: "2px solid #e2e8f0",
                minWidth: "160px",
                fontWeight: 600,
              }}
            >
              <div>REMARKS</div>
              <button
                onClick={handleSaveRemarks}
                style={{
                  marginTop: "4px",
                  padding: "2px 10px",
                  background: savedColumns.has("remarks")
                    ? "#10b981"
                    : "#6366f1",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {savedColumns.has("remarks") ? "✅ Saved" : "💾 Save"}
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {tableData.map((row, idx) => (
            <tr
              key={row.uuid}
              style={{
                background: idx % 2 === 0 ? "#fff" : "#f8f9fc",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              {/* Student name - sticky */}
              <td
                style={{
                  position: "sticky",
                  left: 0,
                  background: idx % 2 === 0 ? "#fff" : "#f8f9fc",
                  padding: "8px 12px",
                  fontWeight: 500,
                  zIndex: 1,
                  minWidth: "160px",
                }}
              >
                <span
                  style={{
                    color: "#94a3b8",
                    fontSize: "11px",
                    marginRight: "4px",
                  }}
                >
                  {row.roll_no}.
                </span>
                {row.name}
              </td>

              {/* Data columns */}
              {data.columns.map((col) => (
                <td
                  key={col.title}
                  style={{
                    padding: "6px 8px",
                    textAlign: "center",
                    background:
                      col.type === "readonly" ? "#f1f5f9" : "transparent",
                  }}
                >
                  {col.type === "readonly" ? (
                    <span style={{ color: "#64748b", fontSize: "13px" }}>
                      {getReadonlyDisplayValue(row, col)}
                    </span>
                  ) : col.type === "numeric" ? (
                    <input
                      type="number"
                      value={getSafeNumericInputValue(row.marks[col.title])}
                      onChange={(e) =>
                        handleMarkChange(row.uuid, col.title, e.target.value)
                      }
                      style={{
                        width: "70px",
                        padding: "4px 6px",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        textAlign: "center",
                        fontSize: "13px",
                        outline: "none",
                      }}
                      min={0}
                      max={data.max_marks}
                    />
                  ) : (
                    <select
                      value={String(row.marks[col.title] ?? "")}
                      onChange={(e) =>
                        handleMarkChange(row.uuid, col.title, e.target.value)
                      }
                      style={{
                        padding: "4px 6px",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "13px",
                        background: "#fff",
                      }}
                    >
                      <option value="">--</option>
                      {col.grades.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              ))}

              {/* Remarks column */}
              <td
                style={{ padding: "6px 8px", position: "relative" }}
                ref={remarksOpen === row.uuid ? (remarksRef as any) : undefined}
              >
                {/* Tags */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px",
                    minHeight: "28px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    padding: "4px",
                    cursor: "text",
                    background: "#fff",
                  }}
                  onClick={() => handleRemarksToggle(row.uuid)}
                >
                  {row.remarks ? (
                    row.remarks
                      .split(",")
                      .map((r) => r.trim())
                      .filter(Boolean)
                      .map((tag) => (
                        <span
                          key={tag}
                          style={{
                            background: "#e0e7ff",
                            color: "#4f46e5",
                            borderRadius: "4px",
                            padding: "1px 6px",
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          {tag}
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemarksRemove(row.uuid, tag);
                            }}
                            style={{ cursor: "pointer", fontWeight: 700 }}
                          >
                            ×
                          </span>
                        </span>
                      ))
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: "11px" }}>
                      Add remarks...
                    </span>
                  )}
                </div>

                {/* Dropdown */}
                {remarksOpen === row.uuid && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      zIndex: 10,
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                      minWidth: "160px",
                      padding: "4px 0",
                    }}
                  >
                    {REMARKS_OPTIONS.map((opt) => (
                      <div
                        key={opt}
                        onClick={() => {
                          handleRemarksAdd(row.uuid, opt);
                        }}
                        style={{
                          padding: "6px 12px",
                          cursor: "pointer",
                          fontSize: "12px",
                          color: "#374151",
                        }}
                        onMouseEnter={(e) =>
                          ((e.target as HTMLElement).style.background =
                            "#f3f4f6")
                        }
                        onMouseLeave={(e) =>
                          ((e.target as HTMLElement).style.background = "#fff")
                        }
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MarksEntryTable;
