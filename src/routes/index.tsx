import { createFileRoute, Link } from "@tanstack/react-router";
import { Combine, FileSpreadsheet, Sheet, FileText, Layers, PenTool, Scissors, ShieldCheck } from "lucide-react";
import { Shell } from "@/components/pdf/Shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "حبر — عدّل ملفات PDF مجاناً" },
      { name: "description", content: "أضف نصاً وتوقيعاً، ارسم وظلّل، ادمج وقسّم ورتّب صفحات PDF داخل متصفحك." },
      { property: "og:title", content: "حبر — عدّل ملفات PDF مجاناً" },
      { property: "og:description", content: "محرر PDF عربي يعمل في متصفحك دون رفع ملفاتك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const tools = [
  { to: "/edit", icon: PenTool, title: "تعديل وتوقيع", desc: "أضف نصاً، وقّع، ارسم وظلّل على الصفحات." },
  { to: "/merge", icon: Combine, title: "دمج الملفات", desc: "اجمع عدة ملفات في ملف واحد بالترتيب الذي تريده." },
  { to: "/split", icon: Scissors, title: "تقسيم الملف", desc: "استخرج صفحات محددة أو افصل كل صفحة في ملف." },
  { to: "/organize", icon: Layers, title: "ترتيب الصفحات", desc: "دوّر، احذف وأعد ترتيب الصفحات." },
  { to: "/pdf-to-excel", icon: FileSpreadsheet, title: "PDF إلى Excel", desc: "حوّل الجداول والنصوص إلى خلايا قابلة للتعديل." },
  { to: "/excel-to-pdf", icon: Sheet, title: "Excel إلى PDF", desc: "حوّل جدولك إلى PDF بنفس التنسيق." },
] as const;

function Index() {
  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-10 md:pt-20">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
            <ShieldCheck className="h-4 w-4 text-accent" /> ملفاتك تبقى على جهازك
          </span>
          <h1 className="mt-5 text-5xl leading-tight text-primary md:text-6xl">
            كل ما تحتاجه
            <br />
            لتعديل <span className="text-accent">PDF</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            محرر مجاني بالعربية، بلا تسجيل وبلا رفع للملفات. اختر أداة وابدأ.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2">
        {tools.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group flex gap-4 rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-paper"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ink text-primary-foreground transition-colors group-hover:bg-none group-hover:bg-accent">
              <t.icon className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-display text-xl text-foreground">{t.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t.desc}</span>
            </span>
          </Link>
        ))}
      </section>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <FileText className="mx-auto mb-1 h-4 w-4" /> حبر — محرر PDF
      </footer>
    </Shell>
  );
}
