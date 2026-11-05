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
export type PageText = { str: string; x: number; y: number; w: number; h: number };
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
    const texts: PageText[] = [];
    try {
      const tc = await page.getTextContent();
      for (const raw of tc.items) {
        const it = raw as { str?: string; transform?: number[]; width?: number };
        if (!it.str?.trim() || !it.transform) continue;
        const t = pdfjs.Util.transform(base.transform, it.transform);
        const h = Math.hypot(t[2]!, t[3]!);
        const w = it.width ?? 0;
        if (h <= 0 || w <= 0) continue;
        texts.push({ str: it.str, x: t[4]! / base.width, y: (t[5]! - h) / base.height, w: w / base.width, h: (h * 1.2) / base.height });
      }
    } catch (e) { console.warn(e); }
    out.push({ texts, src: canvas.toDataURL("image/jpeg", 0.85), width: base.width, height: base.height });
    page.cleanup();
  }
  await loadingTask.destroy();
  return out;
}
