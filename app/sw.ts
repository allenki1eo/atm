import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// @ts-expect-error - Service worker global scope
declare const self: ServiceWorkerGlobalScope & SerwistGlobalConfig & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// Background sync for offline attendance
self.addEventListener("sync", (event: Event & { tag: string; waitUntil: (p: Promise<unknown>) => void }) => {
  if (event.tag === "sync-attendance") {
    event.waitUntil(syncOfflineAttendance());
  }
});

async function syncOfflineAttendance() {
  try {
    const idb = await openIndexedDB();
    const queue = await getQueue(idb);

    for (const item of queue) {
      try {
        const res = await fetch("/api/attendance/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });

        if (res.ok) {
          await removeFromQueue(idb, item.id);
        }
      } catch {
        // Will retry on next sync
      }
    }
  } catch (err) {
    console.error("Sync failed:", err);
  }
}

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("trusttrack-offline", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getQueue(db: IDBDatabase): Promise<{ id: number; payload: unknown }[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readonly");
    const req = tx.objectStore("queue").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function removeFromQueue(db: IDBDatabase, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    const req = tx.objectStore("queue").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
