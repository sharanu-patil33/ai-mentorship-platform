import { useEffect, useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { CallModal } from "@/components/chat/CallModal";
import {
  playIncomingRingtone,
  stopRingtone,
  markUserActive,
  showIncomingCallNotification,
  CALL_TIMEOUT_MS,
  getSubscribedCallChannel,
  dispatchCallSignal,
} from "@/services/callService";
import {
  getCanonicalUserKey,
  resolvePublicProfile,
  getUserConversations,
  getDirectMessages,
  playChatNotificationSound,
} from "@/services/chat";
import type { PublicProfile } from "@/types";

export function GlobalCallListener() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [callModalMode, setCallModalMode] = useState<"incoming" | "busy" | "no_answer" | "declined" | null>(null);
  const [callTargetProfile, setCallTargetProfile] = useState<PublicProfile | null>(null);
  const [activeCallMeetingCode, setActiveCallMeetingCode] = useState<string | null>(null);

  const timeoutTimerRef = useRef<any>(null);
  const activeMeetingCodeRef = useRef<string | null>(null);
  const callModalModeRef = useRef<any>(null);

  // Message Notification Deduplication Ref: Guarantees EXACTLY ONE toast & sound per message ID!
  const notifiedMsgIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeMeetingCodeRef.current = activeCallMeetingCode;
  }, [activeCallMeetingCode]);

  useEffect(() => {
    callModalModeRef.current = callModalMode;
  }, [callModalMode]);

  // Identity resolution for 100% accurate canonical key matching
  const currentCanonicalKey = getCanonicalUserKey(
    profile || user || (typeof window !== "undefined" ? localStorage.getItem("meetspace_current_user_profile") : null),
  );

  const clearCallTimeout = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!currentCanonicalKey || currentCanonicalKey === "USER_UNKNOWN") return;

    markUserActive(currentCanonicalKey);

    // Engine 1: Browser BroadcastChannel for instant local cross-tab communication
    const bc = typeof window !== "undefined" && "BroadcastChannel" in window
      ? new BroadcastChannel("meetspace_call_bus")
      : null;

    const handleCallSignal = (event: string, payload: any) => {
      const caller_id = getCanonicalUserKey(payload?.caller_id || payload?.callerKey);
      const recipient_id = getCanonicalUserKey(payload?.recipient_id || payload?.recipientKey);

      const isMeRecipient = recipient_id === currentCanonicalKey;
      const isNotMeCaller = caller_id !== currentCanonicalKey;

      // Active Meeting Exemption Guard: If user is currently in a video call, reply with call_busy!
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/meeting/")) {
        if (event === "incoming_call" && isMeRecipient && isNotMeCaller) {
          dispatchCallSignal("call_busy", { caller_id, recipient_id: currentCanonicalKey });
        }
        return;
      }

      if (event === "presence_heartbeat" && payload?.userKey) {
        markUserActive(payload.userKey);
      }

      // Incoming Chat Message Event Handler (Guaranteed EXACTLY ONE toast & sound per message!)
      if (event === "new_message") {
        const msg = payload?.message || payload;
        if (!msg || !msg.id) return;

        // Deduplication Guard: Ignore duplicate triggers for the same message ID
        if (notifiedMsgIdsRef.current.has(msg.id)) return;
        notifiedMsgIdsRef.current.add(msg.id);

        const msgSenderKey = getCanonicalUserKey(msg.sender_id || msg.sender?.id);

        if (msgSenderKey !== currentCanonicalKey) {
          const senderProfile = resolvePublicProfile(msg.sender || msgSenderKey);
          const senderName = senderProfile.name || "Participant";
          const text = msg.text || "Sent a message";

          playChatNotificationSound();
          toast.info(`Message from ${senderName}`, {
            id: `msg_toast_${msg.id}`,
            description: text.length > 60 ? `${text.slice(0, 60)}...` : text,
          });

          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("storage"));
          }
        }
      }

      // Incoming Call Event Handler (Fires ONLY for Recipient)
      if (event === "incoming_call") {
        if (isMeRecipient && isNotMeCaller) {
          const callerProfile = resolvePublicProfile(payload?.callerProfile || caller_id);
          const meetingCode = payload?.meetingCode || payload?.meetingId;

          // Save pre-call route context so recipient returns to their current page upon call end
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              "meetspace_pre_call_route",
              window.location.pathname + window.location.search,
            );
          }

          setCallTargetProfile(callerProfile);
          setActiveCallMeetingCode(meetingCode);
          setCallModalMode("incoming");
          playIncomingRingtone();
          showIncomingCallNotification(callerProfile.name || "MeetSpace");

          // Start 45-second Call Timeout Timer
          clearCallTimeout();
          timeoutTimerRef.current = setTimeout(() => {
            stopRingtone();
            setCallModalMode(null);
          }, CALL_TIMEOUT_MS);
        }
      }

      if (event === "call_accepted") {
        const code = payload?.meetingCode || payload?.meetingId || activeMeetingCodeRef.current;
        clearCallTimeout();
        stopRingtone();
        setCallModalMode(null);

        if (code && (isMeRecipient || caller_id === currentCanonicalKey)) {
          toast.success("✅ Call accepted! Entering video meeting...");
          void navigate({ to: `/meeting/$meetingId`, params: { meetingId: code } });
        }
      }

      if (event === "call_declined" || event === "call_cancelled") {
        if (isMeRecipient || caller_id === currentCanonicalKey) {
          clearCallTimeout();
          stopRingtone();
          setCallModalMode(null);
        }
      }

      if (event === "call_busy") {
        if (caller_id === currentCanonicalKey) {
          clearCallTimeout();
          stopRingtone();
          setCallModalMode("busy");
        }
      }
    };

    if (bc) {
      bc.onmessage = (evt) => {
        if (evt.data?.event) {
          handleCallSignal(evt.data.event, evt.data.payload);
        }
      };
    }

    // Engine 2: Subscribed Supabase Realtime Channel
    const sharedChannel = getSubscribedCallChannel();

    sharedChannel
      .on("broadcast", { event: "new_message" }, (payload: any) => {
        handleCallSignal("new_message", payload.payload);
      })
      .on("broadcast", { event: "incoming_call" }, (payload: any) => {
        handleCallSignal("incoming_call", payload.payload);
      })
      .on("broadcast", { event: "call_accepted" }, (payload: any) => {
        handleCallSignal("call_accepted", payload.payload);
      })
      .on("broadcast", { event: "call_declined" }, (payload: any) => {
        handleCallSignal("call_declined", payload.payload);
      })
      .on("broadcast", { event: "call_cancelled" }, (payload: any) => {
        handleCallSignal("call_cancelled", payload.payload);
      })
      .on("broadcast", { event: "call_busy" }, (payload: any) => {
        handleCallSignal("call_busy", payload.payload);
      })
      .on("broadcast", { event: "presence_heartbeat" }, (payload: any) => {
        handleCallSignal("presence_heartbeat", payload.payload);
      });

    // Engine 3: 1.5-Second Poller Fallback checking for fresh incoming direct call messages
    const pollInterval = setInterval(() => {
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/meeting/")) return;

      void getUserConversations(currentCanonicalKey).then((convos) => {
        for (const convo of convos) {
          if (convo.unread_count && convo.unread_count > 0 && convo.other_member) {
            void getDirectMessages(convo.id, currentCanonicalKey).then((msgs) => {
              const latestMsg = msgs[msgs.length - 1];
              if (
                latestMsg &&
                latestMsg.meeting_id &&
                getCanonicalUserKey(latestMsg.sender_id) !== currentCanonicalKey &&
                !callModalModeRef.current
              ) {
                const diffMs = Date.now() - new Date(latestMsg.created_at).getTime();
                if (diffMs < 12000) {
                  const callerProfile = resolvePublicProfile(convo.other_member);
                  setCallTargetProfile(callerProfile);
                  setActiveCallMeetingCode(latestMsg.meeting_id);
                  setCallModalMode("incoming");
                  playIncomingRingtone();
                }
              }
            });
          }
        }
      });
    }, 1500);

    return () => {
      clearCallTimeout();
      clearInterval(pollInterval);
      if (bc) bc.close();
    };
  }, [currentCanonicalKey, navigate]);

  const handleAcceptCall = () => {
    stopRingtone();
    clearCallTimeout();
    setCallModalMode(null);

    const code = activeCallMeetingCode;
    if (!code) {
      toast.error("Could not find meeting code.");
      return;
    }

    dispatchCallSignal("call_accepted", {
      caller_id: callTargetProfile ? getCanonicalUserKey(callTargetProfile) : null,
      recipient_id: currentCanonicalKey,
      meetingCode: code,
    });

    toast.success("Connecting to meeting room...");
    void navigate({ to: `/meeting/$meetingId`, params: { meetingId: code } });
  };

  const handleDeclineCall = () => {
    stopRingtone();
    clearCallTimeout();
    setCallModalMode(null);

    dispatchCallSignal("call_declined", {
      caller_id: callTargetProfile ? getCanonicalUserKey(callTargetProfile) : null,
      recipient_id: currentCanonicalKey,
    });

    toast.info("Call declined.");
  };

  const handleCloseModal = () => {
    stopRingtone();
    clearCallTimeout();
    setCallModalMode(null);
  };

  if (!callModalMode || !callTargetProfile) return null;

  return (
    <CallModal
      mode={callModalMode}
      targetProfile={callTargetProfile}
      onAccept={handleAcceptCall}
      onDecline={handleDeclineCall}
      onClose={handleCloseModal}
    />
  );
}
