const DB = "storycast";
const FILMS = "films";
const BLOBS = "blobs";
const KEYVAL = "keyval";

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(FILMS)) d.createObjectStore(FILMS, { keyPath: "id" });
      if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS);
      if (!d.objectStoreNames.contains(KEYVAL)) d.createObjectStore(KEYVAL);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export type FilmRecord = Record<string, any> & { id: string };

export const saveRecord = (rec: FilmRecord) => tx(FILMS, "readwrite", (s) => s.put(structuredClone(rec)));
export const loadRecord = (id: string) => tx<FilmRecord | undefined>(FILMS, "readonly", (s) => s.get(id));
export const allRecords = () => tx<FilmRecord[]>(FILMS, "readonly", (s) => s.getAll());
export const deleteRecord = (id: string) => tx(FILMS, "readwrite", (s) => s.delete(id));

/** Files the browser holds itself, used when no project folder is bound. Keyed by "<project>/<path>". */
export const blobGet = (key: string) => tx<Blob | undefined>(BLOBS, "readonly", (s) => s.get(key));
export const blobPut = (key: string, value: Blob) => tx(BLOBS, "readwrite", (s) => s.put(value, key));
export const blobDelete = (key: string) => tx(BLOBS, "readwrite", (s) => s.delete(key));
export const blobKeys = () => tx<IDBValidKey[]>(BLOBS, "readonly", (s) => s.getAllKeys());

/** Small structured values that must survive a reload, such as the project folder handle. */
export const kvGet = <T>(key: string) => tx<T | undefined>(KEYVAL, "readonly", (s) => s.get(key));
export const kvPut = (key: string, value: unknown) => tx(KEYVAL, "readwrite", (s) => s.put(value, key));
export const kvDelete = (key: string) => tx(KEYVAL, "readwrite", (s) => s.delete(key));

export function cacheGet(bucket: string, key: string): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(`storycast-${bucket}`) || "{}") as Record<string, string>)[key];
  } catch {
    return undefined;
  }
}

export function cacheSet(bucket: string, key: string, value: string) {
  try {
    const all = JSON.parse(localStorage.getItem(`storycast-${bucket}`) || "{}");
    all[key] = value;
    localStorage.setItem(`storycast-${bucket}`, JSON.stringify(all));
  } catch {}
}
