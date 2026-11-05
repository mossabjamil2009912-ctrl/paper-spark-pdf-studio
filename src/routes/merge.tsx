import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, FileText, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDrop, PageTitle, Shell } from "@/components/pdf/Shell";
import { downloadBytes, mergePdfs } from "@/lib/pdf-ops";

export const Route = createFileRoute("/merge")({
  head: () => ({
    meta: [
      { title: "دمج ملفات PDF — حبر" },
      { name: "description", content: "ادمج عدة ملفات PDF في ملف واحد مجاناً داخل متصفحك." },
      { property: "og:title", content: "دمج ملفات PDF — حبر" },
      { property: "og:description", content: "اجمع ملفات PDF بالترتيب الذي تريده." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MergePage,
});

function MergePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const more = useRef<HTMLInputElement>(null);

  const move = (i: number, d: number) =>
    setFiles((f) => {
      const n = [...f];
      const j = i + d;
      if (j < 0 || j >= n.length) return f;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const run = async () => {
    setBusy(true);
    try {
      const out = await mergePdfs(await Promise.all(files.map((f) => f.arrayBuffer())));
      downloadBytes(out, "مدمج.pdf");
      toast.success("تم الدمج");
    } catch (e) {
      console.error(e);
      toast.error("تعذّر دمج الملفات. تأكد أنها ملفات PDF سليمة.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <PageTitle title="دمج الملفات" sub="أضف ملفين أو أكثر ورتّبها ثم ادمجها." />
      {files.length === 0 ? (
        <FileDrop multiple label="اختر ملفات PDF" onFiles={setFiles} />
      ) : (
        <div className="mx-auto max-w-3xl px-4 pb-16">
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-sm font-semibold">{i + 1}</span>
                <FileText className="h-5 w-5 text-accent" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} aria-label="للأعلى"><ArrowUp /></Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} aria-label="للأسفل"><ArrowDown /></Button>
                <Button size="icon" variant="ghost" onClick={() => setFiles((x) => x.filter((_, k) => k !== i))} aria-label="إزالة"><X /></Button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => more.current?.click()}><Plus /> إضافة ملفات</Button>
            <Button onClick={run} disabled={busy || files.length < 2}>{busy ? "جارٍ الدمج…" : "دمج وتحميل"}</Button>
          </div>
          <input
            ref={more}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              const add = Array.from(e.target.files ?? []);
              setFiles((f) => [...f, ...add]);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </Shell>
  );
}
