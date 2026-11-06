import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, FileDown, FileText, Image as ImageIcon, Music, Video } from "lucide-react";
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

type Kind = "pdf" | "image" | "video" | "audio";
type Res = "orig" | 270 | 360 | 720 | 1080;

const KINDS: { k: Kind; label: string; sub: string; Icon: typeof FileText }[] = [
  { k: "pdf", label: "ملف PDF", sub: "تصغير حجم الملف", Icon: FileText },
  { k: "image", label: "صورة", sub: "نفس الأبعاد بحجم أقل", Icon: ImageIcon },
  { k: "video", label: "فيديو", sub: "اختر الدقة ثم الفيديو", Icon: Video },
  { k: "audio", label: "استخراج الصوت", sub: "MP3 سريع", Icon: Music },
];

function Compress() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [vres, setVres] = useState<Res | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ name: string; before: number; after: number } | null>(null);

  const run = async (f: File) => {
    setRes(null);
    try {
      const lib = await import("@/lib/compress");
      const base = f.name.replace(/\.[^.]+$/, "");
      let blob: Blob, name: string;
      if (kind === "pdf") {
        setBusy("جارٍ ضغط ملف PDF…");
        const out = await lib.compressPdf(await f.arrayBuffer());
        blob = out.length < f.size ? new Blob([out as BlobPart], { type: "application/pdf" }) : f;
        name = base + "-مضغوط.pdf";
      } else if (kind === "image") {
        setBusy("جارٍ ضغط الصورة…");
        const r = await lib.compressImage(f);
        blob = r.blob;
        name = base + "-مضغوط." + r.ext;
      } else if (kind === "audio") {
        const prog = (p: number) => setBusy(`جارٍ استخراج الصوت… ${Math.round(p * 100)}%`);
        prog(0);
        const r = await lib.videoToMp3(f, prog);
        blob = r.blob;
        name = base + ".mp3";
      } else {
        const prog = (p: number) => setBusy(`جارٍ ضغط الفيديو… ${Math.round(p * 100)}%`);
        prog(0);
        const r = vres === "orig" || !vres ? await lib.compressVideo(f, prog) : await lib.convertVideo(f, vres, prog);
        blob = r.blob;
        name = base + (vres && vres !== "orig" ? `-${vres}p.` : "-مضغوط.") + r.ext;
      }
      downloadBytes(blob, name);
      setRes({ name, before: f.size, after: blob.size });
    } catch (e) {
      console.error(e);
      toast.error(kind === "audio" ? "تعذّر استخراج الصوت من هذا الملف" : "تعذّر ضغط الملف");
    } finally {
      setBusy(null);
    }
  };

  const back = () => {
    setRes(null);
    if (kind === "video" && vres) setVres(null);
    else setKind(null);
  };

  const drop = {
    pdf: { label: "اختر ملف PDF", accept: "application/pdf,.pdf", exts: [".pdf"] },
    image: { label: "اختر صورة", accept: "image/*", exts: [".jpg", ".jpeg", ".png", ".webp"] },
    video: { label: "اختر الفيديو", accept: "video/*", exts: [".mp4", ".mov", ".webm", ".mkv"] },
    audio: { label: "اختر فيديو أو ملف صوتي", accept: "video/*,audio/*", exts: [".mp4", ".mov", ".webm", ".mkv", ".m4a", ".wav", ".ogg", ".mp3"] },
  };

  return (
    <Shell>
      <PageTitle title="ضغط الملفات" sub="اختر نوع الملف أولًا." />
      <div className="mx-auto max-w-6xl px-4">
        {busy ? (
          <>
            <Busy text={busy} />
            {kind === "video" && (
              <p className="mt-3 text-center text-sm text-muted-foreground">ضغط الفيديو يستغرق نفس مدة الفيديو تقريبًا. أبقِ الصفحة مفتوحة.</p>
            )}
          </>
        ) : !kind ? (
          <div className="grid grid-cols-2 gap-3">
            {KINDS.map(({ k, label, sub, Icon }) => (
              <button key={k} onClick={() => { setKind(k); setVres(null); setRes(null); }}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-5 text-center hover:border-primary">
                <Icon className="h-8 w-8 text-primary" />
                <span className="font-bold">{label}</span>
                <span className="text-xs text-muted-foreground">{sub}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <button onClick={back} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
              <ArrowRight className="h-4 w-4" /> رجوع
            </button>
            {kind === "video" && !vres ? (
              <>
                <p className="mb-3 font-bold">اختر الدقة:</p>
                <div className="grid grid-cols-2 gap-3">
                  {([[1080, "1080p", "عالية جدًا"], [720, "720p", "عالية"], [360, "360p", "متوسطة"], [270, "270p", "أصغر حجم"], ["orig", "نفس الدقة", "الأصلية بحجم أقل"]] as const).map(([k, l, d]) => (
                    <button key={k} onClick={() => setVres(k)} className="rounded-xl border border-border bg-card p-4 text-center hover:border-primary">
                      <div className="text-lg font-bold">{l}</div>
                      <div className="text-xs text-muted-foreground">{d}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {kind === "video" && <p className="mb-3 text-sm">الدقة المختارة: <b>{vres === "orig" ? "نفس الدقة" : `${vres}p`}</b></p>}
                <FileDrop onFiles={(fs) => fs[0] && run(fs[0])} {...drop[kind]} />
              </>
            )}
          </>
        )}
        {res && !busy && (
          <p className="mt-6 flex items-center gap-2 text-accent">
            <FileDown className="h-5 w-5" />
            {kind === "audio"
              ? `تم تنزيل ${res.name} (${fmt(res.after)})`
              : res.after < res.before
                ? `تم تنزيل ${res.name}: ${fmt(res.before)} ← ${fmt(res.after)} (أصغر بنسبة ${Math.round((1 - res.after / res.before) * 100)}%)`
                : `الملف مضغوط مسبقًا ولا يمكن تصغيره أكثر دون فقدان الجودة (${fmt(res.before)}).`}
          </p>
        )}
      </div>
    </Shell>
  );
}
