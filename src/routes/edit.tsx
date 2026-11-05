import { createFileRoute } from "@tanstack/react-router";
import { Eraser, Highlighter, Pen, Signature, Type, Undo2, Download, MousePointer2, FilePenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Busy, FileDrop, Shell } from "@/components/pdf/Shell";
import { SignaturePad } from "@/components/pdf/SignaturePad";
import { drawItems, hitTest, measureText, type Item } from "@/lib/annotations";
import { baseName, downloadBytes, stampOverlays } from "@/lib/pdf-ops";
import { renderPages, type RenderedPage } from "@/lib/pdf-render";

export const Route = createFileRoute("/edit")({
  head: () => ({
    meta: [
      { title: "تعديل وتوقيع PDF — حبر" },
      { name: "description", content: "أضف نصاً وتوقيعاً، ارسم وظلّل على ملف PDF مباشرة في المتصفح." },
      { property: "og:title", content: "تعديل وتوقيع PDF — حبر" },
      { property: "og:description", content: "اكتب ووقّع وارسم على صفحات PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditPage,
});

type Tool = "none" | "edittext" | "text" | "pen" | "highlight" | "sign" | "erase";
const COLORS = ["#111827", "#1d4ed8", "#c2410c", "#15803d", "#facc15"] as const;
const tools: { id: Tool; label: string; icon: typeof Pen }[] = [
  { id: "none", label: "تصفح", icon: MousePointer2 },
  { id: "edittext", label: "تعديل النص", icon: FilePenLine },
  { id: "text", label: "نص", icon: Type },
  { id: "sign", label: "توقيع", icon: Signature },
  { id: "pen", label: "قلم", icon: Pen },
  { id: "highlight", label: "تظليل", icon: Highlighter },
  { id: "erase", label: "ممحاة", icon: Eraser },
];

function EditPage() {
  const [file, setFile] = useState<{ name: string; bytes: ArrayBuffer } | null>(null);
  const [pages, setPages] = useState<RenderedPage[] | null>(null);
  const [items, setItems] = useState<Item[][]>([]);
  const [history, setHistory] = useState<Item[][][]>([]);
  const [tool, setTool] = useState<Tool>("none");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [textSize, setTextSize] = useState(0.025);
  const [sig, setSig] = useState<{ src: string; aspect: number } | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (f: File) => {
    const bytes = await f.arrayBuffer();
    setFile({ name: f.name, bytes });
    setPages(null);
    try {
      const r = await renderPages(bytes, 2);
      setPages(r);
      setItems(r.map(() => []));
      setHistory([]);
    } catch (e) {
      console.error(e);
      toast.error("تعذّر فتح الملف");
      setFile(null);
    }
  };

  const commit = useCallback((page: number, fn: (list: Item[]) => Item[]) => {
    setItems((cur) => {
      setHistory((h) => [...h.slice(-50), cur]);
      return cur.map((l, i) => (i === page ? fn(l) : l));
    });
  }, []);

  const undo = () =>
    setHistory((h) => {
      if (!h.length) return h;
      setItems(h[h.length - 1]!);
      return h.slice(0, -1);
    });

  const pickTool = (t: Tool) => {
    if (t === "sign") setPadOpen(true);
    setTool(t);
  };

  const save = async () => {
    if (!file || !pages) return;
    setSaving(true);
    try {
      await document.fonts.ready;
      const overlays: Record<number, Uint8Array> = {};
      for (let i = 0; i < pages.length; i++) {
        const list = items[i] ?? [];
        const pg = pages[i]!;
        if (!list.length) continue;
        const W = Math.round(pg.width * 3), H = Math.round(pg.height * 3);
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        drawItems(c.getContext("2d")!, list, W, H);
        const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
        overlays[i] = new Uint8Array(await blob.arrayBuffer());
      }
      downloadBytes(await stampOverlays(file.bytes, overlays), `${baseName(file.name)}-معدّل.pdf`);
      toast.success("تم حفظ الملف");
    } catch (e) {
      console.error(e);
      toast.error("تعذّر حفظ الملف");
    } finally {
      setSaving(false);
    }
  };

  if (!file)
    return (
      <Shell>
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-4">
          <h1 className="text-3xl text-primary md:text-4xl">تعديل وتوقيع</h1>
          <p className="mt-1 text-muted-foreground">اكتب، وقّع، ارسم وظلّل على صفحات ملفك.</p>
        </div>
        <FileDrop onFiles={(f) => f[0] && load(f[0])} />
      </Shell>
    );

  return (
    <Shell>
      <div className="sticky top-[61px] z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
          <div className="flex gap-1 overflow-x-auto">
            {tools.map((t) => (
              <button
                key={t.id}
                onClick={() => pickTool(t.id)}
                className={`flex min-w-14 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  tool === t.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label="لون"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-accent ring-2 ring-accent/30" : "border-card"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          {(tool === "text" || tool === "edittext") && (
            <select value={textSize} onChange={(e) => setTextSize(+e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
              <option value={0.018}>صغير</option>
              <option value={0.025}>متوسط</option>
              <option value={0.035}>كبير</option>
              <option value={0.05}>عنوان</option>
            </select>
          )}
          <div className="ms-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={undo} disabled={!history.length}><Undo2 /> تراجع</Button>
            <Button size="sm" onClick={save} disabled={saving || !pages}><Download /> {saving ? "جارٍ الحفظ…" : "حفظ"}</Button>
          </div>
        </div>
        {tool === "edittext" && (
          <p className="pb-2 text-center text-xs text-muted-foreground">انقر على أي نص في الصفحة لتعديله</p>
        )}
        {tool === "sign" && sig && (
          <p className="pb-2 text-center text-xs text-muted-foreground">انقر على الصفحة لوضع التوقيع · <button className="underline" onClick={() => setPadOpen(true)}>توقيع جديد</button></p>
        )}
      </div>

      {!pages ? (
        <Busy />
      ) : (
        <div className="bg-stage py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-6 px-3">
            {pages.map((p, i) => (
              <PageCanvas
                key={i}
                page={p}
                num={i + 1}
                items={items[i] ?? []}
                tool={tool}
                color={color}
                textSize={textSize}
                sig={sig}
                onAdd={(...its) => commit(i, (l) => [...l, ...its])}
                onRemove={(k) => commit(i, (l) => l.filter((_, j) => j !== k))}
              />
            ))}
          </div>
        </div>
      )}

      {padOpen && (
        <SignaturePad
          color={color === COLORS[4] ? COLORS[0] : color}
          onCancel={() => { setPadOpen(false); if (!sig) setTool("none"); }}
          onDone={(src, aspect) => { setSig({ src, aspect }); setPadOpen(false); setTool("sign"); }}
        />
      )}
    </Shell>
  );
}

function PageCanvas({
  page, num, items, tool, color, textSize, sig, onAdd, onRemove,
}: {
  page: RenderedPage;
  num: number;
  items: Item[];
  tool: Tool;
  color: string;
  textSize: number;
  sig: { src: string; aspect: number } | null;
  onAdd: (...its: Item[]) => void;
  onRemove: (k: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Item | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; text: string; size?: number; cover?: { x: number; y: number; w: number; h: number } } | null>(null);
  const [tick, setTick] = useState(0);
  const aspect = page.height / page.width;

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const W = c.clientWidth * 2, H = c.clientHeight * 2;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    drawItems(c.getContext("2d")!, live.current ? [...items, live.current] : items, W, H);
  }, [items]);

  useEffect(() => {
    redraw();
    document.fonts?.ready.then(redraw);
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, [redraw, tick]);

  const pt = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const commitDraft = () => {
    const size = draft?.size ?? textSize;
    const cover = draft?.cover;
    const txt = draft?.text.trim() ? [{ kind: "text" as const, x: draft!.x, y: draft!.y, text: draft!.text, size, color, w: measureText(draft!.text, size) }] : [];
    if (cover) onAdd({ kind: "rect", ...cover, color: "#ffffff" }, ...txt);
    else if (txt.length) onAdd(...txt);
    setDraft(null);
  };

  const onDown = (e: React.PointerEvent) => {
    const [x, y] = pt(e);
    if (tool === "pen" || tool === "highlight") {
      live.current = tool === "pen"
        ? { kind: "path", points: [[x, y]], color, width: 0.003, alpha: 1 }
        : { kind: "path", points: [[x, y]], color: color === COLORS[0] ? COLORS[4] : color, width: 0.02, alpha: 0.35 };
      (e.target as Element).setPointerCapture(e.pointerId);
      redraw();
    } else if (tool === "erase") {
      const k = hitTest(items, x, y, aspect);
      if (k >= 0) onRemove(k);
    } else if (tool === "text") {
      e.preventDefault();
      if (draft) commitDraft();
      else setDraft({ x, y, text: "" });
    } else if (tool === "sign" && sig) {
      const img = new Image();
      img.src = sig.src;
      const w = 0.28, h = (w * sig.aspect) / aspect;
      img.onload = () => setTick((t) => t + 1);
      onAdd({ kind: "image", x: Math.max(0, x - w / 2), y: Math.max(0, y - h / 2), w, h, src: sig.src, img });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (live.current?.kind !== "path") return;
    live.current.points.push(pt(e));
    redraw();
  };

  const onUp = () => {
    if (live.current) {
      onAdd(live.current);
      live.current = null;
    }
  };

  const editOriginal = (t: RenderedPage["texts"][number]) => {
    if (draft) commitDraft();
    const pad = 0.002;
    setDraft({
      x: t.x + t.w, y: t.y, text: t.str, size: (t.h / 1.2) * aspect,
      cover: { x: t.x - pad, y: t.y - pad, w: t.w + pad * 2, h: t.h + pad * 2 },
    });
  };

  const drawing = tool === "pen" || tool === "highlight";

  return (
    <div className="relative bg-paper shadow-paper">
      <img src={page.src} alt={`صفحة ${num}`} className="block w-full select-none" draggable={false} />
      <canvas
        ref={canvas}
        className={`absolute inset-0 h-full w-full ${drawing ? "touch-none" : ""} ${tool === "none" || tool === "edittext" ? "pointer-events-none" : tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {tool === "edittext" && !draft && page.texts.map((t, k) => (
        <button
          key={k}
          type="button"
          title={t.str}
          onClick={() => editOriginal(t)}
          className="absolute rounded-sm outline-1 outline-accent/40 hover:bg-accent/20 hover:outline-accent"
          style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.w * 100}%`, height: `${t.h * 100}%` }}
        />
      ))}
      {draft && (
        <textarea
          dir="auto"
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitDraft(); }
            if (e.key === "Escape") setDraft(null);
          }}
          onBlur={commitDraft}
          placeholder="اكتب هنا…"
          className="absolute min-w-40 resize rounded border border-accent bg-paper p-0 leading-[1.3] outline-none"
          style={{
            right: `${(1 - draft.x) * 100}%`,
            top: `${draft.y * 100}%`,
            color,
            fontSize: `calc(${draft.size ?? textSize} * var(--pw))`, fontFamily: "Amiri, serif",
          }}
          ref={(el) => {
            if (!el || el.dataset["ready"]) return;
            el.dataset["ready"] = "1";
            el.parentElement!.style.setProperty("--pw", `${el.parentElement!.clientWidth}px`);
            requestAnimationFrame(() => el.focus({ preventScroll: true }));
          }}
        />
      )}
      <span className="absolute bottom-2 left-2 rounded bg-foreground/60 px-2 py-0.5 text-xs text-background">{num}</span>
    </div>
  );
}
