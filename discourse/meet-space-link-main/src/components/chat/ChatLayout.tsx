import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./ConversationList";
import { ChatArea } from "./ChatArea";
import { UserSearchModal } from "./UserSearchModal";
import { CreateGroupModal } from "./CreateGroupModal";
import { CallModal } from "./CallModal";
import {
  getUserConversations,
  getOrCreatePrivateConversation,
  getDirectMessages,
  sendMessage,
  getCanonicalUserKey,
  getCanonicalPrivateRoomId,
  getEquivalentConvoKeys,
  resolvePublicProfile,
  markConversationAsRead,
  markLocalMessagesAsRead,
  clearConversationForUser,
  blockUser,
  unblockUser,
  isUserBlocked,
  playChatNotificationSound,
  unlockAudioContext,
  cacheProfile,
  stringToUUID,
} from "@/services/chat";
import { startMeetingFromChat } from "@/services/chatMeetings";
import {
  playOutgoingRingtone,
  stopRingtone,
  markUserActive,
  CALL_TIMEOUT_MS,
  dispatchCallSignal,
  getSubscribedCallChannel,
} from "@/services/callService";
import { supabase } from "@/integrations/supabase/client";
import type { ChatConversation, DirectMessage, PublicProfile } from "@/types";

interface ChatLayoutProps {
  currentUserId: string;
  initialConversationId?: string;
}

export function ChatLayout({ currentUserId, initialConversationId }: ChatLayoutProps) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);

  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [isInitiatingCall, setIsInitiatingCall] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  // Real-Time Call Modal States
  const [callModalMode, setCallModalMode] = useState<"outgoing" | "incoming" | "inactive" | "busy" | "no_answer" | "declined" | null>(null);
  const [callTargetProfile, setCallTargetProfile] = useState<PublicProfile | null>(null);
  const [activeCallMeetingCode, setActiveCallMeetingCode] = useState<string | null>(null);

  const currentCanonicalKey = getCanonicalUserKey(currentUserId);
  const callTimeoutRef = useRef<any>(null);

  // Ref to hold active conversation state for zero-stale closure event handlers
  const activeConvoRef = useRef<ChatConversation | null>(null);
  useEffect(() => {
    activeConvoRef.current = activeConvo;
  }, [activeConvo]);

  const clearCallTimeout = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  };

  // Unlock AudioContext on first user interaction so notification sound plays 100% of the time!
  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockAudioContext();
      window.removeEventListener("click", handleFirstInteraction);
    };
    window.addEventListener("click", handleFirstInteraction);
    return () => window.removeEventListener("click", handleFirstInteraction);
  }, []);

  // Heartbeat presence emitter (marks user active online)
  useEffect(() => {
    if (!currentUserId) return;
    markUserActive(currentCanonicalKey);

    const interval = setInterval(() => {
      markUserActive(currentCanonicalKey);
    }, 10000);

    return () => clearInterval(interval);
  }, [currentUserId, currentCanonicalKey]);

  // Smart ESC Key Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.code === "Escape") {
        if (callModalMode) {
          clearCallTimeout();
          stopRingtone();
          setCallModalMode(null);
          return;
        }
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        if (createGroupOpen) {
          setCreateGroupOpen(false);
          return;
        }
        if (activeConvoRef.current) {
          setActiveConvo(null);
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, createGroupOpen, callModalMode]);

  // Fetch user conversations
  const loadConversations = useCallback(async () => {
    try {
      const data = await getUserConversations(currentUserId);
      setConversations(data);

      if (initialConversationId) {
        const found = data.find((c) => c.id === initialConversationId);
        if (found) {
          setActiveConvo({ ...found, unread_count: 0 });
          void markConversationAsRead(found.id, currentUserId);
        }
      }
    } catch (err) {
      console.error("Failed loading conversations:", err);
    } finally {
      setLoadingConvos(false);
    }
  }, [currentUserId, initialConversationId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Fetch messages for active conversation
  const loadMessages = useCallback(
    async (convoId: string) => {
      setLoadingMsgs(true);
      try {
        const msgs = await getDirectMessages(convoId, currentUserId);
        setMessages(msgs);
      } catch (err) {
        console.error("Failed loading messages:", err);
      } finally {
        setLoadingMsgs(false);
      }
    },
    [currentUserId],
  );

  useEffect(() => {
    if (activeConvo) {
      void loadMessages(activeConvo.id);
    }
  }, [activeConvo, loadMessages]);

  // Select conversation handler: INSTANT 0ms UI SWITCH!
  const handleSelectConversation = useCallback(
    async (convo: ChatConversation) => {
      // 1. INSTANTLY open the chat window UI (0ms delay!)
      const initialConvo: ChatConversation = {
        ...convo,
        unread_count: 0,
        other_member: convo.other_member || resolvePublicProfile(convo.other_member || convo.id),
      };
      setActiveConvo(initialConvo);

      // 2. INSTANTLY update sidebar conversation list (0ms delay!)
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === initialConvo.id);
        if (exists) {
          return prev.map((c) => (c.id === initialConvo.id ? { ...c, unread_count: 0, other_member: initialConvo.other_member || c.other_member } : c));
        }
        return [initialConvo, ...prev];
      });

      // 3. Flush previous messages state
      setMessages([]);

      // 4. Background profile resolution & message loading (does not block UI!)
      let otherMember: PublicProfile | null = initialConvo.other_member;

      if (convo.type === "private" && (!otherMember || !otherMember.name || otherMember.name === "User")) {
        try {
          const { data: memberRows } = await supabase
            .from("chat_members" as any)
            .select("user_id")
            .eq("conversation_id", convo.id)
            .neq("user_id", currentUserId);

          const otherUserId = memberRows?.[0]?.user_id;
          if (otherUserId) {
            const { data: p } = await supabase
              .from("profiles")
              .select("id, name, username, public_user_id, avatar_url, bio, status")
              .eq("id", otherUserId)
              .maybeSingle();

            if (p) {
              otherMember = {
                id: p.id,
                name: p.name || "User",
                username: p.username || "@user",
                public_user_id: p.public_user_id || "MS-USER",
                avatar_url: p.avatar_url || null,
                bio: p.bio || "Hey there! I am using MeetSpace.",
                status: p.status || "offline",
              };
              cacheProfile(otherMember);
              setActiveConvo((prev) => (prev && prev.id === convo.id ? { ...prev, other_member: otherMember } : prev));
            }
          }
        } catch (e) {
          console.warn("Notice resolving other member profile:", e);
        }
      }

      void markConversationAsRead(convo.id, currentUserId);
      void loadMessages(convo.id);

      // Broadcast blue ticks read receipt to the sender over BroadcastChannel + Supabase Realtime!
      try {
        const msgBc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("meetspace_msg_bus") : null;
        msgBc?.postMessage({ type: "read_receipt", event: "read_receipt", conversationId: convo.id, readerId: currentUserId });
        msgBc?.close();

        dispatchCallSignal("read_receipt", { conversationId: convo.id, readerId: currentUserId });
      } catch {
        /* best effort */
      }
    },
    [currentUserId, loadMessages],
  );

  // Clear chat handler for active conversation
  const handleClearChat = useCallback(async () => {
    if (!activeConvo) return;
    clearConversationForUser(activeConvo.id, currentUserId);
    setMessages([]);
    toast.success("🧹 Chat history cleared for your view.");
    await loadConversations();
  }, [activeConvo, currentUserId, loadConversations]);

  // Toggle block/unblock handler
  const handleToggleBlock = useCallback(async () => {
    if (!activeConvo || !activeConvo.other_member) return;
    const targetKey = getCanonicalUserKey(activeConvo.other_member);

    if (isUserBlocked(currentUserId, targetKey)) {
      unblockUser(currentUserId, targetKey);
      setActiveConvo((prev) => (prev ? { ...prev, is_blocked: false } : null));
      toast.success(`✅ ${activeConvo.other_member.name} has been unblocked.`);
    } else {
      blockUser(currentUserId, targetKey);
      setActiveConvo((prev) => (prev ? { ...prev, is_blocked: true } : null));
      toast.error(`🚫 ${activeConvo.other_member.name} has been blocked.`);
    }

    await loadConversations();
  }, [activeConvo, currentUserId, loadConversations]);

  // Zero-Stale-Closure Incoming Message Handler
  const handleGlobalIncomingMessage = useCallback(
    (msg: DirectMessage) => {
      const senderKey = getCanonicalUserKey(msg.sender_id);
      const isFromMe = senderKey === currentCanonicalKey;

      if (isUserBlocked(currentUserId, senderKey)) {
        return;
      }

      const currentActive = activeConvoRef.current;
      if (currentActive) {
        const activeConvoKeys = getEquivalentConvoKeys(currentActive.id);
        const isCurrentRoom =
          activeConvoKeys.has(msg.conversation_id) ||
          (currentActive.other_member && getCanonicalUserKey(currentActive.other_member) === senderKey);

        if (isCurrentRoom) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });

          if (!isFromMe) {
            playChatNotificationSound();
            void markConversationAsRead(currentActive.id, currentUserId);
          }
        }
      }

      void loadConversations();
    },
    [currentUserId, currentCanonicalKey, loadConversations],
  );

  // Read receipt event handler (Turns sent message checkmarks CYAN BLUE in real-time)
  const handleReadReceipt = useCallback(
    (conversationId: string) => {
      const currentActive = activeConvoRef.current;
      if (!currentActive) return;

      const activeConvoKeys = getEquivalentConvoKeys(currentActive.id);
      const incomingKeys = getEquivalentConvoKeys(conversationId);

      let isMatch = false;
      for (const k of incomingKeys) {
        if (activeConvoKeys.has(k)) {
          isMatch = true;
          break;
        }
      }

      if (isMatch) {
        const now = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) => (!m.read_at ? { ...m, read_at: now } : m)),
        );
      }
    },
    [],
  );

  // Subscribe to real-time chat messages & read receipts via Supabase + BroadcastChannel + Fast Poller
  useEffect(() => {
    if (!currentUserId) return;

    // Engine 1: Browser Cross-Tab BroadcastChannel
    const bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("meetspace_msg_bus") : null;
    if (bc) {
      bc.onmessage = (event) => {
        if (event.data?.type === "direct_message" && event.data?.message) {
          handleGlobalIncomingMessage(event.data.message);
        }
        const rId = event.data?.conversationId || event.data?.payload?.conversationId;
        if ((event.data?.type === "read_receipt" || event.data?.event === "read_receipt") && rId) {
          handleReadReceipt(rId);
        }
      };
    }

    // Engine 2: Subscribed Supabase Realtime Channel for direct DB changes & broadcasts
    const channel = supabase
      .channel(`global_messages:${currentCanonicalKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          if (newMsg) {
            handleGlobalIncomingMessage(newMsg);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        (payload) => {
          const updatedMsg = payload.new as DirectMessage;
          if (updatedMsg && updatedMsg.read_at) {
            handleReadReceipt(updatedMsg.conversation_id);
          }
        },
      )
      .subscribe();

    const sharedCallChannel = getSubscribedCallChannel();
    sharedCallChannel.on("broadcast", { event: "read_receipt" }, (payload: any) => {
      const rId = payload?.payload?.conversationId || payload?.conversationId;
      if (rId) {
        handleReadReceipt(rId);
      }
    });

    // Engine 3: 2-Second Active Conversation Sync Poller
    const syncInterval = setInterval(() => {
      const currentActive = activeConvoRef.current;
      if (currentActive) {
        void getDirectMessages(currentActive.id, currentUserId).then((freshMsgs) => {
          if (freshMsgs && freshMsgs.length > 0) {
            setMessages((prev) => {
              if (freshMsgs.length !== prev.length || freshMsgs[freshMsgs.length - 1]?.id !== prev[prev.length - 1]?.id) {
                return freshMsgs;
              }
              // Update read_at blue ticks if recipient marked read
              const hasReadChange = freshMsgs.some((fm, idx) => prev[idx] && fm.read_at !== prev[idx].read_at);
              if (hasReadChange) return freshMsgs;
              return prev;
            });
          }
        });
      }
      void loadConversations();
    }, 2000);

    return () => {
      bc?.close();
      clearInterval(syncInterval);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, currentCanonicalKey, handleGlobalIncomingMessage, handleReadReceipt, loadConversations]);

  // Handle Send Direct Message
  const handleSendMessage = useCallback(
    async (text: string, mediaUrl?: string) => {
      if (!activeConvo) return;

      try {
        const msg = await sendMessage({
          conversationId: activeConvo.id,
          senderId: currentUserId,
          text,
          mediaUrl,
        });

        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // Broadcast to other tabs / users
        try {
          const bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("meetspace_msg_bus") : null;
          bc?.postMessage({ type: "direct_message", message: msg });
          bc?.close();
        } catch {
          /* best effort */
        }

        try {
          await loadConversations();
        } catch {
          /* best effort */
        }
      } catch (err) {
        console.error("Error sending message:", err);
        toast.error(err instanceof Error ? err.message : "Failed to send message");
      }
    },
    [activeConvo, currentUserId, loadConversations],
  );

  // Start Meeting Handler
  const handleStartCall = useCallback(async () => {
    if (!activeConvo || !activeConvo.other_member || isInitiatingCall) return;

    const recipientProfile = activeConvo.other_member;
    const recipientKey = getCanonicalUserKey(recipientProfile);

    if (recipientKey === currentCanonicalKey) {
      toast.error("You cannot start a meeting with yourself.");
      return;
    }

    setIsInitiatingCall(true);
    setCallTargetProfile(recipientProfile);
    setCallModalMode("outgoing");

    try {
      playOutgoingRingtone();

      const meeting = await startMeetingFromChat(
        activeConvo.id,
        currentUserId,
        `Meeting with ${recipientProfile.name}`,
        "ongoing",
      );

      const meetingCode = meeting.meeting_id || meeting.id;
      setActiveCallMeetingCode(meetingCode);

      // Signal target recipient via Realtime Websockets & BroadcastChannel
      dispatchCallSignal("incoming_call", {
        caller_id: currentCanonicalKey,
        recipient_id: recipientKey,
        callerProfile: resolvePublicProfile(currentUserId),
        meetingCode,
        meetingId: meetingCode,
        conversationId: activeConvo.id,
      });

      // 45-Second Call Timeout Guard
      callTimeoutRef.current = setTimeout(() => {
        stopRingtone();
        setCallModalMode("no_answer");

        dispatchCallSignal("call_timeout", {
          caller_id: currentCanonicalKey,
          recipient_id: recipientKey,
          meetingCode,
        });
      }, CALL_TIMEOUT_MS);
    } catch (err) {
      stopRingtone();
      setCallModalMode(null);
      toast.error("Could not start meeting. Please try again.");
    } finally {
      setIsInitiatingCall(false);
    }
  }, [activeConvo, currentCanonicalKey, currentUserId, isInitiatingCall]);

  const handleCancelCall = useCallback(() => {
    clearCallTimeout();
    stopRingtone();
    setCallModalMode(null);

    if (activeConvo?.other_member && activeCallMeetingCode) {
      const recipientKey = getCanonicalUserKey(activeConvo.other_member);
      dispatchCallSignal("call_cancelled", {
        caller_id: currentCanonicalKey,
        recipient_id: recipientKey,
        meetingCode: activeCallMeetingCode,
      });
    }
  }, [activeCallMeetingCode, activeConvo, currentCanonicalKey]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Sidebar Conversation List */}
      <div className={`${activeConvo ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 flex-col border-r border-border shrink-0`}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-xl font-bold font-display text-foreground flex items-center gap-2">
            <Sparkles className="size-5 text-brand" /> Chats
          </h1>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCreateGroupOpen(true)}
              title="New Group Chat"
              className="cursor-pointer"
            >
              <Users className="size-5" />
            </Button>
          </div>
        </div>

        <ConversationList
          conversations={conversations}
          activeId={activeConvo?.id}
          onSelect={handleSelectConversation}
          onNewChat={() => setSearchOpen(true)}
          loading={loadingConvos}
        />
      </div>

      {/* Main Chat Area */}
      <div className={`${activeConvo ? "flex" : "hidden md:flex"} flex-1 flex-col overflow-hidden`}>
        {activeConvo ? (
          <ChatArea
            conversation={activeConvo}
            messages={messages}
            currentUserId={currentUserId}
            onSendMessage={handleSendMessage}
            onClearChat={handleClearChat}
            onToggleBlock={handleToggleBlock}
            onBack={() => setActiveConvo(null)}
            loading={loadingMsgs}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-3">
            <Sparkles className="size-12 text-brand/50 animate-bounce" />
            <h3 className="text-lg font-bold text-foreground">Select a conversation</h3>
            <p className="text-sm max-w-sm">Choose a contact from the sidebar or click New Chat to start messaging.</p>
          </div>
        )}
      </div>

      {/* Real-Time Call Modal */}
      {callModalMode && callTargetProfile && (
        <CallModal
          mode={callModalMode}
          targetProfile={callTargetProfile}
          onCancel={handleCancelCall}
          onClose={() => {
            clearCallTimeout();
            stopRingtone();
            setCallModalMode(null);
          }}
        />
      )}

      {/* Search User Modal */}
      <UserSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentUserId={currentUserId}
        onSelectUser={(profile) => {
          setSearchOpen(false);
          if (!profile) return;
          cacheProfile(profile);

          const targetId = profile.id || profile.public_user_id || "user";
          const fallbackId = stringToUUID(getCanonicalPrivateRoomId(currentUserId, targetId));
          const immediateConvo: ChatConversation = {
            id: fallbackId,
            type: "private",
            name: profile.name || profile.public_user_id || "User",
            description: null,
            avatar_url: profile.avatar_url || null,
            created_by: currentUserId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            other_member: profile,
            last_message: null,
            unread_count: 0,
          };

          // 1. INSTANT 0ms synchronous UI switch to open chat window!
          void handleSelectConversation(immediateConvo);

          // 2. Background DB conversation link (does not block UI!)
          void getOrCreatePrivateConversation(currentUserId, targetId)
            .then((convo) => {
              if (convo && convo.id && convo.id !== fallbackId) {
                convo.other_member = profile;
                convo.name = profile.name || convo.name;
                void handleSelectConversation(convo);
              }
            })
            .catch((err) => {
              console.warn("Notice background conversation link:", err);
            });
        }}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        currentUserId={currentUserId}
        onCreated={async (convoId) => {
          setCreateGroupOpen(false);
          await loadConversations();
          const data = await getUserConversations(currentUserId);
          const found = data.find((c) => c.id === convoId);
          if (found) await handleSelectConversation(found);
        }}
      />
    </div>
  );
}
