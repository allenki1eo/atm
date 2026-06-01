"use client";

import { useEffect, useState } from "react";

export type ThemeColor = "purple" | "blue" | "green" | "red" | "orange" | "cyan";

const STORAGE_KEY = "theme-color";
const DEFAULT: ThemeColor = "purple";

export const COLOR_PRESETS: { id: ThemeColor; label: string; hsl: string }[] = [
  { id: "purple", label: "Purple",  hsl: "262 73% 58%" },
  { id: "blue",   label: "Blue",    hsl: "217 91% 60%" },
  { id: "green",  label: "Green",   hsl: "152 69% 40%" },
  { id: "red",    label: "Red",     hsl: "0 72% 51%"   },
  { id: "orange", label: "Orange",  hsl: "25 95% 53%"  },
  { id: "cyan",   label: "Cyan",    hsl: "189 94% 43%" },
];

function apply(color: ThemeColor) {
  document.documentElement.setAttribute("data-color", color);
}

export function useThemeColor() {
  const [color, setColorState] = useState<ThemeColor>(DEFAULT);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeColor | null) ?? DEFAULT;
    setColorState(stored);
    apply(stored);
  }, []);

  const setColor = (next: ThemeColor) => {
    setColorState(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  };

  return { color, setColor, presets: COLOR_PRESETS };
}
