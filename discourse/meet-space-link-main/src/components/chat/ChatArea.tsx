import { useState, useRef, useEffect, useCallback } from "react";
import {
  MoreVertical,
  Trash2,
  Users,
  ShieldOff,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import type { ChatConversation, DirectMessage, PublicProfile } from "@/types";
import { initialsOf } from "@/lib/utils";
import { getCanonicalUserKey, resolvePublicProfile } from "@/services/chat";

interface ChatAreaProps {
  conversation: ChatConversation;
  messages: DirectMessage[];
  currentUserId: string;
  onSendMessage: (text: string, mediaUrl?: string) => Promise<void>;
  onStartMeeting?: () => void;
  onBack?: () => void;
  onBackMobile?: () => void;
  onClearChat?: () => void;
  onToggleBlock?: () => void;
  loading?: boolean;
}

export function ChatArea({
  conversation,
  messages,
  currentUserId,
  onSendMessage,
  onBack,
  onBackMobile,
  onClearChat,
  onToggleBlock,
  loading = false,
}: ChatAreaProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isGroup = conversation.type === "group";
  const rawProfile: PublicProfile | null = isGroup
    ? null
    : (conversation.other_member || resolvePublicProfile(conversation.id));

  let title = isGroup ? conversation.name || "Group Room" : "User";
  if (!isGroup) {
    if (conversation.other_member?.name && conversation.other_member.name !== "User") {
      title = conversation.other_member.name;
    } else if (rawProfile?.name && rawProfile.name !== "User") {
      title = rawProfile.name;
    } else if (conversation.name && conversation.name !== "Private Chat" && conversation.name !== "User") {
      title = conversation.name;
    } else if (rawProfile?.public_user_id && rawProfile.public_user_id !== "MS-USER") {
      title = rawProfile.public_user_id;
    }
  }

  let username = rawProfile?.username;
  if (!username || username === "@user") {
    if (conversation.other_member?.username && conversation.other_member.username !== "@user") {
      username = conversation.other_member.username;
    }
  }

  const currentCanonicalKey = getCanonicalUserKey(currentUserId);
  const isBlocked = conversation.is_blocked;
  const handleBack = onBackMobile || onBack;

  const scrollToBottom = useCallback((smooth = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      });
    }
  }, []);

  // WhatsApp-style auto-scroll to bottom whenever conversation changes or new messages arrive!
  useEffect(() => {
    scrollToBottom(false);
    const timer = setTimeout(() => scrollToBottom(true), 80);
    return () => clearTimeout(timer);
  }, [conversation.id, messages.length, scrollToBottom]);

  return (
    <div className="relative flex flex-col h-full w-full min-w-0 bg-background overflow-hidden">
      {/* Top Chat Header - Permanently Fixed at Top */}
      <div className="flex items-center justify-between p-3 sm:px-6 border-b border-border bg-card/95 backdrop-blur-md shrink-0 z-20 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          {handleBack && (
            <Button
              size="icon"
              variant="ghost"
              className="md:hidden size-8 shrink-0 cursor-pointer"
              onClick={handleBack}
              title="Back to conversation list"
            >
              <ChevronLeft className="size-5" />
            </Button>
          )}

          <Avatar className="size-10 border border-border shrink-0">
            {rawProfile?.avatar_url || conversation.avatar_url ? (
              <AvatarImage src={rawProfile?.avatar_url || conversation.avatar_url || ""} />
            ) : null}
            <AvatarFallback className="bg-brand-soft font-bold text-brand-dark">
              {isGroup ? <Users className="size-5" /> : initialsOf(title)}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col min-w-0">
            <h3 className="text-sm font-bold text-foreground truncate leading-snug">{title}</h3>
            {username && username !== "@user" ? (
              <p className="text-[11px] font-medium text-brand truncate">{username}</p>
            ) : isGroup ? (
              <p className="text-[11px] text-muted-foreground truncate">Group Conversation</p>
            ) : (
              <p className="text-[11px] text-emerald-500 font-medium truncate flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active Now
              </p>
            )}
          </div>
        </div>

        {/* Right Header Actions: Context Menu */}
        <div className="flex items-center gap-1.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-9 rounded-full cursor-pointer">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {onToggleBlock && !isGroup && (
                <DropdownMenuItem onClick={onToggleBlock} className="cursor-pointer">
                  {isBlocked ? (
                    <>
                      <ShieldCheck className="mr-2 size-4 text-emerald-500" /> Unblock Contact
                    </>
                  ) : (
                    <>
                      <ShieldOff className="mr-2 size-4 text-destructive" /> Block Contact
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {onClearChat && (
                <DropdownMenuItem
                  onClick={() => setConfirmClearOpen(true)}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" /> Clear Chat History
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Blocked Warning Banner */}
      {isBlocked && (
        <div className="bg-destructive/10 border-b border-destructive/20 text-destructive text-xs font-semibold px-4 py-2 flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldOff className="size-4" /> You have blocked this contact. You cannot send or receive messages.
          </span>
        </div>
      )}

      {/* Main Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 bg-background/50">
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading conversation history...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground p-6 space-y-2">
            <p className="text-sm font-semibold text-foreground">No messages yet in this conversation.</p>
            <p className="text-xs max-w-xs">Send a greeting to talk!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const senderKey = getCanonicalUserKey(msg.sender_id);
            const isSelf = senderKey === currentCanonicalKey;
            return (
              <MessageItem
                key={msg.id}
                message={msg}
                isSelf={isSelf}
                isGroup={isGroup}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Message Input Box */}
      <div className="p-3 border-t border-border bg-card/95 backdrop-blur-md shrink-0 z-20">
        <MessageInput onSend={onSendMessage} disabled={isBlocked} />
      </div>

      {/* Clear Chat Confirmation Alert Modal */}
      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Chat History?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear the visible chat history for you in this conversation. Messages will remain saved for other participants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={() => {
                setConfirmClearOpen(false);
                onClearChat?.();
              }}
            >
              Clear Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
