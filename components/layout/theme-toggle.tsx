"use client";

import { Sun, Moon } from "lucide-react";
import { useUserTheme } from "@/hooks/use-user-theme";

export function ThemeToggle() {
  const { isDark, toggleDark, mounted } = useUserTheme();

  if (!mounted) return <div className="h-9 w-9" />;

  return (
    <button
      onClick={toggleDark}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
