"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Settings, Palette, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ColorPicker } from "@/components/layout/color-picker";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveWorkHoursSettings, useWorkHoursSettings } from "@/hooks/use-attendance";
import { ATTENDANCE_TIMEZONE } from "@/lib/attendance-times";

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canEditHours = role === "admin" || role === "hr";
  const { data: settings, isLoading } = useWorkHoursSettings();
  const saveSettings = useSaveWorkHoursSettings();
  const [draft, setDraft] = useState<{ workStart?: string; grace?: string }>({});
  const workStart = draft.workStart ?? settings?.work_start_time ?? "";
  const grace = draft.grace ?? (settings?.grace_minutes == null ? "" : String(settings.grace_minutes));

  const handleSaveHours = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings.mutate({
      work_start_time: workStart.trim() ? workStart : null,
      grace_minutes: grace.trim() === "" ? null : Number(grace),
    });
  };

  const handleClearHours = () => {
    setDraft({ workStart: "", grace: "" });
    saveSettings.mutate({ work_start_time: null, grace_minutes: null });
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Mipangilio</h1>
          <p className="text-sm text-muted-foreground">Badilisha jinsi TrustTrack inavyoonekana na kanuni za mahudhurio</p>
        </div>
      </div>

      {/* Work hours */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <CardTitle className="text-base">Work start and late grace</CardTitle>
              <CardDescription>
                Optional. Times are in {ATTENDANCE_TIMEZONE} (EAT). Leave blank to turn the late rule off.
                When set, a check-in after start plus grace is marked Late unless a supervisor chooses another status.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <form onSubmit={handleSaveHours} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="work-start">Work start time</Label>
                  <Input
                    id="work-start"
                    type="time"
                    step={60}
                    value={workStart}
                    onChange={(e) => setDraft((d) => ({ ...d, workStart: e.target.value }))}
                    disabled={!canEditHours}
                    className="h-10 text-base sm:text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grace-minutes">Grace period (minutes)</Label>
                  <Input
                    id="grace-minutes"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    placeholder="e.g. 34"
                    value={grace}
                    onChange={(e) => setDraft((d) => ({ ...d, grace: e.target.value }))}
                    disabled={!canEditHours}
                    className="h-10 text-base sm:text-sm"
                  />
                </div>
              </div>
              {canEditHours ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saveSettings.isPending}>
                    {saveSettings.isPending ? "Saving…" : "Save work hours"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearHours}
                    disabled={saveSettings.isPending}
                  >
                    Clear (no late rule)
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Only HR or an admin can change these settings.</p>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Customize the look and feel of TrustTrack</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm font-medium mb-1">Color Theme</p>
            <p className="text-xs text-muted-foreground mb-3">Choose an accent color for the interface</p>
            <ColorPicker />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Light / Dark Mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">Toggle between light and dark appearance</p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
