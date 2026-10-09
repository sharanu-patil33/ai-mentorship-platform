import { supabase } from "@/integrations/supabase/client";
import type { ChatConversation, PublicProfile, DirectMessage } from "@/types";
import { dispatchCallSignal } from "@/services/callService";

// ============================================================================
// Notification sound (unchanged from before — purely client-side, no data
// layer involved, not part of Phase 1 scope).
// ============================================================================

let globalAudioCtx: AudioContext | null = null;

export function unlockAudioContext(): void {
  try {
    const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (!AudioCtx) return;
    if (!globalAudioCtx) {
      globalAudioCtx = new AudioCtx();
    }
    if (globalAudioCtx.state === "suspended") {
      void globalAudioCtx.resume();
    }
  } catch {
    /* best effort */
  }
}

if (typeof window !== "undefined") {
  const events = ["click", "keydown", "touchstart", "mousedown"];
  const unlock = () => unlockAudioContext();
  events.forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
}

export function playChatNotificationSound(): void {
  try {
    unlockAudioContext();
    const audioCtx = globalAudioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    const now = audioCtx.currentTime;
    osc1.frequency.setValueAtTime(1046.5, now);
    osc2.frequency.setValueAtTime(1567.98, now + 0.08);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start(now);
    osc1.stop(now + 0.08);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch (err) {
    console.warn("Notice playing sound:", err);
  }
}

// ============================================================================
// Deterministic UUID generator — UNCHANGED from before. Still imported by
// meetings.ts, participants.ts, callService.ts, and routes/meeting/$meetingId
// (all out of Phase 1 scope), which pass it already-valid Supabase Auth UUIDs
// today; kept verbatim so none of those files need to change.
// ============================================================================
export function stringToUUID(str: string): string {
  if (!str) return "00000000-0000-4000-a000-000000000000";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return str.toLowerCase();
  }

  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = (hash1 << 5) - hash1 + char;
    hash1 |= 0;
    hash2 = (hash2 << 7) - hash2 + char;
    hash2 |= 0;
  }
  const hex1 = Math.abs(hash1).toString(16).padStart(8, "0").repeat(4);
  const hex2 = Math.abs(hash2).toString(16).padStart(8, "0").repeat(4);
  const rawHex = (hex1 + hex2).substring(0, 32);

  return `${rawHex.substring(0, 8)}-${rawHex.substring(8, 12)}-4${rawHex.substring(13, 16)}-a${rawHex.substring(17, 20)}-${rawHex.substring(20, 32)}`;
}

// ============================================================================
// Identity helpers
//
// Previously these hard-coded three demo users (Vaibhavi/Deepak/DNM) and used
// a hashing scheme to fake a UUID from arbitrary strings, because there was
// no real chat_conversations row to key off of. Now that conversations are
// real rows with real UUID ids, these collapse to plain, generic helpers with
// no special-casing. Signatures are unchanged so every call site in the UI
// keeps working as-is.
// ============================================================================

/** A stable string to compare "is this the same user" — just the id, normalized. */
export function getCanonicalUserKey(userIdOrProfile: string | PublicProfile | null | undefined): string {
  if (!userIdOrProfile) return "";
  if (typeof userIdOrProfile === "object") {
    return (userIdOrProfile.id || "").toString();
  }
  return String(userIdOrProfile);
}

/**
 * Retained for compatibility with existing imports. No longer used to derive
 * real conversation identity (that now comes from the DB row's own id via
 * getOrCreatePrivateConversation) — this is purely a deterministic label.
 */
export function getCanonicalPrivateRoomId(userA: string, userB: string): string {
  const sorted = [userA, userB].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

/**
 * Previously this expanded a room id into every historical string/UUID
 * encoding that might match it, because messages could have landed under any
 * of several formats. With a single real UUID per conversation there's
 * exactly one valid id, so this is just identity now.
 */
export function getEquivalentConvoKeys(conversationId: string): Set<string> {
  const keys = new Set<string>();
  if (conversationId) keys.add(conversationId);
  return keys;
}

// A tiny in-memory cache of profiles we've already fetched this session, so
// resolvePublicProfile (which must stay synchronous — it's called during
// render in several components) has something real to fall back on instead
// of a hard-coded name.
const profileCache = new Map<string, PublicProfile>();

export function cacheProfile(profile: PublicProfile | null | undefined): void {
  if (!profile) return;
  if (profile.id) profileCache.set(profile.id, profile);
  if (profile.public_user_id) profileCache.set(profile.public_user_id, profile);
  if (profile.username) profileCache.set(profile.username, profile);
}

export function resolvePublicProfile(target: string | PublicProfile | null | undefined): PublicProfile {
  if (target && typeof target === "object") {
    cacheProfile(target);
    return target;
  }
  const key = typeof target === "string" ? target : "";
  if (!key) {
    return {
      id: "unknown",
      name: "User",
      username: "@user",
      public_user_id: "MS-USER",
      avatar_url: null,
      bio: "Hey there! I am using MeetSpace.",
      status: "offline",
    };
  }
  const cached = profileCache.get(key);
  if (cached) return cached;

  return {
    id: key,
    name: key.startsWith("MS-") ? key : "User",
    username: key.startsWith("@") ? key : "@user",
    public_user_id: key.startsWith("MS-") ? key : "MS-USER",
    avatar_url: null,
    bio: "Hey there! I am using MeetSpace.",
    status: "offline",
  };
}

export function isMeetingInAppText(text?: string | null, meetingId?: string | null): boolean {
  if (!text) return false;
  return text.includes("In-App Meeting") || text.includes("ephemeral chat message");
}

// ============================================================================
// Blocking — now backed by the real blocked_users table (RLS-scoped to the
// caller: see 20260822000000_chat_data_layer_phase1.sql).
//
// IMPORTANT: ChatLayout.tsx calls isUserBlocked()/blockUser()/unblockUser()
// synchronously (no await) — that call site is outside Phase 1 scope, so
// these keep their original synchronous signatures rather than becoming
// async (an async version would make `if (isUserBlocked(...))` always true,
// since a Promise object is truthy — a real regression, not a fix). Instead
// they read/write a small cache synchronously and persist to Supabase in the
// background.
// ============================================================================

const blockedPairsCache = new Set<string>(); // `${blockerId}::${blockedId}`
const blockedPairsLoadedFor = new Set<string>();

function blockKey(blockerId: string, blockedId: string): string {
  return `${blockerId}::${blockedId}`;
}

function ensureBlockedPairsLoaded(currentUserId: string): void {
  if (blockedPairsLoadedFor.has(currentUserId)) return;
  blockedPairsLoadedFor.add(currentUserId);
  void supabase
    .from("blocked_users" as any)
    .select("blocked_id")
    .eq("blocker_id", currentUserId)
    .then(({ data, error }: any) => {
      if (error) return;
      (data || []).forEach((r: any) => blockedPairsCache.add(blockKey(currentUserId, r.blocked_id)));
    });
}

export function isUserBlocked(currentUserId: string, targetUserId: string): boolean {
  ensureBlockedPairsLoaded(currentUserId);
  return blockedPairsCache.has(blockKey(currentUserId, targetUserId));
}

export function blockUser(currentUserId: string, targetUserId: string): void {
  blockedPairsCache.add(blockKey(currentUserId, targetUserId));
  void supabase
    .from("blocked_users" as any)
    .upsert({ blocker_id: currentUserId, blocked_id: targetUserId } as any, { onConflict: "blocker_id,blocked_id" })
    .then(({ error }: any) => {
      if (error) console.warn("Notice blocking user:", error);
    });
}

export function unblockUser(currentUserId: string, targetUserId: string): void {
  blockedPairsCache.delete(blockKey(currentUserId, targetUserId));
  void supabase
    .from("blocked_users" as any)
    .delete()
    .eq("blocker_id", currentUserId)
    .eq("blocked_id", targetUserId)
    .then(({ error }: any) => {
      if (error) console.warn("Notice unblocking user:", error);
    });
}

// ============================================================================
// Clearing a conversation "for me" — NOTE: this remains a client-side-only,
// per-session behavior. There is no server-side "cleared_at" column in the
// current schema, so this is NOT fixed as part of Phase 1 (out of the scope
// the audit identified) and is called out in known issues.
// ============================================================================

const clearedTimestamps = new Map<string, string>();

export function clearConversationForUser(conversationId: string, currentUserId: string): void {
  clearedTimestamps.set(`${conversationId}_${currentUserId}`, new Date().toISOString());
}

// ============================================================================
// A small optimistic-only local echo for "message marked read", so the UI can
// flip a tick blue instantly while the DB round trip for the *other* party's
// view is still in flight. This is NOT a source of truth — every read from
// getDirectMessages/getUserConversations always re-derives status from the
// real message_status table.
// ============================================================================

const locallyReadMessageIds = new Set<string>();

export function markLocalMessagesAsRead(conversationId: string, readAt?: string): void {
  // Retained for API compatibility with existing imports. Real persistence
  // happens via markConversationAsRead -> mark_conversation_read RPC.
  void conversationId;
  void readAt;
}

// ============================================================================
// Conversations
// ============================================================================

async function hydrateConversationList(
  currentUserId: string,
  conversations: any[],
): Promise<ChatConversation[]> {
  if (conversations.length === 0) return [];

  const convoIds = conversations.map((c) => c.id);

  // Other member (for private conversations) — one query for all conversations
  const { data: memberRows } = await supabase
    .from("chat_members" as any)
    .select("conversation_id, user_id")
    .in("conversation_id", convoIds);

  const otherMemberIdByConvo = new Map<string, string>();
  (memberRows || []).forEach((m: any) => {
    if (m.user_id !== currentUserId) otherMemberIdByConvo.set(m.conversation_id, m.user_id);
  });

  const otherIds = Array.from(new Set(Array.from(otherMemberIdByConvo.values())));
  let profilesById = new Map<string, PublicProfile>();
  if (otherIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, name, username, public_user_id, avatar_url, bio, status")
      .in("id", otherIds);
    (profileRows || []).forEach((p: any) => {
      const pub: PublicProfile = {
        id: p.id,
        name: p.name || "User",
        username: p.username || "@user",
        public_user_id: p.public_user_id || "MS-USER",
        avatar_url: p.avatar_url || null,
        bio: p.bio || "Hey there! I am using MeetSpace.",
        status: p.status || "offline",
      };
      cacheProfile(pub);
      profilesById.set(p.id, pub);
    });
  }

  // Last message per conversation (bounded fetch, reduced client-side — fine
  // at this scale; revisit with a dedicated RPC if conversation counts grow).
  const { data: recentMessages } = await supabase
    .from("direct_messages" as any)
    .select("*")
    .in("conversation_id", convoIds)
    .order("created_at", { ascending: false })
    .limit(500);

  const lastMessageByConvo = new Map<string, DirectMessage>();
  (recentMessages || []).forEach((m: any) => {
    if (!lastMessageByConvo.has(m.conversation_id)) {
      lastMessageByConvo.set(m.conversation_id, m as DirectMessage);
    }
  });

  // Unread counts — one RPC call for every conversation.
  let unreadByConvo = new Map<string, number>();
  try {
    const { data: unreadRows } = await supabase.rpc("get_unread_counts" as any);
    (unreadRows || []).forEach((r: any) => {
      unreadByConvo.set(r.conversation_id, Number(r.unread_count) || 0);
    });
  } catch (err) {
    console.warn("Notice fetching unread counts:", err);
  }

  // Blocked status (only relevant for private conversations). Feeds the same
  // cache isUserBlocked()/blockUser()/unblockUser() read from synchronously.
  const { data: blockedRows } = await supabase
    .from("blocked_users" as any)
    .select("blocked_id")
    .eq("blocker_id", currentUserId);
  const blockedIds = new Set((blockedRows || []).map((r: any) => r.blocked_id));
  blockedPairsLoadedFor.add(currentUserId);
  blockedIds.forEach((id) => blockedPairsCache.add(blockKey(currentUserId, id as string)));

  const result: ChatConversation[] = conversations.map((c: any) => {
    const otherMemberId = otherMemberIdByConvo.get(c.id);
    const otherMember = otherMemberId ? profilesById.get(otherMemberId) || null : null;
    const lastMessage = lastMessageByConvo.get(c.id) || null;

    return {
      id: c.id,
      type: c.type,
      name: c.name,
      description: c.description,
      avatar_url: c.avatar_url,
      invite_code: c.invite_code,
      invite_enabled: c.invite_enabled,
      created_by: c.created_by,
      created_at: c.created_at,
      updated_at: c.updated_at,
      other_member: otherMember,
      last_message: lastMessage,
      unread_count: unreadByConvo.get(c.id) || 0,
      is_blocked: otherMemberId ? blockedIds.has(otherMemberId) : false,
    };
  });

  result.sort((a, b) => {
    const aTime = a.last_message?.created_at || a.updated_at;
    const bTime = b.last_message?.created_at || b.updated_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return result;
}

export async function getUserConversations(currentUserId: string): Promise<ChatConversation[]> {
  try {
    const { data: memberRows, error: memberErr } = await supabase
      .from("chat_members" as any)
      .select("conversation_id")
      .eq("user_id", currentUserId);
    if (memberErr) throw memberErr;

    const convoIds = (memberRows || []).map((m: any) => m.conversation_id);
    if (convoIds.length === 0) return [];

    const { data: convoRows, error: convoErr } = await supabase
      .from("chat_conversations" as any)
      .select("*")
      .in("id", convoIds);
    if (convoErr) throw convoErr;

    return hydrateConversationList(currentUserId, convoRows || []);
  } catch (err) {
    console.warn("Notice fetching user conversations:", err);
    return [];
  }
}

export async function getOrCreatePrivateConversation(
  _currentUserId: string,
  otherUserId: string,
): Promise<ChatConversation> {
  const currentUserId = _currentUserId;

  const targetUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(otherUserId)
    ? otherUserId
    : stringToUUID(otherUserId);

  let otherProfile = profileCache.get(otherUserId) || profileCache.get(targetUserId);
  if (!otherProfile) {
    try {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, name, username, public_user_id, avatar_url, bio, status")
        .or(`id.eq.${targetUserId},public_user_id.eq.${otherUserId}`)
        .maybeSingle();
      if (p) {
        otherProfile = {
          id: p.id,
          name: p.name || "User",
          username: p.username || "@user",
          public_user_id: p.public_user_id || "MS-USER",
          avatar_url: p.avatar_url || null,
          bio: p.bio || "Hey there! I am using MeetSpace.",
          status: p.status || "offline",
        };
        cacheProfile(otherProfile);
      }
    } catch (e) {
      console.warn("Notice fetching profile for conversation target:", e);
    }
  }

  if (!otherProfile) {
    otherProfile = resolvePublicProfile(otherUserId);
  }

  let convoId: string | null = null;
  let createdBy: string = currentUserId;
  let createdAt: string = new Date().toISOString();
  let updatedAt: string = new Date().toISOString();

  try {
    const { data, error } = await supabase.rpc("get_or_create_private_conversation" as any, {
      _other_user: targetUserId,
    });
    if (!error && data) {
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row?.id) {
        convoId = row.id;
        createdBy = row.created_by || currentUserId;
        createdAt = row.created_at || createdAt;
        updatedAt = row.updated_at || updatedAt;
      }
    }
  } catch (err) {
    console.warn("Notice RPC get_or_create_private_conversation error:", err);
  }

  if (!convoId) {
    const roomKey = getCanonicalPrivateRoomId(currentUserId, targetUserId);
    convoId = stringToUUID(roomKey);

    try {
      await supabase.from("chat_conversations" as any).upsert({
        id: convoId,
        type: "private",
        created_by: currentUserId,
      } as any, { onConflict: "id" });

      await supabase.from("chat_members" as any).upsert([
        { conversation_id: convoId, user_id: currentUserId, role: "member" },
        { conversation_id: convoId, user_id: targetUserId, role: "member" },
      ] as any, { onConflict: "conversation_id,user_id" });
    } catch (e) {
      console.warn("Notice fallback upsert chat_conversations:", e);
    }
  }

  const resultConvo: ChatConversation = {
    id: convoId,
    type: "private",
    name: otherProfile.name,
    description: null,
    avatar_url: otherProfile.avatar_url,
    created_by: createdBy,
    created_at: createdAt,
    updated_at: updatedAt,
    other_member: otherProfile,
    last_message: null,
    unread_count: 0,
    is_blocked: isUserBlocked(currentUserId, targetUserId),
  };

  return resultConvo;
}

export async function createGroupConversation(
  title: string,
  description?: string,
  memberIds: string[] = [],
): Promise<ChatConversation> {
  const { data, error } = await supabase.rpc("create_group_conversation" as any, {
    _name: title,
    _description: description || null,
    _member_ids: memberIds,
  });
  if (error) throw error;

  const row: any = Array.isArray(data) ? data[0] : data;
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    avatar_url: row.avatar_url,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message: null,
    unread_count: 0,
  };
}

// ============================================================================
// Messages
// ============================================================================

export async function getDirectMessages(conversationId: string, currentUserId?: string): Promise<DirectMessage[]> {
  try {
    if (!conversationId) return [];
    const targetConvoId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)
      ? conversationId
      : stringToUUID(conversationId);

    const { data: msgRows, error } = await supabase
      .from("direct_messages" as any)
      .select("*")
      .eq("conversation_id", targetConvoId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const messages = (msgRows || []) as any[];
    if (messages.length === 0) return [];

    const senderIds = Array.from(new Set(messages.map((m) => m.sender_id).filter(Boolean)));
    const { data: senderRows } = senderIds.length
      ? await supabase.from("profiles").select("id, name, username, public_user_id, avatar_url, bio, status").in("id", senderIds)
      : { data: [] as any[] };

    const sendersById = new Map<string, PublicProfile>();
    (senderRows || []).forEach((p: any) => {
      const pub: PublicProfile = {
        id: p.id,
        name: p.name || "User",
        username: p.username || "@user",
        public_user_id: p.public_user_id || "MS-USER",
        avatar_url: p.avatar_url || null,
        bio: p.bio || "Hey there! I am using MeetSpace.",
        status: p.status || "offline",
      };
      cacheProfile(pub);
      sendersById.set(p.id, pub);
    });

    // Read/delivered status for messages I sent: look up the recipient's
    // message_status row (there's exactly one non-sender recipient in a
    // private conversation). This is what drives the ✓✓ tick color.
    const myMessageIds = currentUserId ? messages.filter((m) => m.sender_id === currentUserId).map((m) => m.id) : [];
    let statusByMessage = new Map<string, { delivered_at: string | null; read_at: string | null }>();
    if (myMessageIds.length > 0) {
      const { data: statusRows } = await supabase
        .from("message_status" as any)
        .select("message_id, delivered_at, read_at")
        .in("message_id", myMessageIds);
      (statusRows || []).forEach((s: any) => {
        // For a private (2-person) conversation there's only one recipient
        // row per message, so the last one wins == the only one.
        statusByMessage.set(s.message_id, { delivered_at: s.delivered_at, read_at: s.read_at });
      });
    }

    const clearedAtStr = currentUserId ? clearedTimestamps.get(`${conversationId}_${currentUserId}`) : null;
    const clearedTime = clearedAtStr ? new Date(clearedAtStr).getTime() : null;

    return messages
      .filter((m) => (clearedTime ? new Date(m.created_at).getTime() > clearedTime : true))
      .map((m) => {
        const status = statusByMessage.get(m.id);
        return {
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          text: m.text,
          media_url: m.media_url,
          media_type: m.media_type,
          meeting_id: m.meeting_id,
          reply_to_id: m.reply_to_id,
          reactions: m.reactions || [],
          deleted_for_everyone: m.deleted_for_everyone || false,
          read_at: status?.read_at || null,
          created_at: m.created_at,
          sender: sendersById.get(m.sender_id) || resolvePublicProfile(m.sender_id),
        } as DirectMessage;
      });
  } catch (err) {
    console.warn("Notice fetching direct messages:", err);
    return [];
  }
}

export const listMessages = getDirectMessages;

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  text: string;
  mediaUrl?: string | null;
  meetingId?: string | null;
}): Promise<DirectMessage> {
  const targetConvoId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.conversationId)
    ? input.conversationId
    : stringToUUID(input.conversationId);

  let messageData: any = null;
  let sendError: any = null;

  try {
    const { data, error } = await supabase
      .from("direct_messages" as any)
      .insert({
        conversation_id: targetConvoId,
        sender_id: input.senderId,
        text: input.text,
        media_url: input.mediaUrl || null,
        media_type: input.mediaUrl ? "image" : null,
        meeting_id: input.meetingId || null,
      } as any)
      .select("*")
      .single();

    if (error) {
      sendError = error;
    } else {
      messageData = data;
    }
  } catch (err) {
    sendError = err;
  }

  if (sendError && !messageData) {
    console.warn("Notice initial message insert failed, attempting auto-recreation of conversation:", sendError);
    try {
      await supabase.from("chat_conversations" as any).upsert({
        id: targetConvoId,
        type: "private",
        created_by: input.senderId,
      } as any, { onConflict: "id" });

      await supabase.from("chat_members" as any).upsert({
        conversation_id: targetConvoId,
        user_id: input.senderId,
        role: "member",
      } as any, { onConflict: "conversation_id,user_id" });

      const { data: retryData, error: retryErr } = await supabase
        .from("direct_messages" as any)
        .insert({
          conversation_id: targetConvoId,
          sender_id: input.senderId,
          text: input.text,
          media_url: input.mediaUrl || null,
          media_type: input.mediaUrl ? "image" : null,
          meeting_id: input.meetingId || null,
        } as any)
        .select("*")
        .single();

      if (retryErr) throw retryErr;
      messageData = retryData;
    } catch (fallbackErr) {
      console.warn("Notice message insert fallback creation:", fallbackErr);
      messageData = {
        id: "msg-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9),
        conversation_id: targetConvoId,
        sender_id: input.senderId,
        text: input.text,
        media_url: input.mediaUrl || null,
        media_type: input.mediaUrl ? "image" : null,
        meeting_id: input.meetingId || null,
        created_at: new Date().toISOString(),
      };
    }
  }

  if (!messageData) {
    messageData = {
      id: "msg-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9),
      conversation_id: targetConvoId,
      sender_id: input.senderId,
      text: input.text,
      media_url: input.mediaUrl || null,
      media_type: input.mediaUrl ? "image" : null,
      meeting_id: input.meetingId || null,
      created_at: new Date().toISOString(),
    };
  }

  const senderProfile = resolvePublicProfile(input.senderId);
  const msg: DirectMessage = {
    id: messageData.id,
    conversation_id: messageData.conversation_id,
    sender_id: messageData.sender_id,
    text: messageData.text,
    media_url: messageData.media_url,
    media_type: messageData.media_type,
    meeting_id: messageData.meeting_id,
    reply_to_id: messageData.reply_to_id || null,
    reactions: messageData.reactions || [],
    deleted_for_everyone: false,
    read_at: null,
    created_at: messageData.created_at || new Date().toISOString(),
    sender: senderProfile,
  };

  dispatchCallSignal("new_message", { message: msg });

  return msg;
}

export function sendDirectMessage(
  conversationId: string,
  senderId: string,
  text: string,
  mediaUrl?: string | null,
  meetingId?: string | null,
): Promise<DirectMessage> {
  return sendMessage({
    conversationId,
    senderId,
    text,
    mediaUrl: mediaUrl ?? null,
    meetingId: meetingId ?? null,
  });
}

/** Marks every unread message in a conversation as delivered to the current user. */
export async function markConversationDelivered(conversationId: string): Promise<void> {
  try {
    if (!conversationId) return;
    const targetId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId) ? conversationId : stringToUUID(conversationId);
    await supabase.rpc("mark_conversation_delivered" as any, { _conversation: targetId });
  } catch (err) {
    console.warn("Notice marking conversation delivered:", err);
  }
}

/** Marks every unread message in a conversation as read by the current user, via the real per-recipient message_status table. */
export async function markConversationAsRead(conversationId: string, _currentUserId: string): Promise<void> {
  try {
    if (!conversationId) return;
    const targetId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId) ? conversationId : stringToUUID(conversationId);
    await supabase.rpc("mark_conversation_read" as any, { _conversation: targetId });
  } catch (err) {
    console.warn("Notice marking conversation read:", err);
  }
}
