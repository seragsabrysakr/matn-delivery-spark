/**
 * Minimal .xlsx writer: one or more sheets of text and numbers with a bold
 * header row, optional right-to-left sheets, column widths and a frozen
 * header. Dependency-free (see zip.ts); opens in Excel, Google Sheets and
 * LibreOffice.
 */
import { buildZip } from "./zip";

export type Cell = string | number | null;

export interface Sheet {
  readonly name: string;
  readonly rightToLeft?: boolean;
  readonly columns: readonly { readonly header: string; readonly width?: number }[];
  readonly rows: readonly (readonly Cell[])[];
}

// Characters XML 1.0 cannot carry are dropped; the rest is escaped.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
export const escapeXml = (value: string): string =>
  value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Column letters for a 0-based index: 0 → A, 26 → AA. */
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Excel sheet names: ≤ 31 chars, none of : \ / ? * [ ], unique. */
export function safeSheetName(name: string, taken: Set<string>): string {
  const base = (name.replace(/[:\\/?*[\]]/g, " ").trim() || "Sheet").slice(0, 31);
  let candidate = base;
  for (let i = 2; taken.has(candidate.toLowerCase()); i += 1)
    candidate = `${base.slice(0, 28)} ${i}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

function cellXml(value: Cell, ref: string, bold: boolean): string {
  const style = bold ? ' s="1"' : "";
  if (value === null || value === "") return `<c r="${ref}"${style}/>`;
  if (typeof value === "number" && Number.isFinite(value))
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 18}" customWidth="1"/>`)
    .join("");
  const header = `<row r="1">${sheet.columns
    .map((c, i) => cellXml(c.header, `${columnName(i)}1`, true))
    .join("")}</row>`;
  const body = sheet.rows
    .map(
      (row, r) =>
        `<row r="${r + 2}">${row.map((v, i) => cellXml(v, `${columnName(i)}${r + 2}`, false)).join("")}</row>`,
    )
    .join("");
  const rtl = sheet.rightToLeft ? ' rightToLeft="1"' : "";
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<sheetViews><sheetView workbookViewId="0"${rtl}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`,
    cols ? `<cols>${cols}</cols>` : "",
    `<sheetData>${header}${body}</sheetData>`,
    "</worksheet>",
  ].join("");
}

const STYLES = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>',
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>',
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
  "</styleSheet>",
].join("");

export function buildXlsx(sheets: readonly Sheet[]): Uint8Array {
  const taken = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, taken));
  const sheetEntries = sheets.map((sheet, i) => ({
    path: `xl/worksheets/sheet${i + 1}.xml`,
    data: sheetXml(sheet),
  }));
  return buildZip([
    {
      path: "[Content_Types].xml",
      data: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        ...sheets.map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        ),
        "</Types>",
      ].join(""),
    },
    {
      path: "_rels/.rels",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      path: "xl/workbook.xml",
      data: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>',
        ...names.map(
          (name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        ),
        "</sheets></workbook>",
      ].join(""),
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      data: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        ...sheets.map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        ),
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
        "</Relationships>",
      ].join(""),
    },
    { path: "xl/styles.xml", data: STYLES },
    ...sheetEntries,
  ]);
}
