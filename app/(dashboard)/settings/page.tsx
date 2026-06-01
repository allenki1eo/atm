"use client";

import { Settings, Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ColorPicker } from "@/components/layout/color-picker";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Mipangilio</h1>
          <p className="text-sm text-muted-foreground">Badilisha jinsi TrustTrack inavyoonekana</p>
        </div>
      </div>

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
