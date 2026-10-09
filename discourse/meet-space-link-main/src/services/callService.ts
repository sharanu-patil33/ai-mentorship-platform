import { supabase } from "@/integrations/supabase/client";
import { getCanonicalUserKey, getCanonicalPrivateRoomId, stringToUUID, resolvePublicProfile } from "@/services/chat";
import type { PublicProfile } from "@/types";

export type CallState =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "declined"
  | "busy"
  | "missed"
  | "ended"
  | "failed";

export const CALL_TIMEOUT_MS = 45000; // 45 seconds ringing timeout
export const GLOBAL_CALL_TOPIC = "meetspace_global_calls_v1";

export interface CallSession {
  callId: string;
  meetingId: string;
  callerKey: string;
  recipientKey: string;
  callerProfile: PublicProfile;
  recipientProfile: PublicProfile;
  state: CallState;
  createdAt: number;
}

// Persistent Subscribed Channel Reference for Instant WebSocket Delivery
let subscribedCallChannel: any = null;

export function getSubscribedCallChannel() {
  if (!subscribedCallChannel) {
    subscribedCallChannel = supabase.channel(GLOBAL_CALL_TOPIC, {
      config: { broadcast: { self: true } },
    });
    subscribedCallChannel.subscribe((status: string) => {
      console.log("[CALL CHANNEL STATUS]", status);
    });
  }
  return subscribedCallChannel;
}

/**
 * Dispatch call signal across both WebSocket Realtime AND Browser BroadcastChannel
 */
export function dispatchCallSignal(event: string, payload: any): void {
  // 1. Send via Browser BroadcastChannel (Instant local cross-tab delivery)
  try {
    const bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("meetspace_call_bus") : null;
    bc?.postMessage({ event, payload });
    bc?.close();
  } catch (err) {
    console.warn("Notice sending BroadcastChannel signal:", err);
  }

  // 2. Send via Subscribed Supabase Realtime Channel
  try {
    const channel = getSubscribedCallChannel();
    void channel.send({
      type: "broadcast",
      event,
      payload,
    });
  } catch (err) {
    console.warn("Notice sending Supabase Realtime broadcast:", err);
  }
}

// Sound Synthesizers via Web Audio API
let activeAudioCtx: AudioContext | null = null;
let ringtoneInterval: any = null;

export function stopRingtone(): void {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (activeAudioCtx) {
    try {
      void activeAudioCtx.close();
    } catch {
      // Ignore
    }
    activeAudioCtx = null;
  }
}

/**
 * WhatsApp-style Outgoing Ringing Sound (Dual-tone 440Hz/480Hz pulse)
 */
export function playOutgoingRingtone(): void {
  stopRingtone();
  try {
    const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (!AudioCtx) return;

    activeAudioCtx = new AudioCtx();

    const playPulse = () => {
      if (!activeAudioCtx || activeAudioCtx.state === "closed") return;
      if (activeAudioCtx.state === "suspended") void activeAudioCtx.resume();

      const osc1 = activeAudioCtx.createOscillator();
      const osc2 = activeAudioCtx.createOscillator();
      const gain = activeAudioCtx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(440, activeAudioCtx.currentTime);
      osc2.frequency.setValueAtTime(480, activeAudioCtx.currentTime);

      const now = activeAudioCtx.currentTime;
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(activeAudioCtx.destination);

      osc1.start(now);
      osc1.stop(now + 1.2);
      osc2.start(now);
      osc2.stop(now + 1.2);
    };

    playPulse();
    ringtoneInterval = setInterval(playPulse, 3000);
  } catch (err) {
    console.warn("Notice playing outgoing ringtone:", err);
  }
}

/**
 * WhatsApp-style Incoming Ringtone (Rhythmic 4-note melodic chime)
 */
export function playIncomingRingtone(): void {
  stopRingtone();
  try {
    const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (!AudioCtx) return;

    activeAudioCtx = new AudioCtx();

    const playMelody = () => {
      if (!activeAudioCtx || activeAudioCtx.state === "closed") return;
      if (activeAudioCtx.state === "suspended") void activeAudioCtx.resume();

      const now = activeAudioCtx.currentTime;

      // Notes: E5 (659Hz) -> G5 (784Hz) -> B5 (987Hz) -> E6 (1318Hz)
      const notes = [659.25, 783.99, 987.77, 1318.51];
      notes.forEach((freq, idx) => {
        const osc = activeAudioCtx!.createOscillator();
        const gain = activeAudioCtx!.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.2, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.25);

        osc.connect(gain);
        gain.connect(activeAudioCtx!.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.25);
      });
    };

    playMelody();
    ringtoneInterval = setInterval(playMelody, 2500);
  } catch (err) {
    console.warn("Notice playing incoming ringtone:", err);
  }
}

const activeUsersStore = new Map<string, number>();

export function markUserActive(userKey: string): void {
  const normalized = getCanonicalUserKey(userKey);
  activeUsersStore.set(normalized, Date.now());
}

export function isUserOnline(userKey: string): boolean {
  const normalized = getCanonicalUserKey(userKey);
  const lastSeen = activeUsersStore.get(normalized);
  if (!lastSeen) return true; // Default optimistic
  return Date.now() - lastSeen < 30000;
}

/**
 * System notification fallback helper
 */
export function requestNotificationPermission(): void {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }
}

export function showIncomingCallNotification(callerName: string): void {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        new Notification(callerName, {
          body: "Incoming video call",
          icon: "/favicon.ico",
          tag: "meetspace_incoming_call",
        });
      } catch {
        /* best effort */
      }
    }
  }
}
