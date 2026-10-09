import { createMeeting, getMeetingByCode } from "@/services/meetings";
import { sendDirectMessage } from "@/services/chat";
import { supabase } from "@/integrations/supabase/client";

export type CallStatusType = "completed" | "no_answer" | "declined" | "ongoing" | "cancelled";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Start a MeetSpace direct meeting from chat conversation.
 * Automatically creates a meeting row and posts an interactive Meeting Card into the chat.
 */
export async function startMeetingFromChat(
  conversationId: string,
  hostUserId: string,
  title: string = "Instant Video Meeting",
  callStatus: CallStatusType = "completed",
  durationSeconds?: number,
) {
  // 1. Create a new MeetSpace meeting
  const meeting = await createMeeting({
    title: (title || "Instant Video Meeting").trim(),
    hostId: hostUserId,
    waitingRoomEnabled: false,
  });

  // direct_messages.meeting_id is a UUID FK to meetings(id) — NOT the short
  // human-readable meeting_id code (e.g. "ABC-123"). Passing the code here
  // previously caused every meeting-linked chat message insert/update to
  // fail (Postgres "invalid input syntax for type uuid"), silently swallowed
  // by the caller's try/catch.
  const meetingDbId = meeting.id;

  let cardText = "🎥 Meeting";
  if (callStatus === "no_answer") {
    cardText = "🎥 Missed meeting";
  } else if (callStatus === "declined") {
    cardText = "🎥 Meeting declined";
  } else if (callStatus === "cancelled") {
    cardText = "🎥 Meeting cancelled";
  } else if (callStatus === "ongoing") {
    cardText = "🎥 Meeting — Ongoing";
  } else if (typeof durationSeconds === "number" && durationSeconds >= 0) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    cardText = `🎥 Meeting · ${durStr}`;
  }

  // 2. Post meeting invite card to the conversation
  await sendDirectMessage(
    conversationId,
    hostUserId,
    cardText,
    undefined,
    meetingDbId,
  );

  return meeting;
}

/**
 * Update direct meeting card text in DB upon meeting completion, declination, or cancellation.
 *
 * Accepts either the meetings.id UUID or the short meeting_id code — the one
 * external caller (routes/meeting/$meetingId.tsx) passes the short code, so
 * this resolves it to the real UUID before touching direct_messages, whose
 * meeting_id column is a UUID FK to meetings(id).
 */
export async function updateMeetingCardStatus(
  meetingCodeOrId: string,
  callStatus: CallStatusType,
  durationSeconds?: number,
): Promise<void> {
  if (!meetingCodeOrId) return;

  let cardText = "🎥 Meeting";
  if (callStatus === "no_answer") {
    cardText = "🎥 Missed meeting";
  } else if (callStatus === "declined") {
    cardText = "🎥 Meeting declined";
  } else if (callStatus === "cancelled") {
    cardText = "🎥 Meeting cancelled";
  } else if (callStatus === "ongoing") {
    cardText = "🎥 Meeting — Ongoing";
  } else if (typeof durationSeconds === "number" && durationSeconds >= 0) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    cardText = `🎥 Meeting · ${durStr}`;
  }

  try {
    let meetingDbId = meetingCodeOrId;
    if (!UUID_RE.test(meetingCodeOrId)) {
      const meeting = await getMeetingByCode(meetingCodeOrId);
      if (!meeting) return;
      meetingDbId = meeting.id;
    }

    await supabase
      .from("direct_messages" as any)
      .update({ text: cardText } as any)
      .eq("meeting_id", meetingDbId);
  } catch (err) {
    console.warn("Notice updating direct_messages meeting card status:", err);
  }
}
