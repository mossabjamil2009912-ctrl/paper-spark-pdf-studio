import { PDFDocument, degrees } from "pdf-lib";

/** Parse "1-3, 5, 8-" style ranges into 0-based page indices (in order, unique). */
export function parseRanges(input: string, pageCount: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of input.split(/[,،\s]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    let a: number, b: number;
    if (m) {
      a = m[1] ? parseInt(m[1], 10) : 1;
      b = m[2] ? parseInt(m[2], 10) : pageCount;
    } else if (/^\d+$/.test(part)) {
      a = b = parseInt(part, 10);
    } else continue;
    if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(pageCount, b); i++) {
      if (!seen.has(i - 1)) {
        seen.add(i - 1);
        out.push(i - 1);
      }
    }
  }
  return out;
}

export async function loadDoc(bytes: ArrayBuffer) {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

export async function mergePdfs(files: ArrayBuffer[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await loadDoc(f);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

export async function extractPages(bytes: ArrayBuffer, indices: number[]): Promise<Uint8Array> {
  const src = await loadDoc(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

export type PageEdit = { index: number; rotation: number };

/** Reorder / rotate / drop pages. `edits` lists the pages to keep, in output order. */
export async function organizePdf(bytes: ArrayBuffer, edits: PageEdit[]): Promise<Uint8Array> {
  const src = await loadDoc(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(
    src,
    edits.map((e) => e.index),
  );
  pages.forEach((p, i) => {
    const r = (((p.getRotation().angle + edits[i].rotation) % 360) + 360) % 360;
    p.setRotation(degrees(r));
    out.addPage(p);
  });
  return out.save();
}

/** Stamp a full-page transparent PNG overlay onto each page that has one. */
export async function stampOverlays(
  bytes: ArrayBuffer,
  overlays: Record<number, Uint8Array>,
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes);
  const pages = doc.getPages();
  for (const [k, png] of Object.entries(overlays)) {
    const page = pages[Number(k)];
    if (!page) continue;
    const img = await doc.embedPng(png);
    const { x, y, width, height } = page.getCropBox();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    // Overlay was drawn in the *displayed* orientation; map it back to page space.
    if (rot === 0) page.drawImage(img, { x, y, width, height });
    else if (rot === 90)
      page.drawImage(img, { x: x + width, y, width: height, height: width, rotate: degrees(90) });
    else if (rot === 180)
      page.drawImage(img, { x: x + width, y: y + height, width, height, rotate: degrees(180) });
    else page.drawImage(img, { x, y: y + height, width: height, height: width, rotate: degrees(270) });
  }
  return doc.save();
}

export function downloadBytes(bytes: Uint8Array | Blob, name: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function baseName(name: string) {
  return name.replace(/\.pdf$/i, "");
}
