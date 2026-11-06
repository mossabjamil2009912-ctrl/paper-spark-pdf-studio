// Browser-only compression. Pixel dimensions are always kept unchanged.

const JPEG_Q = 0.75;

async function reencodeJpeg(bytes: Uint8Array, q = JPEG_Q): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** PDF: re-encode embedded JPEG photos at the same pixel size + compact object streams. Text stays vector. */
export async function compressPdf(buf: ArrayBuffer): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFRawStream, PDFNumber } = await import("pdf-lib");
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const ctx = doc.context;
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    const f = d.get(PDFName.of("Filter"));
    if (f !== PDFName.of("DCTDecode")) continue;
    const cs = d.get(PDFName.of("ColorSpace"));
    if (cs && cs !== PDFName.of("DeviceRGB") && cs !== PDFName.of("DeviceGray")) continue;
    if (d.get(PDFName.of("SMask")) === undefined && d.get(PDFName.of("Decode"))) continue;
    const src = obj.contents;
    if (src.length < 20000) continue;
    const out = await reencodeJpeg(src);
    if (!out || out.length >= src.length * 0.9) continue;
    d.set(PDFName.of("Length"), PDFNumber.of(out.length));
    d.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
    d.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
    ctx.assign(ref, PDFRawStream.of(d, out));
  }
  return doc.save({ useObjectStreams: true });
}

/** Image: same width/height; WebP if supported (smaller), else JPEG. PNG with alpha stays WebP to keep transparency. */
export async function compressImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  const tryType = async (t: string, q: number) =>
    new Promise<Blob | null>((r) => c.toBlob(r, t, q));
  let best: { blob: Blob; ext: string } = { blob: file, ext: file.name.split(".").pop() || "img" };
  const webp = await tryType("image/webp", 0.8);
  if (webp && webp.type === "image/webp" && webp.size < best.blob.size) best = { blob: webp, ext: "webp" };
  if (!/png|gif|webp/i.test(file.type)) {
    const jpg = await tryType("image/jpeg", 0.8);
    if (jpg && jpg.size < best.blob.size) best = { blob: jpg, ext: "jpg" };
  }
  return best;
}

/** Video: re-record at the original resolution with a lower bitrate (runs in real time). */
export async function compressVideo(file: File, onProgress: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.src = url;
  v.playsInline = true;
  await new Promise<void>((ok, err) => {
    v.onloadedmetadata = () => ok();
    v.onerror = () => err(new Error("video"));
  });
  const w = v.videoWidth, h = v.videoHeight;
  const origBps = (file.size * 8) / Math.max(1, v.duration);
  const target = Math.max(400_000, Math.min(origBps * 0.5, w * h * 3));
  const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
    (m) => MediaRecorder.isTypeSupported(m),
  );
  if (!mime) throw new Error("unsupported");
  const stream = (v as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: target, audioBitsPerSecond: 96_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  v.ontimeupdate = () => onProgress(Math.min(1, v.currentTime / v.duration));
  v.onended = () => rec.state !== "inactive" && rec.stop();
  rec.start(1000);
  await v.play();
  await done;
  URL.revokeObjectURL(url);
  const blob = new Blob(chunks, { type: mime.split(";")[0] ?? "video/webm" });
  if (blob.size >= file.size) return { blob: file, ext: file.name.split(".").pop() || "mp4" };
  return { blob, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
}

export type VideoTarget = 270 | 360 | 720 | 1080;

/** Video: re-encode at a chosen height (keeps aspect ratio; never upscales). Runs in real time. */
export async function convertVideo(
  file: File,
  height: VideoTarget,
  onProgress: (p: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.src = url;
  v.playsInline = true;
  await new Promise<void>((ok, err) => {
    v.onloadedmetadata = () => ok();
    v.onerror = () => err(new Error("video"));
  });
  const scale = Math.min(1, height / v.videoHeight);
  const w = Math.round((v.videoWidth * scale) / 2) * 2;
  const h = Math.round((v.videoHeight * scale) / 2) * 2;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const bps = { 270: 400_000, 360: 700_000, 720: 2_000_000, 1080: 4_000_000 }[height];
  const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
    (m) => MediaRecorder.isTypeSupported(m),
  );
  if (!mime) throw new Error("unsupported");
  const out = c.captureStream(30);
  const src = (v as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
  src.getAudioTracks().forEach((t) => out.addTrack(t));
  const rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  let raf = 0;
  const draw = () => {
    g.drawImage(v, 0, 0, w, h);
    raf = requestAnimationFrame(draw);
  };
  v.ontimeupdate = () => onProgress(Math.min(1, v.currentTime / v.duration));
  v.onended = () => rec.state !== "inactive" && rec.stop();
  await v.play();
  draw();
  rec.start(1000);
  await done;
  cancelAnimationFrame(raf);
  URL.revokeObjectURL(url);
  return { blob: new Blob(chunks, { type: mime.split(";")[0] ?? "video/webm" }), ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
}

/** Extract the audio track as MP3 (fast, not real time). */
export async function videoToMp3(file: File, onProgress: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const ac = new AudioContext();
  const audio = await ac.decodeAudioData(await file.arrayBuffer());
  ac.close();
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const ch = Math.min(2, audio.numberOfChannels);
  const enc = new Mp3Encoder(ch, audio.sampleRate, 192);
  const toI16 = (f: Float32Array) => {
    const o = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) o[i] = Math.max(-1, Math.min(1, f[i] ?? 0)) * 0x7fff;
    return o;
  };
  const L = toI16(audio.getChannelData(0));
  const R = ch > 1 ? toI16(audio.getChannelData(1)) : undefined;
  const parts: BlobPart[] = [];
  const step = 1152 * 100;
  for (let i = 0; i < L.length; i += step) {
    const buf = R ? enc.encodeBuffer(L.subarray(i, i + step), R.subarray(i, i + step)) : enc.encodeBuffer(L.subarray(i, i + step));
    if (buf.length) parts.push(new Uint8Array(buf));
    onProgress(i / L.length);
    if ((i / step) % 20 === 0) await new Promise((r) => setTimeout(r));
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  return { blob: new Blob(parts, { type: "audio/mpeg" }), ext: "mp3" };
}
