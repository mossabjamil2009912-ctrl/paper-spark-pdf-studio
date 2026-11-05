import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Languages } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Busy, FileDrop, PageTitle, Shell } from "@/components/pdf/Shell";
import { baseName, downloadBytes } from "@/lib/pdf-ops";
import { translateSegments } from "@/lib/translate.functions";

export const Route = createFileRoute("/translate")({
  head: () => ({
    meta: [
      { title: "ترجمة PDF وExcel إلى الإنجليزية — حبر" },
      { name: "description", content: "ترجم ملفات PDF وExcel إلى الإنجليزية ترجمة احترافية تراعي المصطلحات والرموز مع الحفاظ على التنسيق." },
      { property: "og:title", content: "ترجمة PDF وExcel إلى الإنجليزية — حبر" },
      { property: "og:description", content: "ترجمة متخصصة غير حرفية مع بقاء التنسيق كما هو." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TranslatePage,
});

function TranslatePage() {
  const call = useServerFn(translateSegments);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const tr = async (segments: string[], context: string) => {
    const r = await call({ data: { segments, context } });
    if (r.error) throw new Error(r.error);
    return r.translations;
  };

  const run = async (f: File) => {
    setDone(null);
    setBusy("جارٍ قراءة الملف…");
    try {
      const lib = await import("@/lib/translate-doc");
      const progress = (p: number) => setBusy(`جارٍ الترجمة… ${Math.round(p * 100)}%`);
      const isXlsx = /\.xlsx$/i.test(f.name);
      let name: string;
      if (isXlsx) {
        const blob = await lib.translateXlsx(await f.arrayBuffer(), tr, progress);
        name = `${baseName(f.name)}-EN.xlsx`;
        downloadBytes(blob, name);
      } else {
        const bytes = await f.arrayBuffer();
        const { renderPages } = await import("@/lib/pdf-render");
        const { applyEdits } = await import("@/lib/pdf-ops");
        const pages = await renderPages(bytes.slice(0), 1.5);
        const all = pages.flatMap((p) => p.texts.map((x) => x.str.trim()));
        if (!all.length) { toast.error("هذا الملف صور ممسوحة بلا نص قابل للقراءة."); return; }
        const t = await lib.translateAll(all, tr, progress);
        setBusy("جارٍ كتابة الملف…");
        const out = await applyEdits(bytes, lib.pdfEdits(pages, t));
        name = `${baseName(f.name)}-EN.pdf`;
        downloadBytes(out, name);
      }
      setDone(name);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error && /[\u0600-\u06FF]/.test(e.message) ? e.message : "تعذّرت ترجمة الملف");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell>
      <PageTitle title="ترجمة إلى الإنجليزية" sub="ترجمة متخصصة تراعي مصطلحات مجال الملف وتحافظ على الأرقام والرموز والتنسيق — وليست ترجمة حرفية." />
      <p className="mx-auto mb-4 max-w-6xl px-4 text-sm text-muted-foreground">
        يُرسل نص الملف فقط (دون الملف نفسه) لخدمة الترجمة الذكية ثم يُعاد بناء الملف على جهازك.
      </p>
      {busy ? (
        <Busy text={busy} />
      ) : (
        <FileDrop onFiles={(fs) => fs[0] && run(fs[0])} label="اختر ملف PDF أو Excel" accept="application/pdf,.pdf,.xlsx" />
      )}
      {done && (
        <p className="mx-auto mt-6 flex max-w-6xl items-center gap-2 px-4 text-accent">
          <Languages className="h-5 w-5" /> تم تنزيل {done}
        </p>
      )}
    </Shell>
  );
}
