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
      <section className="mx-auto max-w-3xl px-4 pt-8 pb-5 text-center">
        <h1 className="text-3xl font-bold text-primary md:text-4xl">اختر الخدمة</h1>
      </section>
      <section className="mx-auto grid max-w-3xl gap-3 px-4 pb-16 sm:grid-cols-2">
        {tools.map((t) => {
          const Icon = t.icon;
          const head = (
            <div className="flex items-center gap-4">
              <span className={`${t.tile} relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl shadow-paper transition-transform group-hover:-rotate-6 group-hover:scale-105`}>
                <Icon className="h-7 w-7" strokeWidth={2.2} />
                <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-card/70" />
              </span>
              <span className="text-lg font-bold text-foreground">{t.title}</span>
            </div>
          );
          if (t.href)
            return (
              <a key={t.title} href={t.href} className="group rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-paper">
                {head}
              </a>
            );
          return (
            <div key={t.title} className="group rounded-2xl border bg-card p-4">
              {head}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {t.options!.map((o) => (
                  <a key={o.href} href={o.href} dir="auto" className="rounded-xl border bg-secondary px-3 py-2.5 text-center text-sm font-bold text-foreground transition-colors hover:border-accent hover:text-accent">
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
