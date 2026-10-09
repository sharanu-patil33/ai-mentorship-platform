import { parseMeetingInput } from "@/lib/meeting-id";
import { supabase } from "@/integrations/supabase/client";
import { stringToUUID } from "@/services/chat";
import type { MeetingParticipant, ParticipantRole, ParticipantStatus } from "@/types";

export interface JoinMeetingInput {
  meetingId: string;
  userId: string | null;
  displayName: string;
  role?: ParticipantRole;
  status?: ParticipantStatus;
  waitingRoomEnabled?: boolean;
}

function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// In-Memory Local Participant Status Store for Instant Offline & Guest Resilience
const memoryParticipants = new Map<string, MeetingParticipant>();

/** Records that someone (member or guest) joined a meeting. */
export async function joinMeeting({
  meetingId,
  userId,
  displayName,
  role = "participant",
  status,
  waitingRoomEnabled = false,
}: JoinMeetingInput): Promise<MeetingParticipant> {
  const id = generateUuid();
  const now = new Date().toISOString();
  const normalizedCode = parseMeetingInput(meetingId) || meetingId.trim().toUpperCase();
  const dbMeetingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId)
    ? meetingId
    : stringToUUID(normalizedCode);
  const dbUserId = userId ? stringToUUID(userId) : null;

  // If waitingRoomEnabled is true and user is not host, status is 'waiting' unless explicitly provided
  const finalStatus: ParticipantStatus =
    status || (waitingRoomEnabled && role !== "host" ? "waiting" : "admitted");

  const record: MeetingParticipant = {
    id,
    meeting_id: dbMeetingId,
    user_id: dbUserId,
    display_name: displayName.trim(),
    role,
    status: finalStatus,
    mic_enabled: true,
    camera_enabled: true,
    screen_sharing: false,
    joined_at: now,
    left_at: null,
  };

  memoryParticipants.set(id, record);

  // 1. Try RPC join_meeting if available
  try {
    const { data: rpcData, error: rpcError } = await (
      supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{
        data: MeetingParticipant[] | MeetingParticipant | null;
        error: unknown;
      }>
    )("join_meeting", {
      _meeting_id: dbMeetingId,
      _user_id: dbUserId,
      _display_name: displayName.trim(),
      _role: role,
      _status: record.status,
    });

    if (!rpcError && rpcData) {
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (row) {
        memoryParticipants.set(row.id, row as MeetingParticipant);
        return row as MeetingParticipant;
      }
    }
    if (rpcError) {
      // TEMPORARY diagnostic log — this was previously swallowed by a bare
      // `catch { /* fallback to insert */ }` with no logging at all.
      console.error("Notice: join_meeting RPC returned an error:", rpcError);
    }
  } catch (err) {
    console.error("Notice: join_meeting RPC threw:", err);
  }

  // 2. Try direct DB insert
  try {
    const { data, error } = await supabase
      .from("meeting_participants")
      .insert({
        id,
        meeting_id: dbMeetingId,
        user_id: dbUserId,
        display_name: displayName.trim(),
        role,
        status: record.status,
        mic_enabled: true,
        camera_enabled: true,
        screen_sharing: false,
        joined_at: now,
      } as any)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      const norm = data as MeetingParticipant;
      memoryParticipants.set(norm.id, norm);
      return norm;
    }
    if (error) {
      // TEMPORARY diagnostic log — same silent-fallthrough issue as above.
      console.error("Notice: meeting_participants insert returned an error:", error);
    }
  } catch (err) {
    console.warn("Notice in joinMeeting DB insert:", err);
  }

  return record;
}

/** Marks a participation row as finished. Safe to call for guests too. */
export async function leaveMeeting(participantId: string): Promise<void> {
  const existing = memoryParticipants.get(participantId);
  if (existing) {
    // "left" was never a valid ParticipantStatus (same enum bug as
    // updateParticipantStatus below) — left_at alone is the correct signal
    // that someone departed; status is left as whatever it already was.
    existing.left_at = new Date().toISOString();
    memoryParticipants.set(participantId, existing);
  }

  try {
    await supabase
      .from("meeting_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("id", participantId);
  } catch (err) {
    console.warn("Notice updating participant left_at:", err);
  }
}

/** Fetch participant status by row ID for waiting room updates */
export async function getParticipantStatus(participantId: string): Promise<ParticipantStatus> {
  const local = memoryParticipants.get(participantId);

  try {
    const { data } = await supabase
      .from("meeting_participants")
      .select("status")
      .eq("id", participantId)
      .maybeSingle();

    if (data && data.status) {
      if (local) local.status = data.status as ParticipantStatus;
      return data.status as ParticipantStatus;
    }
  } catch {
    /* fallback to local */
  }

  return local?.status || "waiting";
}

/** Host updates participant status (admit / reject / remove) */
export async function updateParticipantStatus(participantId: string, status: ParticipantStatus): Promise<void> {
  // Previously mapped "removed" -> "left", but "left" was never a valid
  // participant_status enum value in the DB (waiting/admitted/rejected/removed
  // only), so this update silently failed every time a host removed someone.
  const local = memoryParticipants.get(participantId);
  if (local) {
    local.status = status;
    memoryParticipants.set(participantId, local);
  }

  try {
    await supabase
      .from("meeting_participants")
      .update({ status } as any)
      .eq("id", participantId);
  } catch (err) {
    console.warn("Notice updating participant status:", err);
  }
}

/** Host admits a waiting participant */
export async function admitParticipant(participantId: string): Promise<void> {
  await updateParticipantStatus(participantId, "admitted");
}

/** Host rejects/declines a waiting participant */
export async function rejectParticipant(participantId: string): Promise<void> {
  await updateParticipantStatus(participantId, "rejected");
}