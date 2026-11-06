import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Busy, FileDrop, PageTitle, Shell } from "@/components/pdf/Shell";
import { downloadBytes } from "@/lib/pdf-ops";

export const Route = createFileRoute("/compress")({
  head: () => ({
    meta: [
      { title: "ضغط PDF والصور والفيديو — أكتس" },
      { name: "description", content: "قلّل حجم ملفات PDF والصور والفيديو مع الحفاظ على نفس الأبعاد والدقة، داخل متصفحك." },
      { property: "og:title", content: "ضغط PDF والصور والفيديو — أكتس" },
      { property: "og:description", content: "ضغط الملفات بنفس الدقة داخل متصفحك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Compress,
});

const fmt = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");

function Compress() {
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ name: string; before: number; after: number } | null>(null);

  const run = async (f: File) => {
    setRes(null);
    try {
      const lib = await import("@/lib/compress");
      const base = f.name.replace(/\.[^.]+$/, "");
      let blob: Blob, name: string;
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        setBusy("جارٍ ضغط ملف PDF…");
        const out = await lib.compressPdf(await f.arrayBuffer());
        blob = out.length < f.size ? new Blob([out as BlobPart], { type: "application/pdf" }) : f;
        name = base + "-مضغوط.pdf";
      } else if (f.type.startsWith("image/")) {
        setBusy("جارٍ ضغط الصورة…");
        const r = await lib.compressImage(f);
        blob = r.blob;
        name = base + "-مضغوط." + r.ext;
      } else if (f.type.startsWith("video/")) {
        setBusy("جارٍ ضغط الفيديو… 0%");
        const r = await lib.compressVideo(f, (p) => setBusy(`جارٍ ضغط الفيديو… ${Math.round(p * 100)}%`));
        blob = r.blob;
        name = base + "-مضغوط." + r.ext;
      } else {
        toast.error("نوع الملف غير مدعوم");
        return;
      }
      downloadBytes(blob, name);
      setRes({ name, before: f.size, after: blob.size });
    } catch (e) {
      console.error(e);
      toast.error("تعذّر ضغط الملف");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell>
      <PageTitle title="ضغط الملفات" sub="PDF أو صورة أو فيديو — حجم أصغر بنفس الأبعاد والدقة." />
      {busy ? (
        <Busy text={busy} />
      ) : (
        <FileDrop
          onFiles={(fs) => fs[0] && run(fs[0])}
          label="اختر ملف PDF أو صورة أو فيديو"
          accept="application/pdf,.pdf,image/*,video/*"
          exts={[".pdf", ".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"]}
        />
      )}
      {busy?.includes("الفيديو") && (
        <p className="mx-auto mt-3 max-w-6xl px-4 text-center text-sm text-muted-foreground">
          ضغط الفيديو يستغرق نفس مدة الفيديو تقريبًا. أبقِ الصفحة مفتوحة.
        </p>
      )}
      {res && (
        <p className="mx-auto mt-6 flex max-w-6xl items-center gap-2 px-4 text-accent">
          <FileDown className="h-5 w-5" />
          {res.after < res.before
            ? `تم تنزيل ${res.name}: ${fmt(res.before)} ← ${fmt(res.after)} (أصغر بنسبة ${Math.round((1 - res.after / res.before) * 100)}%)`
            : `الملف مضغوط مسبقًا ولا يمكن تصغيره أكثر دون فقدان الجودة (${fmt(res.before)}).`}
        </p>
      )}
    </Shell>
  );
}
