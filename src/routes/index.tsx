import { createFileRoute } from "@tanstack/react-router";
import { Languages, Combine, FileSpreadsheet, Sheet, PenTool, Scissors } from "lucide-react";
import { Shell } from "@/components/pdf/Shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "أكتس — أدوات PDF وExcel" },
      { name: "description", content: "أضف نصاً وتوقيعاً، ارسم وظلّل، ادمج وقسّم ورتّب صفحات PDF داخل متصفحك." },
      { property: "og:title", content: "أكتس — أدوات PDF وExcel" },
      { property: "og:description", content: "عدّل، قسّم، ادمج، حوّل وترجم ملفات PDF وExcel بسهولة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const tools = [
  { to: "/edit", icon: PenTool, title: "تعديل PDF" },
  { to: "/split", icon: Scissors, title: "تقسيم الملف" },
  { to: "/merge", icon: Combine, title: "دمج الملفات" },
  { to: "/pdf-to-excel", icon: FileSpreadsheet, title: "تحويل PDF إلى Excel" },
  { to: "/excel-to-pdf", icon: Sheet, title: "تحويل Excel إلى PDF" },
  { to: "/translate", href: "/translate?to=ar", icon: Languages, title: "ترجمة إلى العربية" },
  { to: "/translate", href: "/translate?to=en", icon: Languages, title: "ترجمة إلى الإنجليزية" },
] as const;

function Index() {
  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-4 pt-10 pb-6 text-center">
        <h1 className="text-3xl font-bold text-primary md:text-4xl">اختر الخدمة</h1>
      </section>
      <section className="mx-auto grid max-w-3xl gap-3 px-4 pb-16 sm:grid-cols-2">
        {tools.map((t) => (
          <a
            key={t.title}
            href={"href" in t ? t.href : t.to}
            className="group flex items-center gap-4 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-paper"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ink text-primary-foreground transition-colors group-hover:bg-none group-hover:bg-accent">
              <t.icon className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-lg font-bold text-foreground">{t.title}</span>
            </span>
          </a>
        ))}
      </section>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        أكتس لأنظمة الطاقة وحلولها
      </footer>
    </Shell>
  );
}
