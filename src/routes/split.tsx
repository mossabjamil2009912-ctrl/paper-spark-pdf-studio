import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Busy, FileDrop, PageTitle, Shell } from "@/components/pdf/Shell";
import { baseName, downloadBytes, extractPages, parseRanges } from "@/lib/pdf-ops";
import { renderPages, type RenderedPage } from "@/lib/pdf-render";

export const Route = createFileRoute("/split")({
  head: () => ({
    meta: [
      { title: "تقسيم ملف PDF — حبر" },
      { name: "description", content: "استخرج صفحات من ملف PDF أو افصل كل صفحة في ملف مستقل." },
      { property: "og:title", content: "تقسيم ملف PDF — حبر" },
      { property: "og:description", content: "قسّم ملفات PDF بسهولة داخل متصفحك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SplitPage,
});

function SplitPage() {
  const [file, setFile] = useState<{ name: string; bytes: ArrayBuffer } | null>(null);
  const [pages, setPages] = useState<RenderedPage[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [ranges, setRanges] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (f: File) => {
    const bytes = await f.arrayBuffer();
    setFile({ name: f.name, bytes });
    setPages(null);
    try {
      setPages(await renderPages(bytes, 0.5));
    } catch {
      toast.error("تعذّر فتح الملف");
      setFile(null);
    }
  };

  const toggle = (i: number) => {
    const n = new Set(picked);
    n.has(i) ? n.delete(i) : n.add(i);
    setPicked(n);
    setRanges("");
  };

  const selected = pages
    ? ranges.trim()
      ? parseRanges(ranges, pages.length)
      : [...picked].sort((a, b) => a - b)
    : [];

  const extract = async () => {
    if (!file || !selected.length) return;
    setBusy(true);
    try {
      downloadBytes(await extractPages(file.bytes, selected), `${baseName(file.name)}-مقتطف.pdf`);
    } finally {
      setBusy(false);
    }
  };

  const splitAll = async () => {
    if (!file || !pages) return;
    setBusy(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < pages.length; i++) {
        zip.file(`${baseName(file.name)}-${i + 1}.pdf`, await extractPages(file.bytes, [i]));
      }
      downloadBytes(await zip.generateAsync({ type: "blob" }), `${baseName(file.name)}-صفحات.zip`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <PageTitle title="تقسيم الملف" sub="اختر الصفحات بالنقر أو اكتب نطاقاً مثل 1-3، 5." />
      {!file ? (
        <FileDrop onFiles={(f) => load(f[0])} />
      ) : !pages ? (
        <Busy />
      ) : (
        <div className="mx-auto max-w-6xl px-4 pb-16">
          <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <input
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              placeholder="مثال: 1-3، 7"
              className="h-9 w-40 rounded-md border bg-background px-3 text-sm"
              dir="ltr"
            />
            <Button onClick={extract} disabled={busy || !selected.length}>
              استخراج {selected.length ? `(${selected.length})` : ""}
            </Button>
            <Button variant="outline" onClick={splitAll} disabled={busy}>كل صفحة في ملف</Button>
            <Button variant="ghost" onClick={() => { setFile(null); setPicked(new Set()); setRanges(""); }}>ملف آخر</Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {pages.map((p, i) => {
              const on = selected.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`rounded-xl border-2 bg-paper p-2 transition-all ${on ? "border-accent shadow-paper" : "border-transparent"}`}
                >
                  <img src={p.src} alt={`صفحة ${i + 1}`} className="w-full" />
                  <span className={`mt-1 block text-sm ${on ? "font-semibold text-accent" : "text-muted-foreground"}`}>{i + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Shell>
  );
}
