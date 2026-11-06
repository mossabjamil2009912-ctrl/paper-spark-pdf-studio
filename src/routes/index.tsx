import { createFileRoute } from "@tanstack/react-router";
import {
  Languages,
  ArrowLeftRight,
  FilePen,
  Layers,
  Shrink,
  Stamp,
  ImagePlay,
  type LucideIcon,
} from "lucide-react";
import { Shell } from "@/components/pdf/Shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "أكتس — أدوات PDF وExcel" },
      { name: "description", content: "عدّل، قسّم، ادمج، حوّل، ترجم واضغط ملفات PDF وExcel داخل متصفحك." },
      { property: "og:title", content: "أكتس — أدوات PDF وExcel" },
      { property: "og:description", content: "عدّل، قسّم، ادمج، حوّل وترجم ملفات PDF وExcel بسهولة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Tool = {
  icon: LucideIcon;
  title: string;
  tile: string;
  href?: string;
  options?: { label: string; href: string }[];
};

const tools: Tool[] = [
  { icon: FilePen, title: "تعديل PDF", tile: "tile-red", href: "/edit" },
  {
    icon: ArrowLeftRight,
    title: "تحويل PDF ⇄ Excel",
    tile: "tile-green",
    options: [
      { label: "من PDF إلى Excel", href: "/pdf-to-excel" },
      { label: "من Excel إلى PDF", href: "/excel-to-pdf" },
    ],
  },
  {
    icon: Languages,
    title: "ترجمة الملفات",
    tile: "tile-blue",
    options: [
      { label: "إلى العربية", href: "/translate?to=ar" },
      { label: "إلى الإنجليزية", href: "/translate?to=en" },
    ],
  },
  {
    icon: Layers,
    title: "دمج وتقسيم",
    tile: "tile-yellow",
    options: [
      { label: "دمج الملفات", href: "/merge" },
      { label: "تقسيم الملف", href: "/split" },
    ],
  },
  { icon: Shrink, title: "ضغط PDF والصور والفيديو", tile: "tile-teal", href: "/compress" },
  {
    icon: Stamp,
    title: "أدوات إضافية",
    tile: "tile-lime",
    options: [
      { label: "ترقيم وعلامة مائية", href: "/stamp" },
      { label: "PDF إلى صور", href: "/pdf-to-images" },
    ],
  },
];

function Index() {
  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-4 pt-5 pb-3 text-center">
        <h1 className="text-2xl font-bold text-primary md:text-3xl">اختر الخدمة</h1>
      </section>
      <section className="mx-auto grid max-w-3xl gap-2 px-4 pb-10 sm:grid-cols-2">
        {tools.map((t) => {
          const Icon = t.icon;
          const head = (
            <div className="flex items-center gap-3">
              <span className={`${t.tile} relative grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-paper transition-transform group-hover:-rotate-6 group-hover:scale-105`}>
                <Icon className="h-5 w-5" strokeWidth={2.2} />
                <span className="absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full bg-card/70" />
              </span>
              <span className="text-base font-bold text-foreground">{t.title}</span>
            </div>
          );
          if (t.href)
            return (
              <a key={t.title} href={t.href} className="group rounded-xl border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-paper">
                {head}
              </a>
            );
          return (
            <div key={t.title} className="group rounded-xl border bg-card p-3">
              {head}
              <div className="mt-2 grid grid-cols-2 gap-2">
                {t.options!.map((o) => (
                  <a key={o.href} href={o.href} dir="auto" className="rounded-xl border bg-secondary px-2 py-1.5 text-center text-xs font-bold text-foreground transition-colors hover:border-accent hover:text-accent">
                    {o.label}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">أكتس لأنظمة الطاقة وحلولها</footer>
    </Shell>
  );
}
