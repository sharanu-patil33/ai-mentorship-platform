import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Video, ArrowRight, X, CheckCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { DirectMessage } from "@/types";
import { initialsOf } from "@/lib/utils";
import { resolvePublicProfile } from "@/services/chat";

interface MessageItemProps {
  message: DirectMessage;
  isSelf: boolean;
  isGroup: boolean;
}

export function MessageItem({ message, isSelf, isGroup }: MessageItemProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Resolve sender profile to real human name and avatar
  const senderProfile = resolvePublicProfile(message.sender || message.sender_id);
  const senderName = senderProfile?.name || "Participant";

  const isMeetingCard = Boolean(
    message.meeting_id || (message.text && message.text.includes("🎥")),
  );

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isRead = Boolean(message.read_at);

  return (
    <div className={`flex items-end gap-2.5 my-2 ${isSelf ? "justify-end" : "justify-start"}`}>
      {/* Left Avatar for received messages in group or 1-on-1 */}
      {!isSelf && (
        <Avatar className="size-8 border border-border shrink-0">
          {senderProfile?.avatar_url ? <AvatarImage src={senderProfile.avatar_url} /> : null}
          <AvatarFallback className="bg-brand-soft text-[10px] font-bold text-brand-dark">
            {initialsOf(senderName)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] md:max-w-[65%] ${isSelf ? "items-end" : "items-start"}`}>
        {/* Sender Name Header for received messages in group */}
        {!isSelf && isGroup && (
          <span className="text-[10px] font-semibold text-muted-foreground ml-1 mb-1">
            {senderName}
          </span>
        )}

        {/* Meeting Invite / Status Card */}
        {isMeetingCard ? (
          <div
            className={`p-4 rounded-2xl border shadow-xs max-w-sm w-full space-y-3 transition-all ${
              isSelf
                ? "bg-brand-soft/60 border-brand/20 text-foreground"
                : "bg-card border-border text-foreground"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <Video className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-foreground truncate">MeetSpace Video Meeting</h4>
                <p className="text-xs text-muted-foreground font-medium truncate">{message.text}</p>
              </div>
            </div>

            {message.meeting_id && (
              <Button
                asChild
                size="sm"
                className="w-full font-bold text-xs bg-brand text-brand-foreground hover:bg-brand-dark rounded-xl h-9 shadow-xs cursor-pointer"
              >
                <Link to="/meeting/$meetingId" params={{ meetingId: message.meeting_id }}>
                  Join Meeting <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
              <span>{formattedTime}</span>
              {isSelf && (
                <span className={`flex items-center gap-1 font-bold ${isRead ? "text-[#53bdeb]" : "text-emerald-600 dark:text-emerald-400"}`}>
                  <CheckCheck className="size-3.5" /> {isRead ? "Read" : "Delivered"}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Normal Chat Message Bubble */
          <div
            className={`px-4 py-2.5 rounded-2xl shadow-2xs space-y-1 relative break-words ${
              isSelf
                ? "bg-brand text-brand-foreground rounded-br-none"
                : "bg-card border border-border text-foreground rounded-bl-none"
            }`}
          >
            {/* Embedded Image Attachment */}
            {message.media_url && (
              <div className="mb-2 overflow-hidden rounded-xl border border-black/10">
                <img
                  src={message.media_url}
                  alt="Attachment"
                  className="max-h-60 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                  onClick={() => setLightboxOpen(true)}
                />
              </div>
            )}

            {/* Message Text Content */}
            {message.text && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
            )}

            {/* Timestamp & Read Receipt Double Blue Ticks */}
            <div className={`flex items-center gap-1 text-[10px] justify-end pt-0.5 ${
              isSelf ? "text-brand-foreground/90" : "text-muted-foreground"
            }`}>
              <span>{formattedTime}</span>
              {isSelf && (
                <CheckCheck className={`size-4 font-extrabold ${isRead ? "text-[#53bdeb] drop-shadow-xs" : "text-white/60"}`} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Image Lightbox Modal */}
      {lightboxOpen && message.media_url && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 cursor-pointer"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="size-6" />
          </button>
          <img
            src={message.media_url}
            alt="Attachment Full View"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl"
          />
        </div>
      )}
    </div>
  );
}
