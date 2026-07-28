import * as XLSX from "xlsx";


export function formatColumnHeader(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\r?\n/g, " ");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function downloadTableCsv(
  rows: Record<string, unknown>[],
  columns: string[],
  filename = "query-results.csv",
): void {
  if (!rows.length || !columns.length) return;

  const header = columns.map((c) => escapeCsvCell(formatColumnHeader(c))).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCsvCell(row[col])).join(","))
    .join("\n");

  const blob = new Blob([`${header}\n${body}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function normalizeXlsFilename(filename: string): string {
  const trimmed = (filename || "query-results.xls").trim();
  if (/\.xls$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\.xlsx$/i.test(trimmed)) {
    return trimmed.replace(/\.xlsx$/i, ".xls");
  }
  return `${trimmed}.xls`;
}


export function downloadTableXls(
  rows: Record<string, unknown>[],
  columns: string[],
  filename = "query-results.xls",
): void {
  if (!rows.length || !columns.length) return;

  const sheetData = rows.map((row) => {
    const line: Record<string, unknown> = {};
    for (const col of columns) {
      line[formatColumnHeader(col)] = row[col] ?? "";
    }
    return line;
  });

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  XLSX.writeFile(workbook, normalizeXlsFilename(filename), { bookType: "xls" });
}

export function downloadMultiTableXls(
  tables: Array<{
    title?: string;
    rows: Record<string, unknown>[];
    columns: string[];
  }>,
  filename = "query-results.xls",
): void {
  const workbook = XLSX.utils.book_new();
  let added = false;

  for (const table of tables) {
    const { rows, columns } = table;
    if (!rows.length || !columns.length) continue;

    const sheetData = rows.map((row) => {
      const line: Record<string, unknown> = {};
      for (const col of columns) {
        line[formatColumnHeader(col)] = row[col] ?? "";
      }
      return line;
    });

    const sheetName = (table.title || "Report").slice(0, 31);
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(sheetData),
      sheetName,
    );
    added = true;
  }

  if (!added) return;
  XLSX.writeFile(workbook, normalizeXlsFilename(filename), { bookType: "xls" });
}
