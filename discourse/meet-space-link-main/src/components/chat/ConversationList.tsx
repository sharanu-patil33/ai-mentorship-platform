import { useState } from "react";
import { Search, UserPlus, Users, MessageSquare, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatConversation } from "@/types";
import { initialsOf } from "@/components/navigation/AppHeader";
import { resolvePublicProfile, getCanonicalPrivateRoomId, getEquivalentConvoKeys } from "@/services/chat";

interface ConversationListProps {
  conversations: ChatConversation[];
  activeId?: string;
  activeConversationId?: string;
  onSelect?: (convo: ChatConversation) => void;
  onSelectConversation?: (convo: ChatConversation) => void;
  onNewChat?: () => void;
  onOpenSearch?: () => void;
  onOpenCreateGroup?: () => void;
  onClearAllHistory?: () => void;
  loading?: boolean;
}

export function ConversationList({
  conversations,
  activeId,
  activeConversationId,
  onSelect,
  onSelectConversation,
  onNewChat,
  onOpenSearch,
  onOpenCreateGroup,
  onClearAllHistory,
  loading,
}: ConversationListProps) {
  const [filter, setFilter] = useState<"all" | "direct" | "groups">("all");
  const [search, setSearch] = useState("");

  const selectedId = activeId || activeConversationId;
  const selectFn = onSelect || onSelectConversation;
  const searchFn = onNewChat || onOpenSearch;

  const selectedKeys = selectedId ? getEquivalentConvoKeys(selectedId) : new Set<string>();

  const filtered = conversations.filter((c) => {
    if (filter === "direct" && c.type !== "private") return false;
    if (filter === "groups" && c.type !== "group") return false;

    if (!search.trim()) return true;
    const profile = c.type === "private" ? resolvePublicProfile(c.other_member || c.id) : null;
    const name = c.type === "group" ? c.name : profile?.name;
    const username = profile?.username;
    const q = search.toLowerCase();
    return name?.toLowerCase().includes(q) || username?.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full bg-card border-r border-border w-full shrink-0">
      {/* Header Bar */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground font-display flex items-center gap-2">
            <MessageSquare className="size-5 text-brand" /> Conversations
          </h2>
          <div className="flex items-center gap-1">
            {searchFn && (
              <Button size="icon" variant="ghost" className="size-8 text-brand cursor-pointer" title="Find Person by Username/ID" onClick={searchFn}>
                <UserPlus className="size-4" />
              </Button>
            )}
            {onOpenCreateGroup && (
              <Button size="icon" variant="ghost" className="size-8 text-brand cursor-pointer" title="Create Group Room" onClick={onOpenCreateGroup}>
                <Users className="size-4" />
              </Button>
            )}
            {onClearAllHistory && (
              <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive/10 cursor-pointer" title="Clear All Chat History" onClick={onClearAllHistory}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1 pt-1">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer ${
              filter === "all" ? "bg-brand-soft text-brand-dark" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("direct")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer ${
              filter === "direct" ? "bg-brand-soft text-brand-dark" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            Direct
          </button>
          <button
            onClick={() => setFilter("groups")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer ${
              filter === "groups" ? "bg-brand-soft text-brand-dark" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            Groups
          </button>
        </div>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Loading conversations...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
            <p>No conversations yet.</p>
            <p className="opacity-80">Click <strong>+</strong> above to find members and start a chat!</p>
          </div>
        ) : (
          filtered.map((convo) => {
            const isSelected = selectedId ? selectedKeys.has(convo.id) : false;
            const isGroup = convo.type === "group";
            const profile = isGroup ? null : resolvePublicProfile(convo.other_member || convo.id);
            const title = isGroup ? convo.name || "Group Room" : profile?.name || "Private Chat";
            
            let lastText = convo.last_message?.text || (typeof convo.last_message === "string" ? convo.last_message : "No messages yet");
            if (!isGroup && (lastText.includes("Video meeting") || lastText.includes("Video call") || lastText.includes("🎥"))) {
              lastText = "🎥 Meeting";
            }

            // An active/selected conversation is currently being read, so unread count MUST be 0!
            const unreadNum = isSelected ? 0 : (convo.unread_count || 0);
            const hasUnread = unreadNum > 0;

            return (
              <button
                key={convo.id}
                onClick={() => selectFn?.(convo)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left relative cursor-pointer ${
                  isSelected ? "bg-brand-soft/70 border border-brand/20 shadow-xs" : "hover:bg-accent/60"
                }`}
              >
                <div className="relative shrink-0">
                  <Avatar className="size-10">
                    {convo.avatar_url || profile?.avatar_url ? (
                      <AvatarImage src={convo.avatar_url || profile?.avatar_url || ""} />
                    ) : null}
                    <AvatarFallback className="bg-brand-soft text-xs font-bold text-brand-dark">
                      {isGroup ? <Users className="size-4" /> : initialsOf(title)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Online / Active status green dot */}
                  {!isGroup && (
                    <span className="absolute bottom-0 right-0 size-3 rounded-full bg-emerald-500 border-2 border-card" />
                  )}

                  {/* Glowing Red Unread Alert Dot on Top Right of Avatar */}
                  {hasUnread && (
                    <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-emerald-500 border-2 border-card animate-pulse shadow-md" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-sm truncate ${hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground/90"}`}>
                      {title}
                    </p>
                    {convo.last_message?.created_at && (
                      <span className={`text-[10px] shrink-0 ${hasUnread ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {new Date(convo.last_message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className={`text-xs truncate ${hasUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {lastText}
                    </p>
                    
                    {/* WhatsApp-Style Green Unread Badge Pill */}
                    {hasUnread ? (
                      <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 animate-pulse shadow-xs">
                        {unreadNum}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
