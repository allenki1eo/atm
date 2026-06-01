"use client";

import { useUserTheme } from "@/hooks/use-user-theme";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function ColorPicker() {
  const { color, setColor, presets, mounted } = useUserTheme();

  if (!mounted) return <div className="flex gap-3">{presets.map(p => <div key={p.id} className="h-9 w-9 rounded-xl bg-muted animate-pulse" />)}</div>;

  return (
    <div className="flex flex-wrap gap-3">
      {presets.map((preset) => {
        const active = color === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => setColor(preset.id)}
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
