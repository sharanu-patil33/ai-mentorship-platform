# Logical API contract

Phase 1 calls the database directly through `src/services/*`. This document
describes the operations the frontend depends on, so they can move behind
server functions later without changing the UI.

## Authentication
- `signUp(name, email, password)` -> session or "confirm your email"
- `signIn(email, password)` -> session
- `signOut()` -> void
- `getSession()` / `onAuthStateChange()` -> current user
- `getProfile(userId)` -> Profile
- `updateProfile(userId, { name, avatar_url })` -> Profile

## Create meeting
`createMeeting({ title, scheduledAt?, hostId, waitingRoomEnabled?, durationMinutes? })` -> Meeting
Generates a unique `meeting_id`, sets `host_id`, status `scheduled` when a date is given, otherwise `waiting`, with optional `waiting_room_enabled` setting and `duration_minutes` (default 60). Requires authentication.

## Get meeting
`getMeetingByCode(code)` -> Meeting | null. Public; used by guests to validate a link before pre-join screen. Evaluates server-side stale cleanup (`cleanup_stale_meetings()`) and returns `duration_minutes`, `expires_at`, `time_warning_sent`, `locked`, `waiting_room_enabled`, and `status`.

## Join meeting
`joinMeeting({ meetingId, userId | null, displayName, role?, status? })` -> MeetingParticipant.
Guests pass `userId: null`. First participant join transitions meeting status to `active` and sets `expires_at = started_at + duration_minutes`. Returns row with `status: 'waiting' | 'admitted'`.

## Participant Status, Host Controls & Time Limits
- `getParticipantStatus(participantId)` -> ParticipantStatus
- `updateParticipantStatus(participantId, status)` -> void
- `updateMeetingLock(meetingId, locked)` -> void
- `updateWaitingRoom(meetingId, enabled)` -> void
- `updateMeetingDuration(meetingId, durationMinutes)` -> { duration_minutes, expires_at, time_warning_sent } (Host only)
- `cleanupStaleMeetings()` -> void (Server RPC)

## Leave meeting
`leaveMeeting(participantId)` -> void. Sets `left_at`.

## Get participants
`listParticipants(meetingId)` -> MeetingParticipant[] ordered by `joined_at`.

## Send & Get chat messages
- `sendMessage({ meetingId, senderId | null, senderName, message })` -> ChatMessage.
- `listMessages(meetingId)` -> ChatMessage[] ordered by `created_at`.

## End meeting
`updateMeetingStatus(meetingId, 'ended')` -> void. Host only (enforced by RLS).
`deleteMeeting(id)` removes the meeting and cascades participants and messages.

## Errors
Every operation throws an `Error` carrying the backend message. UI surfaces:
loading, empty, not found, unauthorized, and generic failure states.
