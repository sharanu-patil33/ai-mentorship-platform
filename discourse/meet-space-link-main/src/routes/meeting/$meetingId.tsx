import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  Clock,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Settings,
  Shield,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/navigation/Logo";
import { ChatDrawer } from "@/components/meeting/ChatDrawer";
import { MeetingShell } from "@/components/meeting/MeetingShell";
import { ParticipantsPanel } from "@/components/participants/ParticipantsPanel";
import { VideoGrid } from "@/components/meeting/VideoGrid";
import { PreJoinScreen } from "@/components/meeting/PreJoinScreen";
import { ControlBar } from "@/components/meeting/ControlBar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseMeetingInput } from "@/lib/meeting-id";
import { DISPLAY_NAME_KEY, useMeetingRoom } from "@/hooks/useMeetingRoom";
import { useMeetingRecording } from "@/hooks/useMeetingRecording";
import { updateMeetingStatus } from "@/services/meetings";
import { joinMeeting, leaveMeeting, getParticipantStatus } from "@/services/participants";
import { useMeetingById } from "@/services/queries";
import { updateMeetingCardStatus } from "@/services/chatMeetings";
import { stringToUUID } from "@/services/chat";
import type { Meeting } from "@/types";

export const Route = createFileRoute("/meeting/$meetingId")({
  component: MeetingPage,
});

function MeetingPage() {
  const params = Route.useParams();
  const rawParam = params?.meetingId || "";
  const code = (parseMeetingInput(rawParam) || decodeURIComponent(rawParam)).trim();
  const navigate = useNavigate();

  const { data, isLoading } = useMeetingById(code);

  useEffect(() => {
    if (data?.status === "ended") {
      toast.info("The meeting has ended.");
      const preCallRoute = typeof window !== "undefined" ? window.sessionStorage.getItem("meetspace_pre_call_route") : null;
      if (preCallRoute) {
        window.sessionStorage.removeItem("meetspace_pre_call_route");
        void navigate({ to: preCallRoute as any });
      } else {
        void navigate({ to: "/chat" });
      }
    }
  }, [data?.status, navigate]);

  if (isLoading && !data) {
    return (
      <MeetingShell>
        <div className="flex h-full flex-col items-center justify-center space-y-4">
          <Skeleton className="h-12 w-48 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded-md" />
        </div>
      </MeetingShell>
    );
  }

  if (!data) {
    return (
      <MeetingShell>
        <div className="flex flex-1 items-center justify-center p-6 bg-slate-950">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl text-center space-y-5">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/20 mx-auto">
              <VideoOff className="size-7" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-white">Meeting Not Found</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                No active meeting exists for code <code className="font-mono text-cyan-400">{code}</code>. The host may have ended it or the code might be incorrect.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 pt-2">
              <Button asChild className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold text-white shadow-lg">
                <Link to="/create-meeting">Create a Meeting</Link>
              </Button>
              <Button asChild variant="outline" className="w-full border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800">
                <Link to="/join">Try Another Code</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full text-xs text-slate-400 hover:text-white">
                <Link to="/">Return to Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </MeetingShell>
    );
  }

  return <MeetingExperience meeting={data} />;
}

function MeetingExperience({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isHost = Boolean(user && user.id === meeting.host_id);

  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const participantRowId = useRef<string | null>(null);

  const storedName =
    typeof window === "undefined" ? "" : (window.sessionStorage.getItem(DISPLAY_NAME_KEY) ?? "");
  const defaultName =
    profile?.name || user?.user_metadata?.["name"] || (user?.email ? user.email.split("@")[0] : "") || storedName || "Participant";

  // Previously an unconditional useEffect here called handleJoin() for every
  // visitor immediately on mount, regardless of host/reconnect status. That
  // skipped PreJoinScreen entirely (it would mount and unmount within the
  // same tick, before its own useLocalMedia() getUserMedia() call could
  // resolve), then raced a second competing useLocalMedia() call from
  // useMeetingRoom() a moment later — which is why the camera/mic permission
  // prompt never appeared, even on localhost. Removed so handleJoin only
  // fires from the user's explicit "Join meeting" click on PreJoinScreen
  // (already wired via onJoin={handleJoin} below), exactly like the
  // reference flow where a real pre-join screen preceded joining.

  // Waiting Room Poller: Automatically admits guest when host approves
  useEffect(() => {
    if (!isWaiting || !participantRowId.current) return;
    const interval = setInterval(async () => {
      try {
        const st = await getParticipantStatus(participantRowId.current!);
        if (st === "admitted") {
          setIsWaiting(false);
          setJoined(true);
          toast.success("The host admitted you to the meeting!");
        } else if (st === "rejected" || st === "removed") {
          setIsWaiting(false);
          setIsRejected(true);
        }
      } catch {
        /* best effort */
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [isWaiting]);

  async function handleJoin(nameEntered: string) {
    setDisplayName(nameEntered);
    setJoining(true);
    try {
      if (isHost && meeting.status !== "active") {
        void updateMeetingStatus(meeting.meeting_id || meeting.id, "active");
      }

      const p = await joinMeeting({
        meetingId: meeting.meeting_id || meeting.id,
        userId: user?.id ?? null,
        displayName: nameEntered,
        role: isHost ? "host" : "participant",
        waitingRoomEnabled: meeting.waiting_room_enabled && !isHost,
      });
      participantRowId.current = p.id;
      if (p.status === "waiting") {
        setIsWaiting(true);
      } else {
        setJoined(true);
      }
    } catch {
      setJoined(true);
    } finally {
      setJoining(false);
    }
  }

  if (isRejected) {
    return (
      <MeetingMessage
        title="Access denied"
        body="The host rejected your request to join or removed you from the meeting."
        code={meeting.meeting_id}
      />
    );
  }

  if (isWaiting) {
    return (
      <MeetingShell>
        <div className="px-6 py-6">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-24">
          <div className="max-w-md text-center space-y-3">
            <Clock className="mx-auto size-12 text-brand animate-pulse" />
            <h1 className="text-2xl font-semibold">Waiting to be admitted</h1>
            <p className="text-sm text-muted-foreground">
              The host has been notified and will let you in shortly. Please stay on this page.
            </p>
          </div>
        </div>
      </MeetingShell>
    );
  }

  if (!joined) {
    return (
      <MeetingShell>
        <div className="px-6 py-6">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <PreJoinScreen
            meeting={meeting}
            defaultName={defaultName}
            nameLocked={Boolean(profile)}
            joining={joining}
            onJoin={handleJoin}
          />
        </div>
      </MeetingShell>
    );
  }

  const handleReturnNavigation = () => {
    const preCallRoute = typeof window !== "undefined" ? window.sessionStorage.getItem("meetspace_pre_call_route") : null;
    if (preCallRoute) {
      window.sessionStorage.removeItem("meetspace_pre_call_route");
      void navigate({ to: preCallRoute as any });
    } else {
      void navigate({ to: "/chat" });
    }
  };

  return (
    <RoomActive
      meeting={meeting}
      participantRowId={participantRowId.current}
      userId={user?.id ?? null}
      displayName={displayName || defaultName}
      role={isHost ? "host" : "participant"}
      onLeave={handleReturnNavigation}
    />
  );
}

function RoomActive({
  meeting,
  participantRowId,
  userId,
  displayName,
  role,
  onLeave,
}: {
  meeting: Meeting;
  participantRowId: string | null;
  userId: string | null;
  displayName: string;
  role: "host" | "participant";
  onLeave: () => void;
}) {
  const room = useMeetingRoom({
    meetingId: meeting.meeting_id || meeting.id,
    participantRowId,
    userId,
    displayName,
    role,
    initialLocked: meeting.locked,
    initialDurationMinutes: 1440,
    initialExpiresAt: null,
    initialTimeWarningSent: true,
    onEndedByHost: () => {
      toast.info("The call ended.");
      onLeave();
    },
    onRemovedByHost: () => {
      toast.error("You left the call.");
      onLeave();
    },
  });

  const recording = useMeetingRecording(meeting.meeting_id);
  const [activePanel, setActivePanel] = useState<"chat" | "participants" | "settings" | null>(null);

  const startTimeRef = useRef<number>(Date.now());

  // Call duration timer
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDurationSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ESC Key Guard: ESC closes active side panel, but DOES NOT end active call!
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.code === "Escape") {
        if (activePanel) {
          e.preventDefault();
          setActivePanel(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePanel]);

  useEffect(() => {
    if (activePanel === "chat") {
      room.markChatRead();
    }
  }, [activePanel, room.messages.length, room.markChatRead]);

  async function handleLeave() {
    try {
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
      void updateMeetingCardStatus(meeting.meeting_id || meeting.id, "completed", elapsedSeconds);

      if (role === "host") {
        room.endForEveryone();
        void updateMeetingStatus(meeting.id, "ended");
      }
      if (participantRowId) {
        void leaveMeeting(participantRowId);
      }
      void room.leave();
    } catch (err) {
      console.warn("Notice during leave:", err);
    } finally {
      onLeave();
    }
  }

  const remainingMins = Math.max(1, Math.floor((1440 * 60 - callDurationSeconds) / 60));
  const remainingSecs = String(Math.max(0, (1440 * 60 - callDurationSeconds) % 60)).padStart(2, "0");
  const formattedRemaining = `${remainingMins}:${remainingSecs}`;

  const hostDisplayName = displayName || "Host";

  return (
    <TooltipProvider>
      <MeetingShell>
        {/* Top Header (Polished MeetSpace Room Header) */}
        <header className="flex h-16 items-center justify-between border-b border-slate-800/80 px-6 bg-slate-950/90 backdrop-blur-md text-foreground shrink-0 z-20">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="hidden md:flex items-center gap-2 border-l border-slate-800 pl-4">
              <span className="text-sm font-bold text-white truncate max-w-[200px]">{meeting.title}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 ring-1 ring-cyan-500/20">
                <Shield className="size-3" /> Encrypted
              </span>
            </div>
          </div>
          
          {/* Top Center Duration & Remaining Timer Pill */}
          <div className="flex items-center gap-2.5 font-mono text-xs font-semibold text-slate-300 bg-slate-900/90 px-4 py-1.5 rounded-full border border-slate-800 shadow-lg">
            <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">{meeting.duration_minutes || 60}m limit</span>
            <span className="text-slate-700">|</span>
            <span>Time remaining: <strong className="text-white font-bold">{formattedRemaining}</strong></span>
          </div>

          {/* Top Right Host Info & Meeting Code */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end text-xs">
              <span className="font-semibold text-white">{displayName || "Participant"}</span>
              <span className="font-mono text-[11px] tracking-wider text-slate-400">{meeting.meeting_id}</span>
            </div>
          </div>
        </header>

        {/* Main Stage Grid & Panels */}
        <div className="relative flex flex-1 overflow-hidden bg-slate-950">
          <main className="flex-1 p-3 sm:p-4 flex flex-col min-h-0 overflow-hidden">
            <VideoGrid participants={room.participants} />
          </main>

          {/* Right Side Panels (Chat & Participants) */}
          {activePanel === "chat" ? (
            <aside className="w-80 border-l border-border bg-card flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
              <ChatDrawer
                messages={room.messages}
                onSend={room.sendChat}
                onClose={() => setActivePanel(null)}
              />
            </aside>
          ) : null}

          {activePanel === "participants" ? (
            <aside className="w-80 border-l border-border bg-card flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
              <ParticipantsPanel
                participants={room.participants}
                waitingParticipants={room.waitingParticipants}
                isHost={role === "host"}
                onClose={() => setActivePanel(null)}
                onMuteParticipant={room.muteParticipant}
                onRemoveParticipant={room.removeParticipant}
                onAdmitParticipant={room.admitParticipant}
                onRejectParticipant={room.rejectParticipant}
              />
            </aside>
          ) : null}
        </div>

        {/* Bottom Floating Control Bar (Original MeetSpace Floating Dock) */}
        <ControlBar
          micEnabled={room.media.micEnabled}
          cameraEnabled={room.media.cameraEnabled}
          screenSharing={room.media.screenSharing}
          chatOpen={activePanel === "chat"}
          participantsOpen={activePanel === "participants"}
          activePanel={activePanel}
          isHost={role === "host"}
          unreadCount={room.unreadCount}
          locked={room.locked}
          onToggleMic={room.media.toggleMic}
          onToggleCamera={room.media.toggleCamera}
          onToggleScreenShare={
            room.media.screenSharing
              ? room.media.stopScreenShare
              : () => void room.media.startScreenShare()
          }
          onToggleChat={() => setActivePanel(activePanel === "chat" ? null : "chat")}
          onToggleParticipants={() => setActivePanel(activePanel === "participants" ? null : "participants")}
          onTogglePanel={(panel) => setActivePanel(activePanel === panel ? null : panel)}
          onLeave={() => void handleLeave()}
          onEndMeeting={() => void handleLeave()}
          onLockMeeting={() => void room.toggleLock()}
        />
      </MeetingShell>
    </TooltipProvider>
  );
}

function MeetingMessage({
  title,
  body,
  code,
  icon,
}: {
  title: string;
  body: string;
  code?: string;
  icon?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <MeetingShell>
      <div className="px-6 py-6">
        <Logo />
      </div>
      <div className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="max-w-md text-center space-y-4 bg-card border border-border p-8 rounded-3xl shadow-xl">
          {icon || <VideoOff className="mx-auto size-12 text-destructive mb-3" />}
          <h1 className="text-2xl font-bold font-display text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          {code ? (
            <p className="font-mono text-xs text-muted-foreground bg-muted p-2 rounded-xl">
              Code: {code}
            </p>
          ) : null}
          <div className="pt-2">
            <Button
              onClick={() => void navigate({ to: "/chat" })}
              className="w-full font-bold bg-brand text-brand-foreground hover:bg-brand-dark rounded-xl py-5 text-xs shadow-md cursor-pointer"
            >
              Return to Chat
            </Button>
          </div>
        </div>
      </div>
    </MeetingShell>
  );
}