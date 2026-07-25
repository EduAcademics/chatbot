import { useMemo, useState } from "react";
import type { TableData } from "./types";
import {
  downloadTableCsv,
  formatColumnHeader,
} from "./utils/exportTableCsv";

function cellText(value: unknown, blankAsEmpty = false): string {
  if (value === null || value === undefined || value === "") {
    return blankAsEmpty ? "" : "-";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isBlankCell(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}


function mergeRowSpan(
  rows: Record<string, unknown>[],
  rowIdx: number,
  mergeColumn: string,
): number {
  const value = rows[rowIdx]?.[mergeColumn];
  if (isBlankCell(value)) {
    return 0;
  }
  let span = 1;
  for (let i = rowIdx + 1; i < rows.length; i += 1) {
    if (!isBlankCell(rows[i]?.[mergeColumn])) break;
    span += 1;
  }
  return span;
}

interface PaginatedDataTableProps {
  tableData: TableData;
  downloadFilename?: string;
  
  showDownload?: boolean;
}

const ragRowClass: Record<string, string> = {
  danger: "rag-row-danger",
  warning: "rag-row-warning",
  success: "rag-row-success",
  neutral: "",
};

export default function PaginatedDataTable({
  tableData,
  downloadFilename = "query-results.csv",
  showDownload = true,
}: PaginatedDataTableProps) {
  const { rows, table_meta } = tableData;
  const { columns, page_size, total, row_status_key, merge_column } = table_meta;
  const [page, setPage] = useState(0);
  const mergeEnabled = Boolean(merge_column && columns.includes(merge_column));

  const usePagination = total > page_size;
  const totalPages = Math.max(1, Math.ceil(total / page_size));
  const safePage = Math.min(page, totalPages - 1);

  const pageRows = useMemo(() => {
    if (!usePagination) {
      return rows;
    }
    const start = safePage * page_size;
    return rows.slice(start, start + page_size);
  }, [rows, safePage, page_size, usePagination]);

  const rangeStart = total === 0 ? 0 : safePage * page_size + 1;
  const rangeEnd = usePagination
    ? Math.min((safePage + 1) * page_size, total)
    : total;

  if (!columns.length || !rows.length) {
    return null;
  }

  return (
    <div className="paginated-table-wrap mt-3 w-full">
      {usePagination ? (
        <div className="paginated-table-toolbar">
          <span className="paginated-table-range text-sm text-slate-600">
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="paginated-table-actions">
            <button
              type="button"
              className="paginated-table-btn"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className="paginated-table-page text-sm text-slate-600">
              Page {safePage + 1} of {totalPages}
            </span>
            <button
              type="button"
              className="paginated-table-btn"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
            {showDownload ? (
              <button
                type="button"
                className="paginated-table-btn paginated-table-btn-primary"
                onClick={() => downloadTableCsv(rows, columns, downloadFilename)}
              >
                Download CSV
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className={`markdown-table-container${
          mergeEnabled ? " markdown-table-merge" : ""
        }`}
      >
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{formatColumnHeader(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIdx) => {
              const status = row_status_key
                ? String(row[row_status_key] ?? "").toLowerCase()
                : "";
              const rowClass = row_status_key ? ragRowClass[status] || "" : "";
              return (
                <tr key={`${safePage}-${rowIdx}`} className={rowClass}>
                  {columns.map((col) => {
                    if (mergeEnabled && col === merge_column) {
                      const span = mergeRowSpan(pageRows, rowIdx, merge_column);
                      if (span === 0) {
                        return null;
                      }
                      return (
                        <td
                          key={col}
                          rowSpan={span}
                          className="merge-group-cell"
                        >
                          {cellText(row[col], true)}
                        </td>
                      );
                    }
                    return (
                      <td key={col}>
                        {cellText(row[col], mergeEnabled)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
