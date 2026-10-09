import { Video, PhoneOff, PhoneCall, UserX, Check, AlertCircle, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { PublicProfile } from "@/types";
import { initialsOf } from "@/lib/utils";
import type { CallState } from "@/services/callService";

interface CallModalProps {
  mode: "outgoing" | "incoming" | "inactive" | "busy" | "no_answer" | "declined";
  state?: CallState;
  targetProfile: PublicProfile;
  meetingId?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

export function CallModal({
  mode,
  state,
  targetProfile,
  meetingId,
  onAccept,
  onDecline,
  onCancel,
  onClose,
}: CallModalProps) {
  const activeMode = mode || state?.mode || "outgoing";
  const name = targetProfile.name || "MeetSpace Member";
  const username = targetProfile.username || "@user";

  const renderContent = () => {
    switch (activeMode) {
      case "outgoing":
        return {
          title: "Starting Meeting...",
          subtitle: `Ringing ${name}...`,
          icon: <Video className="size-8 text-brand animate-pulse" />,
          actions: (
            <Button
              variant="destructive"
              size="lg"
              onClick={onCancel || onClose}
              className="rounded-full px-8 font-bold cursor-pointer hover:bg-red-700 shadow-md"
            >
              <PhoneOff className="size-5 mr-2" /> Cancel
            </Button>
          ),
        };

      case "incoming":
        return {
          title: "Incoming Meeting",
          subtitle: `${name} is starting a MeetSpace meeting with you...`,
          icon: <PhoneCall className="size-8 text-emerald-500 animate-bounce" />,
          actions: (
            <div className="flex items-center gap-4">
              <Button
                variant="destructive"
                size="lg"
                onClick={onDecline || onClose}
                className="rounded-full px-6 font-bold cursor-pointer hover:bg-red-700 shadow-md"
              >
                <PhoneOff className="size-5 mr-2" /> Decline
              </Button>
              <Button
                size="lg"
                onClick={onAccept}
                className="rounded-full px-8 font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-md"
              >
                <Check className="size-5 mr-2" /> Accept
              </Button>
            </div>
          ),
        };

      case "busy":
        return {
          title: "User Busy",
          subtitle: `${name} is currently in another meeting.`,
          icon: <UserX className="size-8 text-amber-500" />,
          actions: (
            <Button
              variant="outline"
              size="lg"
              onClick={onClose}
              className="rounded-full px-8 font-bold cursor-pointer"
            >
              Close
            </Button>
          ),
        };

      case "no_answer":
        return {
          title: "No Answer",
          subtitle: `${name} did not answer the meeting request.`,
          icon: <Clock className="size-8 text-amber-500" />,
          actions: (
            <Button
              variant="outline"
              size="lg"
              onClick={onClose}
              className="rounded-full px-8 font-bold cursor-pointer"
            >
              Close
            </Button>
          ),
        };

      case "declined":
        return {
          title: "Meeting Declined",
          subtitle: `${name} declined the meeting.`,
          icon: <AlertCircle className="size-8 text-destructive" />,
          actions: (
            <Button
              variant="outline"
              size="lg"
              onClick={onClose}
              className="rounded-full px-8 font-bold cursor-pointer"
            >
              Close
            </Button>
          ),
        };

      default:
        return {
          title: "Meeting",
          subtitle: "Connecting meeting...",
          icon: <Video className="size-8 text-brand" />,
          actions: (
            <Button variant="outline" size="lg" onClick={onClose} className="rounded-full px-8 font-bold cursor-pointer">
              Close
            </Button>
          ),
        };
    }
  };

  const content = renderContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border p-8 shadow-2xl text-center space-y-6">
        {/* Pulsing Avatar Header */}
        <div className="relative mx-auto size-24">
          <div className="absolute inset-0 rounded-full bg-brand/20 animate-ping opacity-75" />
          <Avatar className="relative size-24 border-4 border-card shadow-lg">
            {targetProfile.avatar_url ? <AvatarImage src={targetProfile.avatar_url} /> : null}
            <AvatarFallback className="bg-brand-soft text-2xl font-bold text-brand-dark">
              {initialsOf(name)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* User Identity Info */}
        <div className="space-y-1">
          <h3 className="text-xl font-bold font-display text-foreground">{name}</h3>
          <p className="text-xs text-brand font-medium">{username}</p>
        </div>

        {/* State Banner */}
        <div className="flex flex-col items-center space-y-2 py-2">
          {content.icon}
          <p className="text-base font-bold text-foreground">{content.title}</p>
          <p className="text-xs text-muted-foreground max-w-xs">{content.subtitle}</p>
        </div>

        {/* Action Controls */}
        <div className="flex justify-center pt-2">{content.actions}</div>
      </div>
    </div>
  );
}
