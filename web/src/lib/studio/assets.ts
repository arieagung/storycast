import { useEffect, useState } from "react";
import { blobDelete, blobGet, blobKeys, blobPut, kvDelete, kvGet, kvPut } from "./store";

/* ------------------------------------------------------------------ *\
   File System Access API

   Typed locally so the module does not depend on the DOM lib version.
\* ------------------------------------------------------------------ */

type Writable = { write(data: BlobPart): Promise<void>; close(): Promise<void> };
type FileHandle = { kind: "file"; name: string; getFile(): Promise<File>; createWritable(): Promise<Writable> };
type DirHandle = {
  kind: "directory";
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<DirHandle | FileHandle>;
  queryPermission(opts?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(opts?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
};
type Picker = (opts?: { id?: string; mode?: "read" | "readwrite"; startIn?: unknown }) => Promise<DirHandle>;

const picker = () => (globalThis as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
export const folderSupported = () => typeof picker() === "function";

const HANDLE = "project-folder";
const RW = { mode: "readwrite" } as const;

/* ------------------------------------------------------------------ *\
   Asset references

   Anything produced outside the browser lives in the project folder and
   is referenced as "local:<project>/<path>". Preset artwork that ships
   with the app stays a plain URL, so resolving a reference is the only
   thing a consumer has to do.
\* ------------------------------------------------------------------ */

export const LOCAL = "local:";
export const isLocalRef = (url?: string | null): url is string => typeof url === "string" && url.startsWith(LOCAL);
export const refPath = (ref: string) => ref.slice(LOCAL.length);
export const assetRef = (project: string, path: string) => `${LOCAL}${project}/${path}`;

export type AssetInfo = {
  /** Path inside the project folder, for example "keyframes/S01.png" or "01.mp4". */
  path: string;
  name: string;
  size: number;
  /** Epoch seconds the file was picked up. */
  at: number;
  duration?: number;
  width?: number;
  height?: number;
  /** True when the bytes live in IndexedDB because no folder is bound. */
  held?: true;
  /** Full native file path on disk if available (e.g. from Electron/Chromium file.path). */
  fullPath?: string;
  /** Native directory folder on disk if available. */
  folder?: string;
};

export type AssetSlot = { dir: string; base: string; exts: string[] };

export const slotPath = (slot: AssetSlot, ext = slot.exts[0]) => `${slot.dir ? `${slot.dir}/` : ""}${slot.base}.${ext}`;
export const slotLabel = (slot: AssetSlot) => `${slotPath(slot)}${slot.exts.length > 1 ? ` (or .${slot.exts.slice(1).join(" / .")})` : ""}`;

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];
export const AUDIO_EXTS = ["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"];
export const VIDEO_EXTS = ["mp4", "webm", "mov", "mkv", "m4v"];

export const TEXT_EXTS = ["srt", "txt"];

export type MediaKind = "image" | "audio" | "video";
export const extsFor = (kind: MediaKind) => (kind === "image" ? IMAGE_EXTS : kind === "audio" ? AUDIO_EXTS : VIDEO_EXTS);
export const kindOfName = (name: string): MediaKind | null => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (AUDIO_EXTS.includes(ext)) return "audio";
  if (VIDEO_EXTS.includes(ext)) return "video";
  return null;
};

export const SLOTS = {
  style: { dir: "input", base: "style", exts: IMAGE_EXTS },
  character: { dir: "input", base: "character", exts: IMAGE_EXTS },
  sheet: { dir: "character", base: "sheet", exts: IMAGE_EXTS },
  hero: { dir: "character", base: "hero", exts: IMAGE_EXTS },
  music: { dir: "music", base: "score", exts: AUDIO_EXTS },
  card: { dir: "endcard", base: "card", exts: IMAGE_EXTS },
  srt: { dir: "", base: "subtitles", exts: ["srt"] },
  film: { dir: "", base: "film", exts: VIDEO_EXTS },
  clean: { dir: "", base: "clean", exts: VIDEO_EXTS },
} satisfies Record<string, AssetSlot>;

export const narrationSlot = (id: string): AssetSlot => ({ dir: "narration", base: id, exts: AUDIO_EXTS });
export const keySlot = (shot: string): AssetSlot => ({ dir: "keyframes", base: shot, exts: IMAGE_EXTS });
export const shotSlot = (shot: string): AssetSlot => ({ dir: "shots", base: shot, exts: VIDEO_EXTS });

/* ------------------------------------------------------------------ *\
   Binding the project folder
\* ------------------------------------------------------------------ */

let root: DirHandle | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function changed() {
  generation++;
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  listeners.forEach((fn) => fn());
}

export function onFolderChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const folderBound = () => !!root;
export const folderName = () => root?.name ?? "";
export const folderGeneration = () => generation;

/** "ok" when the stored folder is usable again, "ask" when it needs a click, "none" when there is nothing stored. */
export async function restoreFolder(): Promise<"ok" | "ask" | "none"> {
  if (root) return "ok";
  const handle = await kvGet<DirHandle>(HANDLE).catch(() => undefined);
  if (!handle?.queryPermission) return "none";
  const state = await handle.queryPermission(RW).catch(() => "denied" as PermissionState);
  if (state === "granted") {
    root = handle;
    changed();
    return "ok";
  }
  return "ask";
}

/** Re-asks for permission on the stored folder. Must be called from a user gesture. */
export async function grantFolder(): Promise<boolean> {
  const handle = root ?? (await kvGet<DirHandle>(HANDLE).catch(() => undefined));
  if (!handle?.requestPermission) return false;
  const state = await handle.requestPermission(RW).catch(() => "denied" as PermissionState);
  if (state !== "granted") return false;
  root = handle;
  changed();
  return true;
}

export async function pickFolder(): Promise<string> {
  const show = picker();
  if (!show) throw new Error("This browser cannot open a folder. Drop the files onto the steps instead.");
  const handle = await show({ id: "storycast", mode: "readwrite" });
  root = handle;
  await kvPut(HANDLE, handle).catch(() => {});
  changed();
  return handle.name;
}

export async function unbindFolder() {
  root = null;
  await kvDelete(HANDLE).catch(() => {});
  changed();
}

/* ------------------------------------------------------------------ *\
   Reading and writing inside the folder
\* ------------------------------------------------------------------ */

const parts = (rel: string) => rel.split("/").filter(Boolean);

async function dirOf(rel: string, create: boolean): Promise<DirHandle | null> {
  if (!root) return null;
  let dir: DirHandle = root;
  for (const name of parts(rel)) {
    try {
      dir = await dir.getDirectoryHandle(name, { create });
    } catch {
      return null;
    }
  }
  return dir;
}

async function fileOf(rel: string): Promise<FileHandle | null> {
  const p = parts(rel);
  const name = p.pop();
  if (!name) return null;
  const dir = await dirOf(p.join("/"), false);
  if (!dir) return null;
  return dir.getFileHandle(name).catch(() => null);
}

export async function ensureDir(rel: string) {
  await dirOf(rel, true);
}

/** Reads a file by its path inside the project folder, falling back to files the browser holds. */
export async function readAsset(rel: string): Promise<File | Blob | null> {
  const handle = await fileOf(rel);
  if (handle) return handle.getFile().catch(() => null);
  return (await blobGet(rel).catch(() => undefined)) ?? null;
}

export const join = (...bits: (string | undefined)[]) => bits.filter(Boolean).join("/").replace(/\/{2,}/g, "/").replace(/\/$/, "");

export async function listDir(rel: string): Promise<string[]> {
  const dir = await dirOf(rel, false);
  const out: string[] = [];
  if (dir) {
    try {
      for await (const entry of dir.values()) if (entry.kind === "file") out.push(entry.name);
    } catch {}
  }
  if (!out.length) {
    const prefix = join(rel) ? `${join(rel)}/` : "";
    for (const key of await blobKeys().catch(() => [])) {
      const k = String(key);
      if (k.startsWith(prefix) && !k.slice(prefix.length).includes("/")) out.push(k.slice(prefix.length));
    }
  }
  return out;
}

/** Finds "<dir>/<base>.<one of exts>", whatever case the file was saved in. */
export async function findAsset(dir: string, base: string, exts: string[]): Promise<{ path: string; file: File | Blob } | null> {
  for (const name of await listDir(dir)) {
    const dot = name.lastIndexOf(".");
    if (dot < 1) continue;
    if (name.slice(0, dot).toLowerCase() !== base.toLowerCase()) continue;
    if (!exts.includes(name.slice(dot + 1).toLowerCase())) continue;
    const path = join(dir, name);
    const file = await readAsset(path);
    if (file) return { path, file };
  }
  return null;
}

export async function writeText(rel: string, text: string): Promise<boolean> {
  const p = parts(rel);
  const name = p.pop()!;
  const dir = await dirOf(p.join("/"), true);
  if (!dir) return false;
  try {
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(new Blob([text], { type: "text/plain" }));
    await w.close();
    changed();
    return true;
  } catch {
    return false;
  }
}

export async function writeBlob(rel: string, blob: Blob): Promise<boolean> {
  const p = parts(rel);
  const name = p.pop()!;
  const dir = await dirOf(p.join("/"), true);
  if (!dir) return false;
  try {
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
    changed();
    return true;
  } catch {
    return false;
  }
}

/** Keeps a dropped file. Writes it into the project folder when one is bound, otherwise into IndexedDB. */
export async function keepAsset(rel: string, file: Blob): Promise<boolean> {
  if (root && (await writeBlob(rel, file))) return true;
  await blobPut(rel, file);
  changed();
  return false;
}

export async function forgetAsset(rel: string) {
  await blobDelete(rel).catch(() => {});
  changed();
}

/* ------------------------------------------------------------------ *\
   Measuring
\* ------------------------------------------------------------------ */

const settle = (el: HTMLMediaElement, url: string) => {
  el.src = "";
  el.removeAttribute("src");
  el.load?.();
  URL.revokeObjectURL(url);
};

async function mediaMeta(blob: Blob, kind: "audio" | "video"): Promise<{ duration?: number; width?: number; height?: number }> {
  const url = URL.createObjectURL(blob);
  const el = document.createElement(kind);
  el.preload = "metadata";
  el.muted = true;
  try {
    const meta = await new Promise<{ duration: number; width?: number; height?: number }>((resolve, reject) => {
      const fail = () => reject(new Error("could not read this file"));
      el.onerror = fail;
      el.onloadedmetadata = () => {
        const v = el as HTMLVideoElement;
        const size = kind === "video" ? { width: v.videoWidth || undefined, height: v.videoHeight || undefined } : {};
        if (Number.isFinite(el.duration) && el.duration > 0) return resolve({ duration: el.duration, ...size });
        // Some encoders leave the duration out of the header; seeking to the end fills it in.
        el.onseeked = () => resolve({ duration: Number.isFinite(el.duration) ? el.duration : 0, ...size });
        el.currentTime = 1e6;
      };
      el.src = url;
    });
    return { duration: Math.round(meta.duration * 1000) / 1000, width: meta.width, height: meta.height };
  } finally {
    settle(el, url);
  }
}

async function imageMeta(blob: Blob): Promise<{ width?: number; height?: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("could not read this image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function measure(path: string, file: File | Blob, kind: MediaKind): Promise<AssetInfo> {
  const name = path.split("/").pop() || path;
  const base: AssetInfo = { path, name, size: file.size, at: Math.round(Date.now() / 1000) };
  if (!root) base.held = true;
  const rawFullPath = (file as { path?: string })?.path;
  if (typeof rawFullPath === "string" && rawFullPath) {
    base.fullPath = rawFullPath;
    const sep = rawFullPath.includes("/") ? "/" : "\\";
    const last = rawFullPath.lastIndexOf(sep);
    if (last > 0) base.folder = rawFullPath.slice(0, last);
  } else if (path.includes("/")) {
    base.folder = path.slice(0, path.lastIndexOf("/"));
  }
  try {
    return { ...base, ...(kind === "image" ? await imageMeta(file) : await mediaMeta(file, kind)) };
  } catch {
    return base;
  }
}

/* ------------------------------------------------------------------ *\
   Showing assets in the page
\* ------------------------------------------------------------------ */

const urls = new Map<string, string>();

export async function mediaUrl(ref?: string | null): Promise<string> {
  if (!ref) return "";
  if (!isLocalRef(ref)) return ref;
  const hit = urls.get(ref);
  if (hit) return hit;
  const file = await readAsset(refPath(ref));
  if (!file) return "";
  const url = URL.createObjectURL(file);
  urls.set(ref, url);
  return url;
}

/** Resolves a reference for display. Plain URLs come back unchanged on the first render. */
export function useMediaUrl(ref?: string | null): string {
  const gen = useGeneration();
  const [url, setUrl] = useState(!ref || !isLocalRef(ref) ? (ref ?? "") : "");
  useEffect(() => {
    if (!ref || !isLocalRef(ref)) {
      setUrl(ref ?? "");
      return;
    }
    let live = true;
    mediaUrl(ref).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [ref, gen]);
  return url;
}

/** Re-renders when the bound folder changes so resolved URLs are rebuilt. */
export function useGeneration() {
  const [g, setG] = useState(generation);
  useEffect(() => onFolderChange(() => setG(generation)), []);
  return g;
}

export type FolderState = "unsupported" | "none" | "ask" | "ok";

/** The state of the project folder: whether one is bound, and whether it still has permission. */
export function useFolder() {
  const supported = folderSupported();
  const [state, setState] = useState<FolderState>(supported ? "none" : "unsupported");
  const [name, setName] = useState(folderName());
  useEffect(() => {
    if (!supported) return;
    let live = true;
    restoreFolder().then((s) => live && setState(s));
    return onFolderChange(() => {
      if (!live) return;
      setState(folderBound() ? "ok" : "none");
      setName(folderName());
    });
  }, [supported]);
  return { state, name, supported };
}

export async function downloadRef(ref: string, name?: string) {
  const url = await mediaUrl(ref);
  if (!url) throw new Error("that file is not in the project folder");
  const a = document.createElement("a");
  a.href = url;
  a.download = name || refPath(ref).split("/").pop() || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
