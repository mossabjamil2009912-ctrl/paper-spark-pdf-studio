// Browser-only: pdfjs is imported lazily so SSR never evaluates it.
type Pdfjs = typeof import("pdfjs-dist");
let lib: Promise<Pdfjs> | null = null;

function getPdfjs() {
  if (!lib) {
    lib = (async () => {
      const m = await import("pdfjs-dist");
      const w = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      m.GlobalWorkerOptions.workerSrc = w.default;
      return m;
    })();
  }
  return lib;
}

/** Box in page fractions (0..1). */
export type PageText = { str: string; x: number; y: number; w: number; h: number; bg: string; fg: string };
export type RenderedPage = { src: string; width: number; height: number; texts: PageText[] };

/** Render each page to a JPEG data URL. width/height are the displayed size in PDF points. */
export async function renderPages(bytes: ArrayBuffer, scale = 2): Promise<RenderedPage[]> {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const doc = await loadingTask.promise;
  const out: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
    const raw: { str: string; x: number; y: number; w: number; h: number }[] = [];
    try {
      const tc = await page.getTextContent();
      for (const r of tc.items) {
        const it = r as { str?: string; transform?: number[]; width?: number };
        if (!it.str?.trim() || !it.transform) continue;
        const t = pdfjs.Util.transform(base.transform, it.transform);
        const h = Math.hypot(t[2]!, t[3]!);
        const w = it.width ?? 0;
        if (h <= 0 || w <= 0) continue;
        raw.push({ str: it.str, x: t[4]!, y: t[5]! - h, w, h });
      }
    } catch (e) { console.warn(e); }
    const texts = groupLines(raw).map((l) => {
      const c = sampleColors(ctx, l.x * scale, l.y * scale, l.w * scale, l.h * 1.2 * scale);
      return { str: l.str, x: l.x / base.width, y: l.y / base.height, w: l.w / base.width, h: (l.h * 1.2) / base.height, ...c };
    });
    out.push({ texts, src: canvas.toDataURL("image/jpeg", 0.85), width: base.width, height: base.height });
    page.cleanup();
  }
  await loadingTask.destroy();
  return out;
}

type Box = { str: string; x: number; y: number; w: number; h: number };
const AR = /[\u0600-\u06FF]/;

/** Merge pdf.js fragments sitting on the same baseline and close together into whole lines. */
export function groupLines(items: Box[]): Box[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Box[][] = [];
  for (const it of sorted) {
    const line = lines.find((l) => {
      const f = l[0]!;
      if (Math.abs(f.y + f.h - (it.y + it.h)) > Math.max(f.h, it.h) * 0.4) return false;
      const minX = Math.min(...l.map((b) => b.x)), maxX = Math.max(...l.map((b) => b.x + b.w));
      const gap = Math.max(minX - (it.x + it.w), it.x - maxX, 0);
      return gap < Math.max(f.h, it.h) * 1.5;
    });
    if (line) line.push(it); else lines.push([it]);
  }
  return lines.map((l) => {
    const rtl = l.some((b) => AR.test(b.str));
    l.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
    let str = "";
    l.forEach((b, i) => {
      if (i) {
        const p = l[i - 1]!;
        const gap = rtl ? p.x - (b.x + b.w) : b.x - (p.x + p.w);
        if (gap > b.h * 0.15 && !str.endsWith(" ") && !b.str.startsWith(" ")) str += " ";
      }
      str += b.str;
    });
    const x = Math.min(...l.map((b) => b.x)), y = Math.min(...l.map((b) => b.y));
    const r = Math.max(...l.map((b) => b.x + b.w)), bt = Math.max(...l.map((b) => b.y + b.h));
    return { str: str.trim(), x, y, w: r - x, h: bt - y };
  });
}

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** Background = most common colour on the box edge; foreground = pixel inside most unlike it. */
function sampleColors(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  try {
    const pad = 2;
    const X = Math.max(0, Math.floor(x - pad)), Y = Math.max(0, Math.floor(y - pad));
    const W = Math.max(1, Math.ceil(w + pad * 2)), H = Math.max(1, Math.ceil(h + pad * 2));
    const d = ctx.getImageData(X, Y, W, H).data;
    const counts = new Map<number, number>();
    const at = (i: number, j: number) => (j * W + i) * 4;
    const edge = (i: number, j: number) => {
      const k = at(i, j);
      const q = ((d[k]! >> 3) << 10) | ((d[k + 1]! >> 3) << 5) | (d[k + 2]! >> 3);
      counts.set(q, (counts.get(q) ?? 0) + 1);
    };
    for (let i = 0; i < W; i++) { edge(i, 0); edge(i, H - 1); }
    for (let j = 0; j < H; j++) { edge(0, j); edge(W - 1, j); }
    let best = 0, bq = 0x7fff;
    counts.forEach((c, q) => { if (c > best) { best = c; bq = q; } });
    const br = ((bq >> 10) & 31) * 8 + 4, bg = ((bq >> 5) & 31) * 8 + 4, bb = (bq & 31) * 8 + 4;
    let far = -1, fg = [0, 0, 0];
    for (let k = 0; k < d.length; k += 4) {
      const dist = Math.abs(d[k]! - br) + Math.abs(d[k + 1]! - bg) + Math.abs(d[k + 2]! - bb);
      if (dist > far) { far = dist; fg = [d[k]!, d[k + 1]!, d[k + 2]!]; }
    }
    return { bg: hex(Math.min(255, br), Math.min(255, bg), Math.min(255, bb)), fg: hex(fg[0]!, fg[1]!, fg[2]!) };
  } catch {
    return { bg: "#ffffff", fg: "#111111" };
  }
}
