"use client";

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
import { Lock, AlertTriangle } from "lucide-react";
import { useLockDay } from "@/hooks/use-attendance";
import { formatDate } from "@/lib/utils";
import { useState } from "react";

interface LockDayDialogProps {
  date: string;
  unmarkedCount: number;
  onLocked?: () => void;
}

export function LockDayDialog({ date, unmarkedCount, onLocked }: LockDayDialogProps) {
  const [open, setOpen] = useState(false);
  const lockDay = useLockDay();

  const handleLock = async () => {
    await lockDay.mutateAsync(date);
    setOpen(false);
    onLocked?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-amber-700 border-amber-200 hover:bg-amber-50">
          <Lock className="h-4 w-4 mr-2" />
          Lock Day
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            Lock Attendance for {formatDate(date)}
          </DialogTitle>
          <DialogDescription>
            This will prevent any further changes to today&apos;s attendance records.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {unmarkedCount > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Warning: {unmarkedCount} employees not yet marked</p>
              <p className="text-xs mt-1">
                Locking will leave these employees without attendance records for today.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleLock}
            disabled={lockDay.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {lockDay.isPending ? "Locking..." : "Lock Day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
