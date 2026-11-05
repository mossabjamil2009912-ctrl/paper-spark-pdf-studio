import type { RenderedPage } from "@/lib/pdf-render";
import type { PageEdits } from "@/lib/pdf-ops";

export type Translator = (segments: string[], context: string) => Promise<string[]>;

/** Characters the standard PDF fonts can encode; map common typographic ones to ASCII. */
export function toLatin1(s: string) {
  return s
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2009\u202F]/g, " ")
    .replace(/[^\x20-\x7E\u00A1-\u00FF\n]/g, "");
}

const needs = (s: string) => /[^\s\d.,:;%()\-+/\\*#=$€£@&|_[\]{}<>!?'"]/.test(s) && !/^[\x20-\x7E]*$/.test(s);

/** Translate unique strings in batches, sharing a short document context for terminology. */
export async function translateAll(strings: string[], tr: Translator, onProgress?: (p: number) => void) {
  const uniq = [...new Set(strings.filter(needs))];
  const context = uniq.join(" | ").slice(0, 3000);
  const map = new Map<string, string>();
  const size = 80;
  for (let i = 0; i < uniq.length; i += size) {
    const chunk = uniq.slice(i, i + size);
    const out = await tr(chunk, context);
    chunk.forEach((s, k) => map.set(s, out[k] ?? s));
    onProgress?.(Math.min(1, (i + size) / uniq.length));
  }
  return (s: string) => map.get(s) ?? s;
}

/** Build per-page cover + English text edits from detected text lines. */
export function pdfEdits(pages: RenderedPage[], t: (s: string) => string): Record<number, PageEdits> {
  const edits: Record<number, PageEdits> = {};
  pages.forEach((p, i) => {
    const e: PageEdits = { rects: [], texts: [] };
    for (const line of p.texts) {
      const src = line.str.trim();
      if (!needs(src)) continue;
      const en = toLatin1(t(src)).trim();
      if (!en) continue;
      const pad = 0.004;
      e.rects.push({ x: line.x - pad, y: line.y - pad, w: line.w + pad * 2, h: line.h + pad * 2, color: line.bg });
      // size as fraction of page width; shrink so the English fits the original line width
      let size = (line.h * p.height * 0.82) / p.width;
      const avg = line.bold ? 0.56 : 0.52;
      const maxW = Math.max(line.w, 0.05);
      if (en.length * avg * size > maxW) size = Math.max(maxW / (en.length * avg), size * 0.45);
      const ltrX = line.rtl ? line.x : line.x; // English always left-aligned at the line's left edge
      e.texts.push({
        x: ltrX, y: line.y + line.h * 0.08, text: en, size, color: line.fg,
        font: line.font.replace(/Amiri|IBM Plex Sans Arabic/g, ""), bold: line.bold, italic: line.italic, ltr: true,
      });
    }
    if (e.rects.length) edits[i] = e;
  });
  return edits;
}

/** Translate every text cell of an xlsx in place, keeping styles, merges, widths and formulas. */
export async function translateXlsx(data: ArrayBuffer, tr: Translator, onProgress?: (p: number) => void): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  type Hit = { cell: import("exceljs").Cell; rich?: { text: string }[] };
  const hits: Hit[] = [];
  const strings: string[] = [];
  wb.eachSheet((ws) => {
    strings.push(ws.name);
    ws.eachRow({ includeEmpty: false }, (row) =>
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.isMerged && cell.master !== cell) return;
        const v = cell.value as unknown;
        if (typeof v === "string") { hits.push({ cell }); strings.push(v); }
        else if (v && typeof v === "object" && "richText" in v) {
          const rich = (v as { richText: { text: string }[] }).richText;
          hits.push({ cell, rich }); rich.forEach((r) => strings.push(r.text));
        }
      }),
    );
  });
  const t = await translateAll(strings, tr, onProgress);
  for (const h of hits) {
    if (h.rich) h.cell.value = { richText: h.rich.map((r) => ({ ...r, text: t(r.text) })) };
    else h.cell.value = t(h.cell.value as string);
    const al = h.cell.alignment;
    if (al?.readingOrder === "rtl") h.cell.alignment = { ...al, readingOrder: "ltr" };
  }
  const used = new Set<string>();
  wb.eachSheet((ws) => {
    let n = t(ws.name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || ws.name;
    while (used.has(n)) n = `${n.slice(0, 28)} ${used.size}`;
    used.add(n);
    ws.name = n;
    ws.views = (ws.views?.length ? ws.views : [{}]).map((v) => ({ ...v, rightToLeft: false }));
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
