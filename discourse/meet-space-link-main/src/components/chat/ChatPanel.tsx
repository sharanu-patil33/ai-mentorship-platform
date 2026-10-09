import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/types";
import { initialsOf } from "@/components/navigation/AppHeader";
import { resolvePublicProfile } from "@/services/chat";

export function ChatPanel({
  messages,
  currentUserId,
  currentDisplayName,
  onClose,
  onSend,
}: {
  messages: ChatMessage[];
  currentUserId?: string | null;
  currentDisplayName?: string;
  onClose: () => void;
  onSend?: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const enabled = typeof onSend === "function";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const textToSend = typeof draft === "string" ? draft.trim() : String(draft || "").trim();
    if (!enabled || !textToSend) return;
    onSend?.(textToSend);
    setDraft("");
  }

  return (
    <aside
      className="flex h-full w-80 sm:w-96 shrink-0 flex-col border-l border-border bg-card shadow-2xl z-30 transition-all duration-200"
      aria-label="In-meeting chat sidebar"
    >
      {/* Sidebar Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3.5 bg-card/90 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-brand-soft text-brand">
            <MessageSquare className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground leading-tight">In-Meeting Chat</h2>
            <p className="text-[11px] text-muted-foreground leading-tight">Visible to everyone in this meeting</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full hover:bg-accent"
          aria-label="Close chat panel"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>

      {/* Messages Scroll View */}
      <div className="flex-1 space-y-3.5 overflow-y-auto p-4 bg-background/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <div className="p-3 rounded-full bg-muted/60 mb-2">
              <MessageSquare className="size-6 text-muted-foreground/70" />
            </div>
            <p className="text-sm font-semibold text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">Send a message to start chatting with meeting participants.</p>
          </div>
        ) : (
          messages.map((m: any) => {
            const contentText = m.text || m.message || "";
            const senderProfile = m.sender || (m.sender_id ? resolvePublicProfile(m.sender_id) : null);
            const senderName = m.sender_name || senderProfile?.name || "Participant";

            const isSelf = Boolean(
              (currentUserId && (m.sender_id === currentUserId || m.sender_id === resolvePublicProfile(currentUserId).id)) ||
              (currentDisplayName && senderName === currentDisplayName)
            );

            const timeStr = m.created_at
              ? new Date(m.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Just now";

            return (
              <div
                key={m.id || Math.random().toString()}
                className={`flex gap-2.5 max-w-[88%] ${isSelf ? "ml-auto flex-row-reverse" : "mr-auto"}`}
              >
                {!isSelf && (
                  <Avatar className="size-7 shrink-0 mt-0.5 border border-border">
                    <AvatarFallback className="bg-brand-soft text-[10px] font-bold text-brand-dark">
                      {initialsOf(senderName)}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className={`flex flex-col gap-1 min-w-0 ${isSelf ? "items-end" : "items-start"}`}>
                  {!isSelf && (
                    <span className="text-[11px] font-semibold text-foreground px-1">
                      {senderName}
                    </span>
                  )}

                  <div
                    className={`rounded-2xl px-3.5 py-2 text-xs shadow-xs ${
                      isSelf
                        ? "bg-brand text-brand-foreground rounded-br-xs"
                        : "bg-card border border-border text-foreground rounded-bl-xs"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{contentText}</p>
                    <p
                      className={`text-[9px] mt-1 text-right opacity-70 ${
                        isSelf ? "text-brand-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {timeStr}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Footer */}
      <footer className="border-t border-border p-3.5 bg-card">
        <form onSubmit={submit} className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={enabled ? "Send a message to meeting…" : "Connecting chat…"}
            disabled={!enabled}
            className="flex-1 rounded-full bg-background border-border text-xs px-4"
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={!enabled || !draft.trim()}
            className="size-8 shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand-dark cursor-pointer"
          >
            <Send className="size-3.5" />
          </Button>
        </form>
      </footer>
    </aside>
  );
}