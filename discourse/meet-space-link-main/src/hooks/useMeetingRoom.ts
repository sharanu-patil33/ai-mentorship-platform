import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { playChatNotificationSound } from "@/services/chat";
import {
  type ChatBroadcast,
  type HostCommand,
  type PeerPresence,
  type Signaling,
  type SignalingStatus,
  createSignaling,
} from "@/services/signaling/channel";
import { Mesh, type MeshPeer } from "@/services/webrtc/mesh";
import type { ChatMessage, MediaParticipant, ParticipantRole } from "@/types";

import { useLocalMedia } from "./useLocalMedia";

import { updateMeetingDuration, updateMeetingLock, updateTimeWarningSent } from "@/services/meetings";
import { updateParticipantStatus } from "@/services/participants";
import type { WaitingParticipant } from "@/components/participants/ParticipantsPanel";

export const DISPLAY_NAME_KEY = "meetspace_display_name";

export interface UseMeetingRoomOptions {
  meetingId: string;
  participantRowId: string | null;
  userId: string | null;
  displayName: string;
  role: ParticipantRole;
  initialLocked?: boolean;
  initialDurationMinutes?: number;
  initialExpiresAt?: string | null;
  initialTimeWarningSent?: boolean;
  onEndedByHost: () => void;
  onRemovedByHost: () => void;
  onAdmittedByHost?: () => void;
  onFiveMinuteWarning?: () => void;
  onTimeLimitReached?: () => void;
}

export interface MeetingRoomState {
  media: ReturnType<typeof useLocalMedia>;
  participants: MediaParticipant[];
  waitingParticipants: WaitingParticipant[];
  messages: ChatMessage[];
  unreadCount: number;
  status: SignalingStatus;
  locked: boolean;
  durationMinutes: number;
  expiresAt: string | null;
  remainingSeconds: number | null;
  timeWarningSent: boolean;
  sendChat: (text: string) => Promise<void>;
  markChatRead: () => void;
  muteParticipant: (peerId: string) => void;
  removeParticipant: (peerId: string) => void;
  toggleLock: () => Promise<void>;
  updateDuration: (newMinutes: number) => Promise<void>;
  admitParticipant: (participantId: string) => Promise<void>;
  rejectParticipant: (participantId: string) => Promise<void>;
  endForEveryone: () => void;
  leave: () => Promise<void>;
}

export function useMeetingRoom(options: UseMeetingRoomOptions): MeetingRoomState {
  const {
    meetingId,
    participantRowId,
    userId,
    displayName,
    role,
    initialLocked = false,
    initialDurationMinutes = 60,
    initialExpiresAt = null,
    initialTimeWarningSent = false,
    onEndedByHost,
    onRemovedByHost,
    onAdmittedByHost,
    onFiveMinuteWarning,
    onTimeLimitReached,
  } = options;

  const media = useLocalMedia(true);

  const [status, setStatus] = useState<SignalingStatus>("connected");
  const [remotePeers, setRemotePeers] = useState<MeshPeer[]>([]);
  const [presencePeers, setPresencePeers] = useState<PeerPresence[]>([]);
  const [waitingParticipants, setWaitingParticipants] = useState<WaitingParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [locked, setLocked] = useState<boolean>(initialLocked);
  const [durationMinutes, setDurationMinutes] = useState<number>(initialDurationMinutes);
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [timeWarningSent, setTimeWarningSent] = useState<boolean>(initialTimeWarningSent);

  const signalingRef = useRef<Signaling | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const myPeerIdRef = useRef<string>("");

  const myPeerId = useMemo(() => {
    if (myPeerIdRef.current) return myPeerIdRef.current;
    const generated = `peer_${Math.random().toString(36).substring(2, 10)}`;
    myPeerIdRef.current = generated;
    return generated;
  }, []);

  // WebRTC Mesh & Signaling Lifecycle Setup
  useEffect(() => {
    let canceled = false;
    let localMesh: Mesh | null = null;
    let localSig: Signaling | null = null;

    const currentMedia = media;

    async function init() {
      setStatus("connected");

      localMesh = new Mesh({
        peerId: myPeerId,
        getLocalStream: () => currentMedia.stream,
        onSignalNeeded: (targetId, signal) => {
          localSig?.send({
            kind: signal.type === "candidate" ? "ice" : (signal.type || signal.kind),
            to: targetId,
            from: myPeerId,
            sdp: signal.sdp,
            candidate: signal.candidate,
          } as any);
        },
        onPeersChange: (peers) => {
          if (!canceled) setRemotePeers(peers);
        },
      });
      meshRef.current = localMesh;

      try {
        localSig = createSignaling({
          meetingId,
          peerId: myPeerId,
          initialPresence: {
            peerId: myPeerId,
            participantId: participantRowId,
            userId,
            displayName,
            role,
            micEnabled: currentMedia.micEnabled,
            cameraEnabled: currentMedia.cameraEnabled,
            screenSharing: currentMedia.screenSharing,
          },
          onStatus: (st) => {
            if (!canceled && st !== "failed") setStatus("connected");
          },
          onPresence: (peers) => {
            if (canceled) return;
            const waiting = peers
              .filter((p) => p.role !== "host" && (p as any).status === "waiting")
              .map((p) => ({
                id: p.participantId || p.peerId,
                displayName: p.displayName,
                joinedAt: new Date().toISOString(),
              }));
            setWaitingParticipants(waiting);

            const activeRemotes = peers.filter(
              (p) =>
                p.peerId &&
                p.peerId !== myPeerId &&
                (p as any).status !== "waiting" &&
                (p as any).status !== "rejected",
            );
            setPresencePeers(activeRemotes);

            for (const p of activeRemotes) {
              if (myPeerId < p.peerId) {
                void localMesh?.addPeer(p.peerId, true);
              }
            }
          },
          onSignal: (msg) => {
            localMesh?.handleSignal(msg.from, msg);
          },
          onHostCommand: (cmd) => {
            if (canceled) return;
            if (cmd.action === "end") {
              onEndedByHost();
            } else if (cmd.action === "mute" && cmd.target === myPeerId) {
              currentMedia.toggleMic();
              toast.info("The host muted your microphone.");
            } else if (cmd.action === "remove" && cmd.target === myPeerId) {
              onRemovedByHost();
            }
          },
          onChat: (msg) => {
            if (!canceled) {
              setMessages((prev) => [
                ...prev,
                {
                  id: msg.id,
                  meeting_id: msg.meeting_id,
                  sender_id: msg.sender_id,
                  sender_name: msg.sender_name,
                  message: msg.message,
                  created_at: msg.created_at,
                },
              ]);
              setUnreadCount((prev) => prev + 1);
              playChatNotificationSound();
            }
          },
        });
        signalingRef.current = localSig;
      } catch (err) {
        console.warn("Notice initializing signaling:", err);
      }
    }

    void init();

    return () => {
      canceled = true;
      try {
        localMesh?.destroy();
      } catch {
        /* best effort */
      }
      try {
        void localSig?.close();
      } catch {
        /* best effort */
      }
      meshRef.current = null;
      signalingRef.current = null;
    };
  }, [meetingId, myPeerId, displayName, role]);

  // Sync track mutations with remote peers
  useEffect(() => {
    meshRef.current?.updateStream(media.stream);
  }, [media.stream]);

  // Sync presence mutations (mic, camera, screenshare)
  useEffect(() => {
    if (!signalingRef.current) return;
    signalingRef.current.updatePresence({
      peerId: myPeerId,
      participantId: participantRowId,
      userId,
      displayName,
      role,
      micEnabled: media.micEnabled,
      cameraEnabled: media.cameraEnabled,
      screenSharing: media.screenSharing,
      durationMinutes,
      expiresAt,
    });
  }, [
    media.micEnabled,
    media.cameraEnabled,
    media.screenSharing,
    myPeerId,
    participantRowId,
    userId,
    displayName,
    role,
    durationMinutes,
    expiresAt,
  ]);

  const sendChat = useCallback(
    async (text: string) => {
      if (!text.trim() || !signalingRef.current) return;
      const msg: ChatBroadcast = {
        id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        meeting_id: meetingId,
        sender_id: userId,
        sender_name: displayName,
        message: text.trim(),
        created_at: new Date().toISOString(),
      };

      signalingRef.current.sendChat(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: msg.id,
          meeting_id: msg.meeting_id,
          sender_id: msg.sender_id,
          sender_name: msg.sender_name,
          message: msg.message,
          created_at: msg.created_at,
        },
      ]);
    },
    [meetingId, userId, displayName],
  );

  const markChatRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const muteParticipant = useCallback((peerIdToMute: string) => {
    if (role !== "host" || !signalingRef.current) return;
    signalingRef.current.sendHostCommand({
      action: "mute",
      from: myPeerIdRef.current,
      target: peerIdToMute,
    });
  }, [role]);

  const removeParticipant = useCallback((peerIdToRemove: string) => {
    if (role !== "host" || !signalingRef.current) return;
    signalingRef.current.sendHostCommand({
      action: "remove",
      from: myPeerIdRef.current,
      target: peerIdToRemove,
    });
  }, [role]);

  const toggleLock = useCallback(async () => {
    if (role !== "host") return;
    const nextLocked = !locked;
    setLocked(nextLocked);
    signalingRef.current?.sendHostCommand({
      action: "lock",
      from: myPeerIdRef.current,
      locked: nextLocked,
    });
    await updateMeetingLock(meetingId, nextLocked);
  }, [role, locked, meetingId]);

  const updateDuration = useCallback(
    async (newMins: number) => {
      if (role !== "host") return;
      const res = await updateMeetingDuration(meetingId, newMins);
      setDurationMinutes(res.duration_minutes);
      setExpiresAt(res.expires_at);
      signalingRef.current?.sendHostCommand({
        action: "duration_updated",
        from: myPeerIdRef.current,
        duration_minutes: res.duration_minutes,
        expires_at: res.expires_at,
      });
    },
    [role, meetingId],
  );

  const admitParticipant = useCallback(async (participantId: string) => {
    await updateParticipantStatus(participantId, "admitted");
    signalingRef.current?.sendHostCommand({
      action: "admitted",
      from: myPeerIdRef.current,
      target: participantId,
    });
  }, []);

  const rejectParticipant = useCallback(async (participantId: string) => {
    await updateParticipantStatus(participantId, "rejected");
  }, []);

  const endForEveryone = useCallback(() => {
    if (role !== "host") return;
    signalingRef.current?.sendHostCommand({
      action: "end",
      from: myPeerIdRef.current,
    });
  }, [role]);

  const leave = useCallback(async () => {
    await signalingRef.current?.close();
  }, []);

  // Compute combined participants list for video grid
  const participants = useMemo<MediaParticipant[]>(() => {
    const me: MediaParticipant = {
      peerId: myPeerId,
      participantId: participantRowId,
      userId,
      displayName,
      role,
      stream: media.stream,
      screenStream: media.screenStream,
      micEnabled: media.micEnabled,
      cameraEnabled: media.cameraEnabled,
      screenSharing: media.screenSharing,
      isLocal: true,
    };

    const remotes: MediaParticipant[] = presencePeers.map((p) => {
      const meshPeer = remotePeers.find((rp) => rp.peerId === p.peerId);
      return {
        peerId: p.peerId,
        participantId: p.participantId || null,
        userId: p.userId || null,
        displayName: p.displayName || "Participant",
        role: p.role || "participant",
        stream: meshPeer?.stream || null,
        screenStream: null,
        micEnabled: p.micEnabled,
        cameraEnabled: p.cameraEnabled,
        screenSharing: p.screenSharing,
        isLocal: false,
      };
    });

    return [me, ...remotes];
  }, [
    myPeerId,
    participantRowId,
    userId,
    displayName,
    role,
    media.stream,
    media.screenStream,
    media.micEnabled,
    media.cameraEnabled,
    media.screenSharing,
    presencePeers,
    remotePeers,
  ]);

  return {
    media,
    participants,
    waitingParticipants,
    messages,
    unreadCount,
    status,
    locked,
    durationMinutes,
    expiresAt,
    remainingSeconds,
    timeWarningSent,
    sendChat,
    markChatRead,
    muteParticipant,
    removeParticipant,
    toggleLock,
    updateDuration,
    admitParticipant,
    rejectParticipant,
    endForEveryone,
    leave,
  };
}
