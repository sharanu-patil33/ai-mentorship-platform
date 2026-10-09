import { Link } from "@tanstack/react-router";
import { CalendarClock, Clock, Copy, Video } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { meetingLink } from "@/lib/meeting-id";
import type { Meeting } from "@/types";

const STATUS_LABEL: Record<Meeting["status"], string> = {
  scheduled: "Scheduled",
  waiting: "Waiting",
  active: "Live",
  expired: "Expired",
  ended: "Ended",
};

function formatWhen(meeting: Meeting): string {
  const date = new Date(meeting.scheduled_at ?? meeting.created_at);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(meeting: Meeting): string {
  if (meeting.started_at && meeting.ended_at) {
    const start = new Date(meeting.started_at).getTime();
    const end = new Date(meeting.ended_at).getTime();
    const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
    return `${diffMinutes} min actual`;
  }
  return `${meeting.duration_minutes ?? 60} min limit`;
}

export function MeetingCard({ meeting, hostName }: { meeting: Meeting; hostName: string }) {
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(meetingLink(meeting.meeting_id));
      toast.success("Meeting link copied");
    } catch {
      toast.error("Couldn't copy the link. Copy it from the meeting page instead.");
    }
  }

  const isInactive = meeting.status === "ended" || meeting.status === "expired";
  const isFutureScheduled =
    meeting.scheduled_at && new Date(meeting.scheduled_at).getTime() > Date.now();

  const durationText = formatDuration(meeting);
  const whenText = formatWhen(meeting);

  return (
    <Card className="shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{meeting.title}</h3>
            <Badge
              variant={
                meeting.status === "active"
                  ? "default"
                  : meeting.status === "expired" || meeting.status === "ended"
                    ? "secondary"
                    : "outline"
              }
              className={isInactive ? "opacity-75" : undefined}
            >
              {STATUS_LABEL[meeting.status]}
            </Badge>
            {meeting.locked ? <Badge variant="outline">Locked</Badge> : null}
            {meeting.waiting_room_enabled ? <Badge variant="outline">Waiting Room</Badge> : null}
          </div>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            {whenText} · Host: {hostName}
            <span className="inline-flex items-center gap-1 text-xs">
              <Clock className="size-3 shrink-0" />
              {durationText}
            </span>
          </p>
          <p className="font-mono text-xs tracking-wider text-muted-foreground">
            {meeting.meeting_id}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isInactive ? (
            <Button variant="outline" size="sm" onClick={() => void copyLink()}>
              <Copy className="size-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Copy link</span>
            </Button>
          ) : null}

          {isInactive ? (
            <Button variant="ghost" size="sm" disabled>
              {meeting.status === "expired" ? "Expired" : "Ended"}
            </Button>
          ) : isFutureScheduled ? (
            <Button asChild size="sm" variant="secondary" title={`Available on ${whenText}`}>
              <Link to="/meeting/$meetingId" params={{ meetingId: meeting.meeting_id }}>
                <CalendarClock className="size-4 mr-1 text-brand" aria-hidden="true" /> Scheduled
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/meeting/$meetingId" params={{ meetingId: meeting.meeting_id }}>
                <Video className="size-4" aria-hidden="true" /> Join
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}