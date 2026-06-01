"use client";

import { useThemeColor, type ThemeColor } from "@/hooks/use-theme-color";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function ColorPicker() {
  const { color, setColor, presets } = useThemeColor();

  return (
    <div className="flex flex-wrap gap-3">
      {presets.map((preset) => {
        const active = color === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => setColor(preset.id as ThemeColor)}
            title={preset.label}
            aria-label={`Set ${preset.label} theme`}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-all duration-150",
              active ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"
            )}
            style={{ backgroundColor: `hsl(${preset.hsl})` }}
          >
            {active && <Check className="h-4 w-4 text-white drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}
