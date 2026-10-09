import {
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  PhoneOff,
  Users,
  Video,
  VideoOff,
  Lock,
  Unlock,
  Sliders,
  Hand,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ControlBarProps {
  micEnabled?: boolean;
  audioMuted?: boolean;
  cameraEnabled?: boolean;
  videoMuted?: boolean;
  screenSharing?: boolean;
  screenShareSupported?: boolean;
  handRaised?: boolean;
  chatOpen?: boolean;
  participantsOpen?: boolean;
  activePanel?: "chat" | "participants" | "settings" | null;
  isHost?: boolean;
  unreadCount?: number;
  unreadChatCount?: number;
  locked?: boolean;
  isRecording?: boolean;

  onToggleMic?: () => void;
  onToggleAudio?: () => void;
  onToggleCamera?: () => void;
  onToggleVideo?: () => void;
  onToggleScreenShare?: () => void;
  onToggleHand?: () => void;
  onToggleChat?: () => void;
  onToggleParticipants?: () => void;
  onTogglePanel?: (panel: "chat" | "participants" | "settings") => void;
  onLeave?: () => void;
  onLeaveMeeting?: () => void;
  onLockMeeting?: () => void;
  onOpenSettings?: () => void;
  onEndMeeting?: () => void;
}

function ControlButton({
  label,
  active,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={`size-12 rounded-full cursor-pointer transition-all shadow-md ${
            danger
              ? "bg-red-600 text-white hover:bg-red-700 border border-red-500"
              : active
              ? "bg-teal-600 text-white hover:bg-teal-700 border border-teal-500"
              : "bg-slate-800 text-white hover:bg-slate-700 border border-slate-700"
          }`}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="bg-slate-900 text-white border-slate-800">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ControlBar(props: ControlBarProps) {
  const isMicOn = props.micEnabled !== undefined ? props.micEnabled : !props.audioMuted;
  const isCamOn = props.cameraEnabled !== undefined ? props.cameraEnabled : !props.videoMuted;
  const isChatActive = props.chatOpen || props.activePanel === "chat";
  const isParticipantsActive = props.participantsOpen || props.activePanel === "participants";
  const unreadMsgCount = props.unreadCount || props.unreadChatCount || 0;

  const handleMicToggle = props.onToggleMic || props.onToggleAudio || (() => {});
  const handleCamToggle = props.onToggleCamera || props.onToggleVideo || (() => {});
  const handleLeaveClick = props.onLeave || props.onLeaveMeeting || props.onEndMeeting || (() => {});
  const handleChatToggle = props.onToggleChat || (() => props.onTogglePanel?.("chat"));
  const handleParticipantsToggle = props.onToggleParticipants || (() => props.onTogglePanel?.("participants"));

  return (
    <TooltipProvider>
      <div className="mx-auto my-3 flex flex-wrap items-center justify-center gap-3.5 rounded-full border border-slate-800/90 bg-slate-900/90 px-6 py-2.5 shadow-2xl backdrop-blur-xl shrink-0 z-30">
        <ControlButton
          label={isMicOn ? "Mute microphone" : "Unmute microphone"}
          danger={!isMicOn}
          onClick={handleMicToggle}
        >
          {isMicOn ? <Mic className="size-5 text-white" /> : <MicOff className="size-5 text-white" />}
        </ControlButton>

        <ControlButton
          label={isCamOn ? "Turn camera off" : "Turn camera on"}
          danger={!isCamOn}
          onClick={handleCamToggle}
        >
          {isCamOn ? <Video className="size-5 text-white" /> : <VideoOff className="size-5 text-white" />}
        </ControlButton>

        <ControlButton
          label={props.screenSharing ? "Stop sharing your screen" : "Share your screen"}
          active={props.screenSharing}
          disabled={props.screenShareSupported === false}
          onClick={props.onToggleScreenShare}
        >
          <MonitorUp className="size-5 text-white" />
        </ControlButton>

        <ControlButton
          label="Meeting chat"
          active={isChatActive}
          onClick={handleChatToggle}
        >
          <div className="relative">
            <MessageSquare className="size-5 text-white" />
            {unreadMsgCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 flex size-4.5 items-center justify-center rounded-full bg-cyan-500 font-mono text-[10px] font-bold text-white shadow-md animate-pulse">
                {unreadMsgCount}
              </span>
            ) : null}
          </div>
        </ControlButton>

        <ControlButton
          label="Participants"
          active={isParticipantsActive}
          onClick={handleParticipantsToggle}
        >
          <Users className="size-5 text-white" />
        </ControlButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-12 rounded-full bg-slate-800/90 text-white hover:bg-slate-700 border border-slate-700/80 cursor-pointer shadow-md transition-all hover:scale-105"
              aria-label="More options"
            >
              <MoreHorizontal className="size-5 text-white" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-52 bg-slate-900/95 backdrop-blur-md border-slate-800 text-white">
            <DropdownMenuLabel className="text-slate-400">Meeting options</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-800" />
            {props.isHost && props.onLockMeeting ? (
              <DropdownMenuItem onClick={props.onLockMeeting} className="cursor-pointer hover:bg-slate-800">
                {props.locked ? (
                  <>
                    <Unlock className="size-4 mr-2 text-emerald-400" /> Unlock meeting
                  </>
                ) : (
                  <>
                    <Lock className="size-4 mr-2 text-amber-400" /> Lock meeting
                  </>
                )}
              </DropdownMenuItem>
            ) : null}
            {props.onOpenSettings ? (
              <DropdownMenuItem onClick={props.onOpenSettings} className="cursor-pointer hover:bg-slate-800">
                <Sliders className="size-4 mr-2 text-slate-300" /> Settings
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <ControlButton label="Leave call" danger onClick={handleLeaveClick}>
          <PhoneOff className="size-5 text-white" />
        </ControlButton>
      </div>
    </TooltipProvider>
  );
}