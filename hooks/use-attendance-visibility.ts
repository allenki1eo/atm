"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface VisibilityState {
  employees: string[];
  sections: string[];
}

const EMPTY: VisibilityState = { employees: [], sections: [] };
const QUERY_KEY = ["visibility"] as const;

/**
 * Local mirror of the server state.
 *
 * This is a *cache*, not the source of truth — the server is. Keeping it means
 * the first paint after a reload already has the right rows hidden instead of
 * flashing every employee for a moment while the fetch lands.
 */
const CACHE_KEY = "attendance_hidden";

function readCache(): VisibilityState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<VisibilityState>;
    return {
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    };
  } catch {
    return EMPTY;
  }
}

function writeCache(state: VisibilityState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode — the server still has it */
  }
}

async function fetchVisibility(): Promise<VisibilityState> {
  const res = await fetch("/api/visibility");
  if (!res.ok) throw new Error("Failed to load visibility settings");
  const data = (await res.json()) as Partial<VisibilityState>;
  return {
    employees: data.employees ?? [],
    sections: data.sections ?? [],
  };
}

async function saveVisibility(state: VisibilityState): Promise<VisibilityState> {
  const res = await fetch("/api/visibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error("Failed to save visibility settings");
  return (await res.json()) as VisibilityState;
}

/**
 * Which employees/sections the current user has hidden.
 *
 * Stored per user account in the database, so the same list follows them to
 * any browser or device and survives clearing site data. One admin hiding
 * someone does not affect another admin.
 */
export function useAttendanceVisibility() {
  const queryClient = useQueryClient();
  const migrated = useRef(false);

  // Snapshot the cache at mount, before any server response overwrites it.
  // The migration below needs to know what was on this device originally.
  const cacheAtMount = useRef<VisibilityState | null>(null);
  if (cacheAtMount.current === null) cacheAtMount.current = readCache();

  const { data, isFetchedAfterMount } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchVisibility,
    initialData: readCache,
    // Without this, React Query stamps initialData as fresh "now" and the
    // staleTime below would suppress the first real fetch — so the device
    // would never pick up changes made elsewhere.
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
  });

  const hidden: VisibilityState = data ?? EMPTY;

  // Keep the local mirror in step with whatever the server last told us.
  useEffect(() => {
    if (data) writeCache(data);
  }, [data]);

  // One-time lift of pre-existing localStorage selections into the account.
  // Gated on isFetchedAfterMount so `data` is genuinely the server's answer
  // and not the initialData seed — otherwise this would compare against
  // itself and silently drop what the user had already hidden.
  useEffect(() => {
    if (migrated.current || !isFetchedAfterMount || !data) return;
    migrated.current = true;

    const local = cacheAtMount.current ?? EMPTY;
    const serverEmpty = data.employees.length === 0 && data.sections.length === 0;
    const localHasItems = local.employees.length > 0 || local.sections.length > 0;

    if (serverEmpty && localHasItems) {
      saveVisibility(local)
        .then((saved) => queryClient.setQueryData(QUERY_KEY, saved))
        .catch(() => {
          /* keep the local copy; it will retry on the next mount */
        });
    }
  }, [data, isFetchedAfterMount, queryClient]);

  const mutation = useMutation({
    mutationFn: saveVisibility,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<VisibilityState>(QUERY_KEY);
      queryClient.setQueryData(QUERY_KEY, next); // optimistic — toggle feels instant
      writeCache(next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
        writeCache(context.previous);
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(QUERY_KEY, saved);
      writeCache(saved);
    },
  });

  const toggleEmployee = (id: string) => {
    const next: VisibilityState = hidden.employees.includes(id)
      ? { ...hidden, employees: hidden.employees.filter((e) => e !== id) }
      : { ...hidden, employees: [...hidden.employees, id] };
    mutation.mutate(next);
  };

  const toggleSection = (id: string) => {
    const next: VisibilityState = hidden.sections.includes(id)
      ? { ...hidden, sections: hidden.sections.filter((s) => s !== id) }
      : { ...hidden, sections: [...hidden.sections, id] };
    mutation.mutate(next);
  };

  const reset = () => mutation.mutate(EMPTY);

  return {
    hidden,
    toggleEmployee,
    toggleSection,
    reset,
    isSyncing: mutation.isPending,
  };
}

/** Filter any employee-shaped array by the current user's hidden set. */
export function useVisibleEmployees<T extends { id: string; section_id?: string | null }>(
  employees: T[] | undefined
): T[] {
  const { hidden } = useAttendanceVisibility();
  if (!employees) return [];
  return employees.filter(
    (e) =>
      !hidden.employees.includes(e.id) &&
      (!e.section_id || !hidden.sections.includes(e.section_id))
  );
}
