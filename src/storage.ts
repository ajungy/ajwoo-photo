/** Local persistence: the original file is stored byte-for-byte and never changed. */
const DB = 'ajwoo-photo';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB unavailable'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export async function saveOriginal(blob: Blob, name: string): Promise<boolean> {
  try {
    await tx('readwrite', s => { s.clear(); s.put({ blob, name }, 'original'); });
    navigator.storage?.persist?.().catch(() => {});
    return true;
  } catch { return false; }
}

export async function saveProject(project: { name: string; recipe: unknown }, brushes: Record<string, Blob>): Promise<boolean> {
  try {
    await tx('readwrite', s => { s.put(project, 'project'); s.put(brushes, 'brushes'); });
    return true;
  } catch { return false; }
}

export async function loadProject(): Promise<{ original: Blob; name: string; recipe: unknown; brushes: Record<string, Blob> } | null> {
  try {
    const o = await tx<{ blob: Blob; name: string }>('readonly', s => s.get('original'));
    if (!o) return null;
    const p = await tx<{ recipe: unknown }>('readonly', s => s.get('project'));
    const b = await tx<Record<string, Blob>>('readonly', s => s.get('brushes'));
    return { original: o.blob, name: o.name, recipe: p?.recipe ?? null, brushes: b ?? {} };
  } catch { return null; }
}

export async function clearProject() {
  try { await tx('readwrite', s => { s.clear(); }); } catch { /* nothing stored */ }
}
