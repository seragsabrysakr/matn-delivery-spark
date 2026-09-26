import { describe, expect, it } from "vitest";
import { buildXlsx, columnName, escapeXml, safeSheetName } from "../xlsx";
import { buildZip, crc32, listZipEntries } from "../zip";

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("stores entries in order with UTF-8 names", () => {
    const zip = buildZip([
      { path: "a.txt", data: "hello" },
      { path: "مجلد/ب.txt", data: new Uint8Array([1, 2, 3]) },
    ]);
    expect(listZipEntries(zip)).toEqual(["a.txt", "مجلد/ب.txt"]);
    // End-of-central-directory record is present with both entries.
    const view = new DataView(zip.buffer);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });
});

describe("xlsx helpers", () => {
  it("names columns like Excel", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("escapes XML and drops characters XML cannot carry", () => {
    expect(escapeXml(`a<b>&"c"\u0001`)).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });

  it("keeps sheet names valid and unique", () => {
    const taken = new Set<string>();
    expect(safeSheetName("Plan: Q1/Q2", taken)).toBe("Plan  Q1 Q2");
    expect(safeSheetName("plan  q1 q2", taken)).toBe("plan  q1 q2 2");
    expect(safeSheetName("x".repeat(40), taken)).toHaveLength(31);
  });
});

describe("buildXlsx", () => {
  it("produces the workbook parts and one sheet per input sheet", () => {
    const bytes = buildXlsx([
      {
        name: "جدول التسليم",
        rightToLeft: true,
        columns: [{ header: "الاسم" }, { header: "النسبة" }],
        rows: [
          ["تسجيل الدخول", 62.5],
          ["<script>", null],
        ],
      },
      { name: "Log", columns: [{ header: "A" }], rows: [] },
    ]);
    expect(listZipEntries(bytes)).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('rightToLeft="1"');
    expect(text).toContain("<v>62.5</v>");
    expect(text).toContain("&lt;script&gt;");
    expect(text).not.toContain("<script>");
    expect(text).toContain('<sheet name="جدول التسليم" sheetId="1" r:id="rId1"/>');
  });
});
