// Browser-only PDF <-> Excel conversion. exceljs is imported lazily.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { toVisual } from "./arabic";
import type { Frag, RenderedPage } from "./pdf-render";

const AR = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/* ---------------- numbers ---------------- */

/** Turn "1,234.50" / "-12" / "45%" into a number + Excel format; leaves codes like "007" or "2-3" as text. */
export function parseNumber(s: string): { value: number; fmt?: string } | null {
  const t = s.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const m = t.match(/^(-|\()?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\))?(%)?$/);
  if (!m) return null;
  const intPart = m[2]!;
  if (/^0\d/.test(intPart.replace(/,/g, ""))) return null;
  if (intPart.replace(/,/g, "").length > 15) return null;
  if (!!m[1] !== !!m[4] && m[1] === "(") return null;
  const dec = m[3] ?? "";
  let value = parseFloat(intPart.replace(/,/g, "") + (dec ? "." + dec : ""));
  if (m[1]) value = -value;
  const comma = intPart.includes(",");
  let fmt = (comma ? "#,##0" : "0") + (dec ? "." + "0".repeat(dec.length) : "");
  if (m[5]) { value /= 100; fmt += "%"; }
  if (m[1] === "(") fmt = `${fmt};(${fmt})`;
  const plain = !comma && !dec && !m[5] && !m[1];
  return plain ? { value } : { value, fmt };
}

/* ---------------- PDF -> Excel ---------------- */

type Seg = { str: string; x: number; r: number; y: number; h: number; base: number; bold: boolean; italic: boolean; fontName: string; generic: string; fg: string; bg: string; rtl: boolean };

function segmentsOfLine(frags: Frag[]): Seg[] {
  const rtl = frags.some((f) => AR.test(f.str));
  const byX = [...frags].sort((a, b) => a.x - b.x);
  const groups: Frag[][] = [];
  for (const f of byX) {
    const g = groups[groups.length - 1];
    const last = g?.[g.length - 1];
    if (g && last && f.x - (last.x + last.w) < Math.max(f.h, last.h) * 0.9) g.push(f);
    else groups.push([f]);
  }
  return groups.map((g) => {
    const ord = rtl ? [...g].reverse() : g;
    let str = "";
    ord.forEach((f, i) => {
      if (i) {
        const p = ord[i - 1]!;
        const gap = rtl ? p.x - (f.x + f.w) : f.x - (p.x + p.w);
        if (gap > f.h * 0.12 && !str.endsWith(" ") && !f.str.startsWith(" ")) str += " ";
      }
      str += f.str;
    });
    const main = [...g].sort((a, b) => b.w - a.w)[0]!;
    const x = Math.min(...g.map((f) => f.x)), r = Math.max(...g.map((f) => f.x + f.w));
    const y = Math.min(...g.map((f) => f.y)), base = Math.max(...g.map((f) => f.y + f.h));
    return {
      str: str.normalize("NFKC").replace(/\s+/g, " ").trim(), x, r, y, h: main.h, base,
      bold: /bold|black|heavy|semibold|demi|w[6-9]/i.test(main.fontName),
      italic: /italic|oblique/i.test(main.fontName),
      fontName: main.fontName, generic: main.generic, fg: main.fg, bg: main.bg, rtl: AR.test(str),
    };
  });
}

function excelFont(seg: Seg) {
  const n = seg.fontName.toLowerCase();
  if (/mono|courier|consol/.test(n) || seg.generic === "monospace") return "Courier New";
  if (/times|serif|roman|georgia|garamond|cambria|amiri|naskh|traditional|lotus/.test(n) && !/sans/.test(n)) return seg.rtl ? "Traditional Arabic" : "Times New Roman";
  if (/calibri/.test(n)) return "Calibri";
  if (/tahoma/.test(n)) return "Tahoma";
  if (/verdana/.test(n)) return "Verdana";
  return "Arial";
}

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase().slice(0, 6);
const nearWhite = (hex: string) => {
  const v = hex.replace("#", "").match(/../g)?.map((h) => parseInt(h, 16)) ?? [255, 255, 255];
  return v.every((c) => c > 238);
};
const nearBlack = (hex: string) => {
  const v = hex.replace("#", "").match(/../g)?.map((h) => parseInt(h, 16)) ?? [0, 0, 0];
  return v.every((c) => c < 50);
};

/** Lay a page's text out on a grid: lines become rows, aligned x-gaps become columns. */
export function layoutPage(page: Pick<RenderedPage, "frags" | "width" | "height">) {
  const frags = page.frags.filter((f) => f.str.trim());
  const sorted = [...frags].sort((a, b) => a.y + a.h - (b.y + b.h));
  const lines: Frag[][] = [];
  for (const f of sorted) {
    const l = lines[lines.length - 1];
    const lb = l ? Math.max(...l.map((g) => g.y + g.h)) : 0;
    if (l && Math.abs(lb - (f.y + f.h)) < Math.max(f.h, l[0]!.h) * 0.45) l.push(f);
    else lines.push([f]);
  }
  const rows = lines.map(segmentsOfLine);
  // Column separators: x-gaps not covered by any segment of a multi-segment line.
  const multi = rows.filter((r) => r.length > 1).flat();
  const ivs = multi.map((s) => [s.x, s.r] as [number, number]).sort((a, b) => a[0] - b[0]);
  const bands: [number, number][] = [];
  for (const iv of ivs) {
    const b = bands[bands.length - 1];
    if (b && iv[0] <= b[1] + 1.5) b[1] = Math.max(b[1], iv[1]);
    else bands.push([iv[0], iv[1]]);
  }
  let cuts: number[] = [];
  if (bands.length > 1) for (let i = 1; i < bands.length; i++) cuts.push((bands[i - 1]![1] + bands[i]![0]) / 2);
  cuts = [0, ...cuts, page.width];
  const cols = cuts.slice(0, -1).map((c, i) => [c, cuts[i + 1]!] as [number, number]);
  const chars = frags.map((f) => f.str).join("");
  const rtl = (chars.match(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g)?.length ?? 0) > (chars.match(/[A-Za-z]/g)?.length ?? 0);
  return { rows, cols, rtl };
}

export async function pdfToXlsx(pages: RenderedPage[], perPageSheets = true): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "حبر";
  let ws: import("exceljs").Worksheet | null = null;
  let rowOffset = 0;
  pages.forEach((page, pi) => {
    const { rows, cols, rtl } = layoutPage(page);
    if (perPageSheets || !ws) {
      ws = wb.addWorksheet(perPageSheets ? `صفحة ${pi + 1}` : "الملف", {
        views: [{ rightToLeft: rtl, showGridLines: false }],
        pageSetup: { orientation: page.width > page.height ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
      });
      rowOffset = 0;
      // column order: Excel column A is on the right for RTL sheets
      const ordered = rtl ? [...cols].reverse() : cols;
      ordered.forEach((c, i) => {
        const px = ((c[1] - c[0]) / 0.75);
        ws!.getColumn(i + 1).width = Math.max(1, (px - 5) / 7);
      });
    }
    const sheet = ws!;
    const colIndex = (x: number) => {
      let i = cols.findIndex((c) => x >= c[0] && x < c[1]);
      if (i < 0) i = x < 0 ? 0 : cols.length - 1;
      return rtl ? cols.length - i : i + 1;
    };
    let prevBase = 0;
    const spans: { top: number; base: number }[] = [];
    rows.forEach((segs, ri) => {
      const rowNo = rowOffset + ri + 1;
      const base = Math.max(...segs.map((s) => s.base));
      const maxH = Math.max(...segs.map((s) => s.h));
      const height = ri === 0 ? Math.max(maxH * 1.35, base - (perPageSheets ? 0 : 0)) : base - prevBase;
      const rh = Math.min(409, Math.max(maxH * 1.25, height));
      sheet.getRow(rowNo).height = rh;
      spans.push({ top: base - rh, base });
      prevBase = base;
      const used = new Set<number>();
      for (const s of segs) {
        const anchor = s.rtl ? s.r - 0.01 : s.x + 0.01;
        let c1 = colIndex(anchor);
        const span = [colIndex(s.x + 0.01), colIndex(s.r - 0.01)].sort((a, b) => a - b) as [number, number];
        if (used.has(c1)) {
          c1 = span.find((c) => !used.has(c)) ?? c1;
        }
        const free = [];
        for (let c = span[0]; c <= span[1]; c++) if (!used.has(c)) free.push(c);
        const doMerge = span[1] > span[0] && free.length === span[1] - span[0] + 1;
        if (doMerge) c1 = span[0];
        const cell = sheet.getCell(rowNo, c1);
        const num = parseNumber(s.str);
        if (num) { cell.value = num.value; if (num.fmt) cell.numFmt = num.fmt; }
        else cell.value = s.str;
        const size = Math.max(4, Math.round(s.h * 2) / 2);
        cell.font = { name: excelFont(s), size, bold: s.bold, italic: s.italic, ...(nearBlack(s.fg) ? {} : { color: { argb: argb(s.fg) } }) };
        if (!nearWhite(s.bg)) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(s.bg) } };
        // alignment inside its column band(s)
        const ci = cols.findIndex((c) => (s.x + s.r) / 2 >= c[0] && (s.x + s.r) / 2 < c[1]);
        const band = cols[Math.max(0, ci)]!;
        const left = s.x - band[0], right = band[1] - s.r;
        const centered = doMerge || (Math.abs(left - right) < 3 && left > 4 && segs.length > 1);
        const horizontal = centered ? "center" : num ? "right" : s.rtl ? "right" : "left";
        cell.alignment = { horizontal, vertical: "bottom", readingOrder: s.rtl ? "rtl" : "ltr" };
        used.add(c1);
        // merge cells the text physically covers so wide titles keep their place
        if (doMerge) {
          try { sheet.mergeCells(rowNo, span[0], rowNo, span[1]); } catch { /* overlap */ }
          for (let c = span[0]; c <= span[1]; c++) used.add(c);
        }
      }
    });
    // pictures: anchor each at its original spot over the grid
    for (const im of page.images ?? []) {
      let r = spans.findIndex((sp) => sp.base > im.y);
      let rowF: number;
      if (r < 0) {
        const last = spans[spans.length - 1];
        rowF = spans.length + (im.y - (last?.base ?? 0)) / 15;
      } else {
        const sp = spans[r]!;
        rowF = r + Math.max(0, (im.y - sp.top) / Math.max(1, sp.base - sp.top));
      }
      const edge = rtl ? im.x + im.w : im.x;
      let i = cols.findIndex((c) => edge >= c[0] && edge <= c[1]);
      if (i < 0) i = edge <= 0 ? 0 : cols.length - 1;
      const c = cols[i]!;
      const colF = rtl ? cols.length - 1 - i + (c[1] - edge) / Math.max(1, c[1] - c[0]) : i + (edge - c[0]) / Math.max(1, c[1] - c[0]);
      const id = wb.addImage({ base64: im.src, extension: "png" });
      sheet.addImage(id, { tl: { col: colF, row: rowOffset + rowF } as never, ext: { width: im.w / 0.75, height: im.h / 0.75 }, editAs: "oneCell" });
    }
    rowOffset += rows.length + 1;
  });
  if (!wb.worksheets.length) wb.addWorksheet("صفحة 1");
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* ---------------- Excel -> PDF ---------------- */

type XCell = import("exceljs").Cell;

function colorOf(c: { argb?: string; theme?: number } | undefined, fallback: [number, number, number] | null): [number, number, number] | null {
  if (c?.argb && c.argb.length >= 6) {
    const h = c.argb.slice(-6);
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  return fallback;
}

/** Render a cell value the way Excel displays it (number formats, percents, dates). */
export function displayText(cell: Pick<XCell, "value" | "numFmt">): string {
  let v: unknown = cell.value;
  if (v && typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; hyperlink?: string; error?: string };
    if ("result" in o) v = o.result;
    else if (o.richText) return o.richText.map((r) => r.text).join("");
    else if (o.text !== undefined) return String(o.text);
    else if (o.error) return o.error;
  }
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const fmt = (cell.numFmt ?? "").split(";")[0] ?? "";
    if (/[dmy]{2}/i.test(fmt) && !/0/.test(fmt)) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.toISOString().slice(0, 10);
    }
    const pct = fmt.includes("%");
    const n = pct ? v * 100 : v;
    const decM = fmt.match(/\.(0+)/);
    const dec = decM ? decM[1]!.length : fmt ? 0 : -1;
    const opts: Intl.NumberFormatOptions = { useGrouping: fmt.includes(","), ...(dec >= 0 ? { minimumFractionDigits: dec, maximumFractionDigits: dec } : { maximumFractionDigits: 10 }) };
    let s = new Intl.NumberFormat("en-US", opts).format(Math.abs(n));
    if (n < 0) s = (cell.numFmt ?? "").includes("(") ? `(${s})` : "-" + s;
    const cur = fmt.match(/["]?([$€£¥]|ر\.س|ريال)["]?/);
    if (cur) s = cur[1] + s;
    return pct ? s + "%" : s;
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

type Fonts = { get(bold: boolean): Promise<PDFFont> };

function drawRun(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, color: [number, number, number]) {
  const chars = [...(AR.test(text) ? toVisual(text) : text)];
  let cx = x;
  for (const ch of chars) {
    let w = 0;
    try { w = font.widthOfTextAtSize(ch, size); } catch { continue; }
    if (ch.trim()) { try { page.drawText(ch, { x: cx, y, size, font, color: rgb(...color) }); } catch { /* missing glyph */ } }
    cx += w;
  }
}
const textWidth = (font: PDFFont, s: string, size: number) =>
  [...(AR.test(s) ? toVisual(s) : s)].reduce((a, ch) => { try { return a + font.widthOfTextAtSize(ch, size); } catch { return a; } }, 0);

function wrap(font: PDFFont, text: string, size: number, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? line + " " + w : w;
      if (line && textWidth(font, t, size) > maxW) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

export async function xlsxToPdf(data: ArrayBuffer): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const cache = new Map<string, PDFFont>();
  const fonts: Fonts = {
    async get(bold) {
      const key = bold ? "Bold" : "Regular";
      let f = cache.get(key);
      if (!f) {
        const bytes = await (await fetch(`/fonts/IBMPlexSansArabic-${key}.ttf`)).arrayBuffer();
        f = await doc.embedFont(bytes, { subset: false });
        cache.set(key, f);
      }
      return f;
    },
  };

  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== "visible") continue;
    let maxR = 0, maxC = 0;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (displayText(cell) !== "" || cell.fill || cell.border) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
      });
    });
    if (!maxR) continue;
    const rtl = !!ws.views?.[0]?.rightToLeft;
    const colW: number[] = [];
    for (let c = 1; c <= maxC; c++) {
      const col = ws.getColumn(c);
      const w = col.hidden ? 0 : col.width ?? ws.properties.defaultColWidth ?? 8.43;
      colW.push(w ? (w * 7 + 5) * 0.75 : 0);
    }
    const rowH: number[] = [];
    for (let r = 1; r <= maxR; r++) {
      const row = ws.getRow(r);
      rowH.push(row.hidden ? 0 : row.height ?? ws.properties.defaultRowHeight ?? 15);
    }
    // merged ranges: master -> span, others skipped
    const merged = new Map<string, { r2: number; c2: number }>();
    const slave = new Set<string>();
    const mergesModel = (ws.model as { merges?: string[] }).merges ?? [];
    for (const ref of mergesModel) {
      const [a, b] = ref.split(":");
      if (!a || !b) continue;
      const A = ws.getCell(a), B = ws.getCell(b);
      const r1 = Number(A.row), c1 = Number(A.col), r2 = Number(B.row), c2 = Number(B.col);
      merged.set(`${r1}:${c1}`, { r2, c2 });
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) slave.add(`${r}:${c}`);
    }
    const totalW = colW.reduce((a, b) => a + b, 0);
    const landscape = ws.pageSetup?.orientation === "landscape" || totalW > 540;
    const PW = landscape ? 842 : 595, PH = landscape ? 595 : 842, M = 28;
    const scale = Math.min(1, (PW - 2 * M) / totalW);
    const colX: number[] = [0];
    colW.forEach((w) => colX.push(colX[colX.length - 1]! + w * scale));
    // paginate rows
    const pagesRows: [number, number][] = [];
    let start = 1, acc = 0;
    for (let r = 1; r <= maxR; r++) {
      const h = rowH[r - 1]! * scale;
      if (acc + h > PH - 2 * M && r > start) { pagesRows.push([start, r - 1]); start = r; acc = 0; }
      acc += h;
    }
    pagesRows.push([start, maxR]);

    for (const [r0, r1] of pagesRows) {
      const page = doc.addPage([PW, PH]);
      const rowY: Record<number, number> = {};
      let y = PH - M;
      for (let r = r0; r <= maxR; r++) { rowY[r] = y; y -= rowH[r - 1]! * scale; }
      rowY[maxR + 1] = y;
      const box = (r: number, c: number, r2: number, c2: number) => {
        const top = rowY[r]!, bottom = rowY[Math.min(r2, r1) + 1] ?? rowY[r2 + 1]!;
        const x1 = rtl ? PW - M - colX[c2]! : M + colX[c - 1]!;
        const x2 = rtl ? PW - M - colX[c - 1]! : M + colX[c2]!;
        return { x: x1, y: bottom, w: x2 - x1, h: top - bottom };
      };
      // pass 1: fills, pass 2: borders, pass 3: text
      for (const pass of [0, 1, 2]) {
        for (let r = r0; r <= r1; r++) {
          if (!rowH[r - 1]) continue;
          for (let c = 1; c <= maxC; c++) {
            if (slave.has(`${r}:${c}`) || !colW[c - 1]) continue;
            const cell = ws.getCell(r, c);
            const m = merged.get(`${r}:${c}`);
            const b = box(r, c, m?.r2 ?? r, m?.c2 ?? c);
            if (pass === 0) {
              const fill = cell.fill as { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined;
              const col = fill?.type === "pattern" && fill.pattern !== "none" ? colorOf(fill.fgColor, null) : null;
              if (col) page.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color: rgb(...col) });
            } else if (pass === 1) {
              const bd = cell.border ?? {};
              const side = (s: { style?: string; color?: { argb?: string } } | undefined, x1: number, y1: number, x2: number, y2: number) => {
                if (!s?.style) return;
                const t = /thick/.test(s.style) ? 1.6 : /medium/.test(s.style) ? 1.1 : /hair/.test(s.style) ? 0.3 : 0.6;
                page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t * Math.max(scale, 0.6), color: rgb(...(colorOf(s.color, [0, 0, 0])!)),
                  ...(/dash|dot/.test(s.style) ? { dashArray: [2, 2] } : {}) });
              };
              const L = rtl ? bd.right : bd.left, R = rtl ? bd.left : bd.right;
              side(bd.top, b.x, b.y + b.h, b.x + b.w, b.y + b.h);
              side(bd.bottom, b.x, b.y, b.x + b.w, b.y);
              side(L, b.x, b.y, b.x, b.y + b.h);
              side(R, b.x + b.w, b.y, b.x + b.w, b.y + b.h);
            } else {
              const text = displayText(cell);
              if (!text) continue;
              const f = cell.font ?? {};
              const font = await fonts.get(!!f.bold);
              const size = (f.size ?? 11) * scale;
              const color = colorOf(f.color, [0, 0, 0])!;
              const al = cell.alignment ?? {};
              const isNum = typeof cell.value === "number" || (typeof cell.value === "object" && cell.value !== null && typeof (cell.value as { result?: unknown }).result === "number");
              const pad = 2 * scale;
              const lines = al.wrapText ? wrap(font, text, size, b.w - 2 * pad) : text.split("\n");
              const lh = size * 1.25;
              const blockH = lines.length * lh;
              const v = al.vertical ?? "bottom";
              let ty = v === "top" ? b.y + b.h - size - pad : v === "middle" ? b.y + (b.h + blockH) / 2 - size : b.y + pad + (lines.length - 1) * lh + size * 0.2;
              const textRtl = AR.test(text);
              let h = al.horizontal ?? (isNum ? "right" : "general");
              if (h === "general") h = textRtl || rtl ? "right" : "left";
              for (const ln of lines) {
                const w = textWidth(font, ln, size);
                // overflow into neighbours like Excel does for unwrapped text
                const x = h === "center" || h === "centerContinuous" ? b.x + (b.w - w) / 2 : h === "right" ? b.x + b.w - pad - w : b.x + pad;
                drawRun(page, font, ln, x, ty, size, color);
                ty -= lh;
              }
            }
          }
        }
      }
    }
  }
  if (!doc.getPageCount()) doc.addPage([595, 842]);
  return doc.save();
}
