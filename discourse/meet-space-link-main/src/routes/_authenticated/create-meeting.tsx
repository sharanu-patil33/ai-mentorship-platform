import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/navigation/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { meetingLink } from "@/lib/meeting-id";
import { createMeeting } from "@/services/meetings";
import type { Meeting } from "@/types";

const TITLE = "Create a meeting — MeetSpace";
const DESCRIPTION = "Name your meeting, optionally schedule it, and get a shareable link instantly.";

export const Route = createFileRoute("/_authenticated/create-meeting")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: CreateMeetingPage,
});

function CreateMeetingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationPreset, setDurationPreset] = useState("60");
  const [customMinutes, setCustomMinutes] = useState("");
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(true); // Default TRUE for waiting room feature
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Meeting | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (title.trim().length < 3) {
      setError("Give the meeting a title of at least 3 characters.");
      return;
    }
    if (!user) {
      setError("Your session expired. Sign in again to create meetings.");
      return;
    }

    let durationMins = parseInt(isCustomDuration ? customMinutes : durationPreset, 10);
    if (isNaN(durationMins) || durationMins < 5) {
      setError("Set a duration of at least 5 minutes.");
      return;
    }
    if (durationMins > 1440) {
      setError("Meeting duration cannot exceed 24 hours (1440 minutes).");
      return;
    }

    setSubmitting(true);
    try {
      const meeting = await createMeeting({
        title,
        hostId: user.id,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        waitingRoomEnabled,
        durationMinutes: durationMins,
      });
      setCreated(meeting);
      void queryClient.invalidateQueries({ queryKey: ["meetings", user.id] });
      toast.success(
        waitingRoomEnabled
          ? "Meeting created with Waiting Room enabled!"
          : "Meeting created successfully!",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the meeting.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-6 py-10">
        {created ? (
          <CreatedMeetingCard meeting={created} onCreateAnother={() => setCreated(null)} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
            <h1 className="text-2xl font-semibold">Create a meeting</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Leave the date empty to start an instant room.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="title">Meeting title</Label>
                <Input
                  id="title"
                  placeholder="Weekly product sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="duration">Meeting duration</Label>
                  <select
                    id="duration"
                    value={isCustomDuration ? "custom" : durationPreset}
                    onChange={(e) => {
                      if (e.target.value === "custom") {
                        setIsCustomDuration(true);
                      } else {
                        setIsCustomDuration(false);
                        setDurationPreset(e.target.value);
                      }
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour (60 minutes) — Default</option>
                    <option value="90">1.5 hours (90 minutes)</option>
                    <option value="120">2 hours (120 minutes)</option>
                    <option value="custom">Custom duration…</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="scheduled">Date and time (optional)</Label>
                  <Input
                    id="scheduled"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
              </div>

              {isCustomDuration ? (
                <div className="space-y-1.5">
                  <Label htmlFor="custom-duration">Custom duration (minutes)</Label>
                  <Input
                    id="custom-duration"
                    type="number"
                    min={5}
                    max={1440}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    placeholder="e.g. 45"
                  />
                </div>
              ) : null}

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="waiting-room"
                  type="checkbox"
                  checked={waitingRoomEnabled}
                  onChange={(e) => setWaitingRoomEnabled(e.target.checked)}
                  className="size-4 rounded border-border text-brand focus:ring-brand cursor-pointer"
                />
                <Label htmlFor="waiting-room" className="cursor-pointer text-sm font-medium">
                  Enable Waiting Room (guests must be admitted by host)
                </Label>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create meeting"}
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/dashboard">Cancel</Link>
                </Button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

function CreatedMeetingCard({
  meeting,
  onCreateAnother,
}: {
  meeting: Meeting;
  onCreateAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = meetingLink(meeting.meeting_id);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  }

  async function handleNativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: meeting.title,
          text: `Join my MeetSpace meeting: ${meeting.title}`,
          url: link,
        });
      } catch {
        /* User cancelled or failed */
      }
    } else {
      void handleCopy();
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)] space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-foreground">Your meeting is ready!</h2>
        <p className="text-sm text-muted-foreground">
          Share this link with anyone you want to invite.
        </p>
      </div>

      {meeting.waiting_room_enabled && (
        <div className="rounded-xl bg-brand-soft border border-brand/20 p-4 text-xs text-brand-dark font-medium flex items-center gap-2">
          <Check className="size-4 shrink-0 text-brand" />
          <span>
            <strong>Waiting Room Enabled:</strong> Guests joining this meeting must be admitted by you before entering.
          </span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="share-link">Meeting Link</Label>
        <div className="flex gap-2">
          <Input id="share-link" readOnly value={link} className="font-mono text-sm" />
          <Button onClick={handleCopy} variant="outline" className="shrink-0">
            {copied ? <Check className="size-4 mr-1 text-emerald-600" /> : <Copy className="size-4 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button onClick={handleNativeShare} variant="secondary" className="shrink-0 hidden sm:flex">
            <Share2 className="size-4 mr-1" /> Share
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button asChild className="font-semibold">
          <Link to="/meeting/$meetingId" params={{ meetingId: meeting.meeting_id }}>
            Start / Join Meeting Now
          </Link>
        </Button>
        <Button variant="outline" onClick={onCreateAnother}>
          Create Another Meeting
        </Button>
      </div>
    </div>
  );
}