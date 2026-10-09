import { Crown, Mic, MicOff, MoreVertical, Video, VideoOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MediaParticipant } from "@/types";

export interface WaitingParticipant {
  id: string;
  displayName: string;
}

export function ParticipantsPanel({
  participants = [],
  waitingParticipants = [],
  isHost,
  onClose,
  onMuteParticipant,
  onRemoveParticipant,
  onAdmitParticipant,
  onRejectParticipant,
}: {
  participants?: MediaParticipant[];
  waitingParticipants?: WaitingParticipant[];
  isHost: boolean;
  onClose: () => void;
  onMuteParticipant: (id: string) => void;
  onRemoveParticipant: (id: string) => void;
  onAdmitParticipant?: (id: string) => void;
  onRejectParticipant?: (id: string) => void;
}) {
  const safeParticipants = participants || [];
  const safeWaiting = waitingParticipants || [];

  return (
    <aside
      className="flex h-full w-full flex-col border-l border-border bg-card"
      aria-label="Participants"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          Participants ({safeParticipants.length})
          {safeWaiting.length > 0 ? (
            <span className="ml-1 text-xs text-warning">({safeWaiting.length} waiting)</span>
          ) : null}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Close participants" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {isHost && safeWaiting.length > 0 ? (
          <div className="border-b border-border p-3">
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
              Waiting to join ({safeWaiting.length})
            </h3>
            <ul className="space-y-2">
              {safeWaiting.map((wp) => (
                <li
                  key={wp.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/50 p-2 text-xs"
                >
                  <span className="truncate font-medium">{wp.displayName}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => onAdmitParticipant?.(wp.id)}
                    >
                      Admit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => onRejectParticipant?.(wp.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="divide-y divide-border">
          {safeParticipants.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">
                  {p.displayName}
                  {p.isLocal ? " (you)" : ""}
                </span>
                {p.role === "host" ? (
                  <Crown className="size-3.5 shrink-0 text-amber-400" aria-label="Host" />
                ) : null}
              </div>

              <div className="flex items-center gap-1.5">
                <span
                  className={p.micEnabled ? "text-emerald-500" : "text-muted-foreground"}
                  title={p.micEnabled ? "Mic on" : "Mic off"}
                >
                  {p.micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                </span>
                <span
                  className={p.cameraEnabled ? "text-emerald-500" : "text-muted-foreground"}
                  title={p.cameraEnabled ? "Camera on" : "Camera off"}
                >
                  {p.cameraEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />}
                </span>

                {isHost && !p.isLocal ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7">
                        <MoreVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onMuteParticipant(p.id)}>
                        Mute participant
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onRemoveParticipant(p.id)}
                      >
                        Remove from meeting
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}