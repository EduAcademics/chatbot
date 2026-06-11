import { useMemo, useState } from "react";
import type { TableData } from "./types";
import {
  downloadTableCsv,
  formatColumnHeader,
} from "./utils/exportTableCsv";

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

interface PaginatedDataTableProps {
  tableData: TableData;
  downloadFilename?: string;
}

export default function PaginatedDataTable({
  tableData,
  downloadFilename = "query-results.csv",
}: PaginatedDataTableProps) {
  const { rows, table_meta } = tableData;
  const { columns, page_size, total } = table_meta;
  const [page, setPage] = useState(0);

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
            <button
              type="button"
              className="paginated-table-btn paginated-table-btn-primary"
              onClick={() => downloadTableCsv(rows, columns, downloadFilename)}
            >
              Download CSV
            </button>
          </div>
        </div>
      ) : null}

      <div className="markdown-table-container">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{formatColumnHeader(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIdx) => (
              <tr key={`${safePage}-${rowIdx}`}>
                {columns.map((col) => (
                  <td key={col}>{cellText(row[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
