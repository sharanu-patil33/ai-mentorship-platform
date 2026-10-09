/**
 * Shared application types for MeetSpace.
 *
 * These mirror the database schema (see docs/DATABASE.md) and are the single
 * source of truth for meeting-related and chat-related data shapes across the app.
 */

export type MeetingStatus = "scheduled" | "waiting" | "active" | "expired" | "ended";
export type ParticipantRole = "host" | "participant";
export type ParticipantStatus = "waiting" | "admitted" | "rejected" | "removed";

export interface Profile {
  id: string;
  name: string;
  email: string; // PRIVATE: Never exposed to other users
  username?: string | null;
  public_user_id?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  status?: string | null;
  last_seen?: string | null;
  created_at: string;
}

export interface PublicProfile {
  id: string;
  name: string;
  username: string;
  public_user_id: string;
  avatar_url: string | null;
  bio: string | null;
  status: string | null;
}

export interface Meeting {
  id: string;
  meeting_id: string;
  title: string;
  host_id: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: MeetingStatus;
  locked: boolean;
  waiting_room_enabled: boolean;
  duration_minutes: number;
  expires_at: string | null;
  time_warning_sent: boolean;
  has_password?: boolean;
  created_at: string;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string | null;
  display_name: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  mic_enabled: boolean;
  camera_enabled: boolean;
  screen_sharing: boolean;
  joined_at: string;
  left_at: string | null;
}

export interface ChatMessage {
  id: string;
  meeting_id: string;
  sender_id: string | null;
  sender_name: string;
  message: string;
  created_at: string;
}

export type ConversationType = "private" | "group";
export type MemberRole = "owner" | "admin" | "member";

export interface ChatConversation {
  id: string;
  type: ConversationType;
  name?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  invite_code?: string | null;
  invite_enabled?: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Computed / Joined properties for UI
  other_member?: PublicProfile | null;
  members?: ChatMember[];
  last_message?: DirectMessage | null;
  unread_count?: number;
  is_blocked?: boolean;
  cleared_at?: string | null;
}

export interface ChatMember {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MemberRole;
  unread_count: number;
  joined_at: string;
  profile?: PublicProfile | null;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  text: string | null;
  media_url?: string | null;
  media_type?: string | null;
  meeting_id?: string | null;
  reply_to_id?: string | null;
  reactions?: any[];
  deleted_for_everyone?: boolean;
  read_at?: string | null;
  created_at: string;
  sender?: PublicProfile | null;
  meeting?: Meeting | null;
}

export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "closed";

/** A participant as rendered by the meeting room (local or remote). */
export interface MediaParticipant {
  id: string;
  participantId?: string | null;
  userId?: string | null;
  displayName: string;
  role: ParticipantRole;
  isLocal: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing?: boolean;
  connectionState?: PeerConnectionState;
  stream: MediaStream | null;
}
