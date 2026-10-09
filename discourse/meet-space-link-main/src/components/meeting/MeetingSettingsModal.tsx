import { useState } from "react";
import { Clock, Shield } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export interface MeetingSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDurationMinutes: number;
  remainingSeconds: number | null;
  onSaveDuration: (newMinutes: number) => Promise<void>;
}

export function MeetingSettingsModal({
  open,
  onOpenChange,
  currentDurationMinutes,
  remainingSeconds,
  onSaveDuration,
}: MeetingSettingsModalProps) {
  const [selectedDuration, setSelectedDuration] = useState<string>(
    String(currentDurationMinutes),
  );
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [isCustom, setIsCustom] = useState(
    ![15, 30, 60, 120, 180].includes(currentDurationMinutes),
  );
  const [saving, setSaving] = useState(false);

  function formatTime(totalSec: number | null): string {
    if (totalSec === null || totalSec < 0) return "--:--";
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }

  async function handleSave() {
    let newMinutes = parseInt(isCustom ? customMinutes : selectedDuration, 10);
    if (isNaN(newMinutes) || newMinutes < 5) {
      toast.error("Set a duration of at least 5 minutes.");
      return;
    }
    if (newMinutes > 1440) {
      toast.error("Meeting duration cannot exceed 24 hours (1440 minutes).");
      return;
    }

    setSaving(true);
    try {
      await onSaveDuration(newMinutes);
      toast.success(`Meeting time limit updated to ${newMinutes} minutes.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update duration.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-brand" /> Meeting Settings
          </DialogTitle>
          <DialogDescription>
            Adjust the time limit for this meeting without interrupting active participants.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-surface p-3.5 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Current Time Limit</span>
              <span className="font-medium text-foreground">{currentDurationMinutes} minutes</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Time Remaining</span>
              <span className="font-mono font-semibold text-brand">
                {formatTime(remainingSeconds)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration-select">Change Time Limit</Label>
            <select
              id="duration-select"
              value={isCustom ? "custom" : selectedDuration}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setIsCustom(true);
                  setCustomMinutes(String(currentDurationMinutes));
                } else {
                  setIsCustom(false);
                  setSelectedDuration(e.target.value);
                }
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour (60 minutes)</option>
              <option value="120">2 hours (120 minutes)</option>
              <option value="180">3 hours (180 minutes)</option>
              <option value="custom">Custom duration…</option>
            </select>
          </div>

          {isCustom ? (
            <div className="space-y-1.5">
              <Label htmlFor="custom-minutes">Custom Duration (minutes)</Label>
              <input
                id="custom-minutes"
                type="number"
                min={5}
                max={1440}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="e.g. 45"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Shield className="size-3.5 text-warning shrink-0" />
            Extending the duration updates the deadline for all participants seamlessly.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
