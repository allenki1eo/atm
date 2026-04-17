"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Unlock, AlertTriangle } from "lucide-react";
import { useUnlockDay } from "@/hooks/use-attendance";
import { formatDate } from "@/lib/utils";

interface UnlockDayDialogProps {
  date: string;
  onUnlocked?: () => void;
}

export function UnlockDayDialog({ date, onUnlocked }: UnlockDayDialogProps) {
  const [open, setOpen] = useState(false);
  const unlockDay = useUnlockDay();

  const handleUnlock = async () => {
    await unlockDay.mutateAsync(date);
    setOpen(false);
    onUnlocked?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50">
          <Unlock className="h-4 w-4 mr-2" />
          Unlock Day
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5 text-emerald-600" />
            Unlock Attendance for {formatDate(date)}
          </DialogTitle>
          <DialogDescription>
            This will reopen the day so attendance records can be edited again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Admin override</p>
            <p className="text-xs mt-1">
              Only unlock if corrections are genuinely needed. Lock the day again when done.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleUnlock}
            disabled={unlockDay.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {unlockDay.isPending ? "Unlocking..." : "Unlock Day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
