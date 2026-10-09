/**
 * Signaling for MeetSpace.
 *
 * We do not run a bespoke signaling server: Supabase Realtime gives us a
 * per-meeting channel with presence (who is here, and their media state) and
 * broadcast (SDP offers/answers, ICE candidates, host commands). Signaling is
 * deliberately decoupled from the peer-connection code in
 * `src/services/webrtc` so the transport can be swapped for an SFU later.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { ParticipantRole } from "@/types";

export interface PeerPresence {
  peerId: string;
  participantId: string | null;
  userId: string | null;
  displayName: string;
  role: ParticipantRole;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  expiresAt?: string | null;
  durationMinutes?: number;
}

export type SignalMessage =
  | { kind: "offer" | "answer"; to: string; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; to: string; from: string; candidate: RTCIceCandidateInit };

export type HostCommand =
  | { action: "mute"; from: string; target: string }
  | { action: "remove"; from: string; target: string }
  | { action: "end"; from: string }
  | { action: "lock"; from: string; locked: boolean }
  | { action: "admitted"; from: string; target: string }
  | { action: "duration_updated"; from: string; duration_minutes: number; expires_at: string | null }
  | { action: "request_timing"; from: string };

export type SignalingStatus = "connecting" | "connected" | "reconnecting" | "failed";

export interface ChatBroadcast {
  id: string;
  meeting_id: string;
  sender_id: string | null;
  sender_name: string;
  message: string;
  created_at: string;
}

export interface SignalingHandlers {
  onPresence?: (peers: PeerPresence[]) => void;
  onSignal?: (message: SignalMessage) => void;
  onHostCommand?: (command: HostCommand) => void;
  onStatus?: (status: SignalingStatus) => void;
  onChat?: (message: ChatBroadcast) => void;
}

export interface CreateSignalingOptions {
  meetingId: string;
  peerId: string;
  initialPresence: PeerPresence;
  onStatus?: (status: SignalingStatus) => void;
  onPresence?: (peers: PeerPresence[]) => void;
  onSignal?: (message: SignalMessage) => void;
  onHostCommand?: (command: HostCommand) => void;
  onChat?: (message: ChatBroadcast) => void;
}

export interface Signaling {
  channel: RealtimeChannel;
  send: (message: SignalMessage) => void;
  sendHostCommand: (command: HostCommand) => void;
  sendChat: (message: ChatBroadcast) => void;
  updatePresence: (presence: PeerPresence | null) => void;
  sendPresenceBeacon: (presence: PeerPresence) => void;
  close: () => Promise<void>;
}

import { parseMeetingInput } from "@/lib/meeting-id";

export function meetingChannelName(meetingId: string) {
  const normalized = parseMeetingInput(meetingId) || meetingId.trim().toUpperCase();
  return `meeting:${normalized}`;
}

export function createSignaling(
  meetingIdOrOpts: string | CreateSignalingOptions,
  selfArg?: PeerPresence,
  handlersArg?: SignalingHandlers,
): Signaling {
  let meetingId: string;
  let peerId: string;
  let current: PeerPresence;
  let handlers: SignalingHandlers;

  if (typeof meetingIdOrOpts === "object") {
    meetingId = meetingIdOrOpts.meetingId;
    peerId = meetingIdOrOpts.peerId;
    current = meetingIdOrOpts.initialPresence;
    handlers = {
      onPresence: meetingIdOrOpts.onPresence,
      onSignal: meetingIdOrOpts.onSignal,
      onHostCommand: meetingIdOrOpts.onHostCommand,
      onStatus: meetingIdOrOpts.onStatus,
      onChat: meetingIdOrOpts.onChat,
    };
  } else {
    meetingId = meetingIdOrOpts;
    current = selfArg!;
    peerId = selfArg?.peerId || Math.random().toString(36).substring(2);
    handlers = handlersArg || {};
  }

  const channelName = meetingChannelName(meetingId);
  const knownPresenceMap = new Map<string, PeerPresence>();

  if (current && current.peerId) {
    knownPresenceMap.set(current.peerId, current);
  }

  // Clean up any existing channel with the same topic to avoid React StrictMode duplicate subscription errors
  try {
    const existingChannels = supabase.getChannels();
    for (const ch of existingChannels) {
      if (ch.topic === `realtime:${channelName}` || ch.topic === channelName) {
        void supabase.removeChannel(ch);
      }
    }
  } catch {
    /* ignore cleanup errors */
  }

  const channel = supabase.channel(channelName, {
    config: { presence: { key: peerId }, broadcast: { self: false } },
  });

  const emitMergedPresence = () => {
    handlers.onPresence?.(Array.from(knownPresenceMap.values()));
  };

  try {
    channel.on("presence", { event: "sync" }, () => {
      try {
        const state = channel.presenceState<PeerPresence>();
        const peers = Object.values(state)
          .map((entries) => entries[0])
          .filter((p): p is PeerPresence => Boolean(p && p.peerId));

        for (const p of peers) {
          knownPresenceMap.set(p.peerId, p);
        }
        emitMergedPresence();
      } catch (err) {
        console.warn("Presence sync error:", err);
      }
    });

    channel.on("broadcast", { event: "presence_beacon" }, ({ payload }) => {
      const p = payload as PeerPresence;
      if (p && p.peerId) {
        knownPresenceMap.set(p.peerId, p);
        emitMergedPresence();
      }
    });

    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      const message = payload as SignalMessage;
      if (message && message.to === current?.peerId) handlers.onSignal?.(message);
    });

    channel.on("broadcast", { event: "host" }, ({ payload }) => {
      if (payload) handlers.onHostCommand?.(payload as HostCommand);
    });

    channel.on("broadcast", { event: "chat" }, ({ payload }) => {
      if (payload) handlers.onChat?.(payload as ChatBroadcast);
    });
  } catch (err) {
    console.warn("Channel listener attachment error:", err);
  }

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      handlers.onStatus?.("connected");
      if (current) {
        void channel.track(current).catch((err) => console.warn("Track error:", err));
        void channel.send({ type: "broadcast", event: "presence_beacon", payload: current });
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      handlers.onStatus?.("reconnecting");
    } else if (status === "CLOSED") {
      handlers.onStatus?.("failed");
    }
  });

  return {
    channel,
    send: (message) => {
      void channel.send({ type: "broadcast", event: "signal", payload: message });
    },
    sendHostCommand: (command) => {
      void channel.send({ type: "broadcast", event: "host", payload: command });
    },
    sendChat: (message) => {
      void channel.send({ type: "broadcast", event: "chat", payload: message });
    },
    sendPresenceBeacon: (presence) => {
      void channel.send({ type: "broadcast", event: "presence_beacon", payload: presence });
    },
    updatePresence: (presence) => {
      if (presence) {
        current = presence;
        knownPresenceMap.set(presence.peerId, presence);
        emitMergedPresence();
        void channel.track(presence).catch(() => {});
        void channel.send({ type: "broadcast", event: "presence_beacon", payload: presence });
      } else {
        void channel.untrack().catch(() => {});
      }
    },
    close: async () => {
      try {
        await channel.untrack();
      } catch {
        /* ignore */
      }
      await supabase.removeChannel(channel);
    },
  };
}
