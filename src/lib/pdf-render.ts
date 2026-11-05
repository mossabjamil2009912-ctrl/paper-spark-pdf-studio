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

export type RenderedPage = { src: string; width: number; height: number };

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
    out.push({ src: canvas.toDataURL("image/jpeg", 0.85), width: base.width, height: base.height });
    page.cleanup();
  }
  await loadingTask.destroy();
  return out;
}
