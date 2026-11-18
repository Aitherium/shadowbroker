// Node 22+ ships its own global `localStorage` (Web Storage behind
// --localstorage-file). Without that flag it is a bare object with no methods,
// and it shadows jsdom's Storage, so every test touching storage fails with
// "localStorage.removeItem is not a function" (measured on Node 25.2.1,
// 2026-11-18). Install a working in-memory Storage when the global is broken.
function memoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
    key: (i) => Array.from(data.keys())[i] ?? null,
    removeItem: (k) => {
      data.delete(String(k));
    },
    setItem: (k, v) => {
      data.set(String(k), String(v));
    },
  };
}

for (const name of ['localStorage', 'sessionStorage']) {
  const current = globalThis[name];
  if (!current || typeof current.getItem !== 'function' || typeof current.removeItem !== 'function') {
    const storage = memoryStorage();
    Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true });
    if (typeof window !== 'undefined' && window !== globalThis) {
      Object.defineProperty(window, name, { value: storage, configurable: true, writable: true });
    }
  }
}
