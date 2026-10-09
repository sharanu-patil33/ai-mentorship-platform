import { supabase } from "@/integrations/supabase/client";
import { generateMeetingCode, parseMeetingInput } from "@/lib/meeting-id";
import { stringToUUID, getCanonicalUserKey } from "@/services/chat";
import type { Meeting, MeetingStatus } from "@/types";

/**
 * Data-access layer for meetings. Every database call the UI needs lives here
 * so pages and components stay free of query logic.
 */

export interface CreateMeetingInput {
  title: string;
  scheduledAt?: string | null;
  hostId: string;
  waitingRoomEnabled?: boolean;
  durationMinutes?: number;
}

// In-Memory Meeting Store for Instant Fallback & Offline Resilience
const memoryCreatedMeetings = new Map<string, Meeting>();

function persistMeetingState() {
  if (typeof window === "undefined") return;
  try {
    const arr = Array.from(memoryCreatedMeetings.entries());
    localStorage.setItem("meetspace_memory_meetings_v2", JSON.stringify(arr));
  } catch {
    /* ignore storage errors */
  }
}

function restoreMeetingState() {
  if (typeof window === "undefined") return;
  try {
    const data = localStorage.getItem("meetspace_memory_meetings_v2");
    if (data) {
      const arr = JSON.parse(data);
      for (const [k, v] of arr) {
        memoryCreatedMeetings.set(k, v);
      }
    }
  } catch {
    /* ignore restore errors */
  }
}
restoreMeetingState();

function normalizeMeetingRow(row: Record<string, unknown>, defaultDuration = 60): Meeting {
  const dur =
    typeof row["duration_minutes"] === "number" && row["duration_minutes"] > 0
      ? (row["duration_minutes"] as number)
      : defaultDuration;

  const createdAt = String(row["created_at"] ?? new Date().toISOString());
  const startedAt = (row["started_at"] as string) || null;
  const baseTimeMs = new Date(startedAt || createdAt).getTime();

  // Deterministically compute expires_at if missing so all clients get the exact same timestamp!
  const rawExpiresAt = row["expires_at"] as string | undefined;
  const expiresAt =
    rawExpiresAt && typeof rawExpiresAt === "string" && rawExpiresAt.length > 0
      ? rawExpiresAt
      : new Date(baseTimeMs + dur * 60000).toISOString();

  return {
    id: String(row["id"] ?? ""),
    meeting_id: String(row["meeting_id"] ?? ""),
    title: String(row["title"] ?? ""),
    host_id: String(row["host_id"] ?? ""),
    scheduled_at: (row["scheduled_at"] as string) || null,
    started_at: startedAt,
    ended_at: (row["ended_at"] as string) || null,
    status: (row["status"] as MeetingStatus) || "waiting",
    locked: Boolean(row["locked"]),
    waiting_room_enabled: Boolean(row["waiting_room_enabled"]),
    duration_minutes: dur,
    expires_at: expiresAt,
    time_warning_sent: Boolean(row["time_warning_sent"]),
    has_password: Boolean(row["has_password"] ?? row["password_hash"]),
    created_at: createdAt,
  };
}

export async function createMeeting({
  title,
  scheduledAt,
  hostId,
  waitingRoomEnabled = false,
  durationMinutes = 60,
}: CreateMeetingInput): Promise<Meeting> {
  const sanitizedDuration = Math.max(5, Math.min(1440, durationMinutes));
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + sanitizedDuration * 60000).toISOString();
  const dbHostId = stringToUUID(hostId);
  const code = generateMeetingCode();

  const fallbackMeeting: Meeting = {
    id: stringToUUID(code),
    meeting_id: code,
    title: (title || "Instant Video Meeting").trim(),
    host_id: hostId,
    scheduled_at: scheduledAt || null,
    started_at: scheduledAt ? null : nowIso,
    ended_at: null,
    status: scheduledAt ? "scheduled" : "active",
    locked: false,
    waiting_room_enabled: waitingRoomEnabled,
    duration_minutes: sanitizedDuration,
    expires_at: scheduledAt ? null : expiresIso,
    time_warning_sent: false,
    has_password: false,
    created_at: nowIso,
  };

  memoryCreatedMeetings.set(code.toUpperCase(), fallbackMeeting);
  memoryCreatedMeetings.set(fallbackMeeting.id.toUpperCase(), fallbackMeeting);
  persistMeetingState();

  try {
    const insertPayload: Record<string, unknown> = {
      // The rest of the app (join_meeting, participants, chat) derives the meeting's row id from its
      // code with stringToUUID(code). The row must use that same id, otherwise joining reports
      // "Meeting not found" and other people can never enter the meeting.
      id: fallbackMeeting.id,
      meeting_id: code,
      title: (title || "Instant Video Meeting").trim(),
      host_id: dbHostId,
      scheduled_at: scheduledAt || null,
      started_at: scheduledAt ? null : nowIso,
      expires_at: scheduledAt ? null : expiresIso,
      status: scheduledAt ? "scheduled" : "active",
      waiting_room_enabled: waitingRoomEnabled,
      duration_minutes: sanitizedDuration,
    };

    const { data, error } = await supabase
      .from("meetings")
      .insert(insertPayload as never)
      .select("*")
      .single();

    if (!error && data) {
      const norm = normalizeMeetingRow(data as Record<string, unknown>, sanitizedDuration);
      memoryCreatedMeetings.set(code.toUpperCase(), norm);
      memoryCreatedMeetings.set(norm.id.toUpperCase(), norm);
      persistMeetingState();
      return norm;
    }
    if (error) {
      // TEMPORARY diagnostic log — this insert error was previously
      // swallowed silently (only thrown exceptions were logged, not a
      // returned {error} response), which is why nothing appeared in the
      // console despite the meetings table never getting a row.
      console.error("Notice: meetings insert returned an error:", error);
    }
  } catch (err) {
    console.warn("Notice inserting meeting to DB:", err);
  }

  return fallbackMeeting;
}

export async function getMeetingByCode(code: string): Promise<Meeting | null> {
  if (!code) return null;
  const rawCode = code.trim();
  const upperCode = rawCode.toUpperCase();
  const compactCode = upperCode.replace(/[-_\s]+/g, "");
  const normalized = parseMeetingInput(rawCode) || (compactCode.length === 9 ? `${compactCode.slice(0, 3)}-${compactCode.slice(3, 6)}-${compactCode.slice(6, 9)}` : upperCode);

  void cleanupStaleMeetings();

  // 1. Check in-memory meeting store first
  const inMemory =
    memoryCreatedMeetings.get(normalized) ||
    memoryCreatedMeetings.get(upperCode) ||
    memoryCreatedMeetings.get(compactCode) ||
    memoryCreatedMeetings.get(rawCode);
  if (inMemory) {
    return inMemory;
  }

  // 2. Query Supabase database
  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCode);

    let query = supabase.from("meetings").select("*");
    if (isUUID) {
      query = query.or(`meeting_id.eq.${normalized},id.eq.${rawCode},meeting_id.eq.${upperCode},meeting_id.eq.${compactCode}`);
    } else {
      query = query.or(`meeting_id.eq.${normalized},meeting_id.eq.${upperCode},meeting_id.eq.${compactCode}`);
    }

    const { data, error } = await query.maybeSingle();

    if (!error && data) {
      const norm = normalizeMeetingRow(data as Record<string, unknown>);
      memoryCreatedMeetings.set(normalized, norm);
      memoryCreatedMeetings.set(upperCode, norm);
      memoryCreatedMeetings.set(compactCode, norm);
      memoryCreatedMeetings.set(norm.id.toUpperCase(), norm);
      persistMeetingState();
      return norm;
    }
  } catch (err) {
    console.warn("Notice querying getMeetingByCode DB:", err);
  }

  // 3. Fallback RPC Query
  try {
    const { data: rpcData } = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
    )("get_meeting_by_code", { _code: normalized });

    if (rpcData && rpcData.length > 0) {
      const norm = normalizeMeetingRow(rpcData[0]!);
      memoryCreatedMeetings.set(normalized, norm);
      memoryCreatedMeetings.set(upperCode, norm);
      memoryCreatedMeetings.set(compactCode, norm);
      memoryCreatedMeetings.set(norm.id.toUpperCase(), norm);
      persistMeetingState();
      return norm;
    }
  } catch {
    /* ignore rpc errors */
  }

  return (
    memoryCreatedMeetings.get(normalized) ||
    memoryCreatedMeetings.get(upperCode) ||
    memoryCreatedMeetings.get(compactCode) ||
    null
  );
}

export const getMeeting = getMeetingByCode;

// Filter out 1-on-1 direct chat call meetings ("Instant Video Meeting") from main dashboard!
export async function listMeetingsForHost(hostId: string): Promise<Meeting[]> {
  void cleanupStaleMeetings();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hostId);
  const dbHostId = stringToUUID(hostId);
  const meKey = getCanonicalUserKey(hostId);

  const localList = Array.from(memoryCreatedMeetings.values()).filter(
    (m) =>
      (getCanonicalUserKey(m.host_id) === meKey || m.host_id === hostId || m.host_id === dbHostId) &&
      m.title !== "Instant Video Meeting",
  );

  try {
    let query = supabase.from("meetings").select("*").order("created_at", { ascending: false });
    if (isUUID) {
      query = query.or(`host_id.eq.${hostId},host_id.eq.${dbHostId}`);
    } else {
      query = query.eq("host_id", dbHostId);
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      const dbList = (data as Record<string, unknown>[])
        .map((row) => normalizeMeetingRow(row))
        .filter((m) => m.title !== "Instant Video Meeting");

      const map = new Map<string, Meeting>();
      for (const m of localList) map.set(m.meeting_id, m);
      for (const m of dbList) map.set(m.meeting_id, m);

      return Array.from(map.values());
    }
  } catch (err) {
    console.warn("Notice in listMeetingsForHost query:", err);
  }

  return localList;
}

export function splitMeetings(meetings: Meeting[]): {
  upcoming: Meeting[];
  recent: Meeting[];
  past: Meeting[];
} {
  const upcoming: Meeting[] = [];
  const recent: Meeting[] = [];

  for (const m of meetings) {
    if (m.status === "ended") {
      recent.push(m);
    } else {
      upcoming.push(m);
    }
  }

  return { upcoming, recent, past: recent };
}

export async function updateMeetingStatus(meetingId: string, status: MeetingStatus): Promise<void> {
  const upperCode = meetingId.toUpperCase();
  const existing = memoryCreatedMeetings.get(upperCode) || memoryCreatedMeetings.get(meetingId);
  if (existing) {
    existing.status = status;
    if (status === "active") existing.started_at = existing.started_at || new Date().toISOString();
    if (status === "ended") existing.ended_at = new Date().toISOString();
    memoryCreatedMeetings.set(upperCode, existing);
    persistMeetingState();
  }

  const payload: Record<string, unknown> = { status };
  if (status === "active") payload["started_at"] = new Date().toISOString();
  if (status === "ended") payload["ended_at"] = new Date().toISOString();

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId);

  try {
    if (isUUID) {
      await supabase
        .from("meetings")
        .update(payload as never)
        .or(`meeting_id.eq.${meetingId},id.eq.${meetingId}`);
    } else {
      await supabase
        .from("meetings")
        .update(payload as never)
        .eq("meeting_id", meetingId);
    }
  } catch (err) {
    console.warn("Notice updating meeting status:", err);
  }
}

export async function updateMeetingLock(meetingId: string, locked: boolean): Promise<void> {
  const upperCode = meetingId.toUpperCase();
  const existing = memoryCreatedMeetings.get(upperCode) || memoryCreatedMeetings.get(meetingId);
  if (existing) {
    existing.locked = locked;
    memoryCreatedMeetings.set(upperCode, existing);
    persistMeetingState();
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId);
  try {
    if (isUUID) {
      await supabase
        .from("meetings")
        .update({ locked } as never)
        .or(`meeting_id.eq.${meetingId},id.eq.${meetingId}`);
    } else {
      await supabase
        .from("meetings")
        .update({ locked } as never)
        .eq("meeting_id", meetingId);
    }
  } catch (err) {
    console.warn("Notice updating meeting lock:", err);
  }
}

export async function updateMeetingDuration(
  meetingId: string,
  durationMinutes: number,
): Promise<{ duration_minutes: number; expires_at: string }> {
  const meeting = await getMeetingByCode(meetingId);
  const baseTimeMs = new Date(meeting?.started_at || meeting?.created_at || Date.now()).getTime();
  const expiresAt = new Date(baseTimeMs + durationMinutes * 60000).toISOString();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId);

  const upperCode = meetingId.toUpperCase();
  const existing = memoryCreatedMeetings.get(upperCode) || memoryCreatedMeetings.get(meetingId);
  if (existing) {
    existing.duration_minutes = durationMinutes;
    existing.expires_at = expiresAt;
    memoryCreatedMeetings.set(upperCode, existing);
    persistMeetingState();
  }

  try {
    if (isUUID) {
      await supabase
        .from("meetings")
        .update({ duration_minutes: durationMinutes, expires_at: expiresAt } as never)
        .or(`meeting_id.eq.${meetingId},id.eq.${meetingId}`);
    } else {
      await supabase
        .from("meetings")
        .update({ duration_minutes: durationMinutes, expires_at: expiresAt } as never)
        .eq("meeting_id", meetingId);
    }
  } catch (err) {
    console.warn("Notice updating meeting duration:", err);
  }

  return { duration_minutes: durationMinutes, expires_at: expiresAt };
}

export async function updateTimeWarningSent(meetingId: string, sent = true): Promise<void> {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId);
  try {
    if (isUUID) {
      await supabase
        .from("meetings")
        .update({ time_warning_sent: sent } as never)
        .or(`meeting_id.eq.${meetingId},id.eq.${meetingId}`);
    } else {
      await supabase
        .from("meetings")
        .update({ time_warning_sent: sent } as never)
        .eq("meeting_id", meetingId);
    }
  } catch (err) {
    console.warn("Notice updating time_warning_sent:", err);
  }
}

export async function cleanupStaleMeetings(): Promise<void> {
  try {
    const { data } = await supabase
      .from("meetings")
      .select("id, meeting_id, expires_at, status")
      .eq("status", "active")
      .not("expires_at", "is", null);

    if (!data || data.length === 0) return;

    const now = Date.now();
    for (const row of data) {
      if (row.expires_at && new Date(row.expires_at).getTime() <= now) {
        await updateMeetingStatus(String(row.id), "ended");
      }
    }
  } catch (err) {
    console.warn("Notice during cleanupStaleMeetings:", err);
  }
}