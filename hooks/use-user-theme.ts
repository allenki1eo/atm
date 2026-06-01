"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { COLOR_PRESETS, type ThemeColor } from "./use-theme-color";

function colorKey(userId: string) { return `theme-color-${userId}`; }
function darkKey(userId: string)  { return `theme-dark-${userId}`;  }

function applyColor(color: ThemeColor) {
  document.documentElement.setAttribute("data-color", color);
}

function applyDark(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

export function useUserTheme() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id ?? "";

  const [color, setColorState] = useState<ThemeColor>("purple");
  const [isDark, setIsDarkState] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore preferences whenever the userId changes (login/switch)
  useEffect(() => {
    if (!userId) return;
    const savedColor = (localStorage.getItem(colorKey(userId)) as ThemeColor | null) ?? "purple";
    const savedDark  = localStorage.getItem(darkKey(userId)) === "true";
    setColorState(savedColor);
    setIsDarkState(savedDark);
    applyColor(savedColor);
    applyDark(savedDark);
    setMounted(true);
  }, [userId]);

  const setColor = (next: ThemeColor) => {
    if (!userId) return;
    setColorState(next);
    localStorage.setItem(colorKey(userId), next);
    applyColor(next);
  };

  const toggleDark = () => {
    if (!userId) return;
    const next = !isDark;
    setIsDarkState(next);
    localStorage.setItem(darkKey(userId), String(next));
    applyDark(next);
  };

  return { color, setColor, isDark, toggleDark, presets: COLOR_PRESETS, mounted };
}
