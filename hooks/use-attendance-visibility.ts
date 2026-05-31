"use client";

import { useState, useEffect } from "react";

interface VisibilityState {
  employees: string[];
  sections: string[];
}

const STORAGE_KEY = "attendance_hidden";

function load(): VisibilityState {
  if (typeof window === "undefined") return { employees: [], sections: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { employees: [], sections: [] };
    return JSON.parse(raw) as VisibilityState;
  } catch {
    return { employees: [], sections: [] };
  }
}

export function useAttendanceVisibility() {
  const [hidden, setHidden] = useState<VisibilityState>({ employees: [], sections: [] });

  useEffect(() => {
    setHidden(load());
  }, []);

  const save = (next: VisibilityState) => {
    setHidden(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const toggleEmployee = (id: string) => {
    const next = hidden.employees.includes(id)
      ? { ...hidden, employees: hidden.employees.filter((e) => e !== id) }
      : { ...hidden, employees: [...hidden.employees, id] };
    save(next);
  };

  const toggleSection = (id: string) => {
    const next = hidden.sections.includes(id)
      ? { ...hidden, sections: hidden.sections.filter((s) => s !== id) }
      : { ...hidden, sections: [...hidden.sections, id] };
    save(next);
  };

  const reset = () => save({ employees: [], sections: [] });

  return { hidden, toggleEmployee, toggleSection, reset };
}
