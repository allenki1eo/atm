"use client";

import { useEffect, useCallback } from "react";
import { useOffline } from "./use-offline";

interface QueuedAction {
  id?: number;
  payload: {
    employee_id: string;
    date: string;
    status: string;
    notes?: string;
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("trusttrack-offline", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function useSync() {
  const { isOffline } = useOffline();

  const queueAction = useCallback(async (payload: QueuedAction["payload"]) => {
    try {
      const db = await openDB();
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").add({ payload, timestamp: Date.now() });
    } catch (err) {
      console.error("Failed to queue action:", err);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (isOffline) return;

    try {
      const db = await openDB();
      const tx = db.transaction("queue", "readonly");
      const req = tx.objectStore("queue").getAll();

      req.onsuccess = async () => {
        const queue: QueuedAction[] = req.result;
        if (!queue.length) return;

        for (const item of queue) {
          try {
            const res = await fetch("/api/attendance/mark", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.payload),
            });

            if (res.ok && item.id) {
              const delTx = db.transaction("queue", "readwrite");
              delTx.objectStore("queue").delete(item.id);
            }
          } catch {
            // Keep in queue for next sync
          }
        }
      };
    } catch (err) {
      console.error("Sync error:", err);
    }
  }, [isOffline]);

  // Trigger background sync when coming back online
  useEffect(() => {
    if (!isOffline) {
      syncNow();

      // Register background sync if supported
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        navigator.serviceWorker.ready
          .then((reg) => reg.sync.register("sync-attendance"))
          .catch(console.error);
      }
    }
  }, [isOffline, syncNow]);

  return { queueAction, syncNow };
}
