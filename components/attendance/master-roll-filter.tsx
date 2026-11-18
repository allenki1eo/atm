"use client";

interface MasterRollFilterProps {
  onlyMasterRoll: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}

/** Default should be Master Roll only; uncheck to also show everyone else. */
export function MasterRollFilter({ onlyMasterRoll, onChange, className }: MasterRollFilterProps) {
  return (
    <label className={`flex items-center gap-2 text-sm cursor-pointer ${className ?? ""}`}>
      <input
        type="checkbox"
        className="accent-primary"
        checked={onlyMasterRoll}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>Onyesha wafanyakazi wa Master Roll tu</span>
    </label>
  );
}

export function isOnMasterRoll(value: unknown): boolean {
  return Boolean(value);
}
