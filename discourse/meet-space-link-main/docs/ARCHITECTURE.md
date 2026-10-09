# Architecture

## Development vs deployed application

```text
                DEVELOPMENT
                    |
                 Lovable
                    |
                    v
               MeetSpace
              Deployment
                    |
          +---------+---------+
          v                   v
     Host/User A          Guest/User B
          |                   |
          +---------+---------+
                    v
              Supabase
                    |
                    v
             Meeting Data
```

The Lovable editor and its preview URLs are a developer-only surface protected
by Lovable access control. End users only ever touch the published MeetSpace
URL, which talks straight to the backend with the public publishable key. No
end-user flow references a Lovable account, workspace or project permission.

## System overview

```
Browser (React + TanStack Router)
        |
        v
  Service layer (src/services/*)
        |
        v
Lovable Cloud (PostgreSQL + Auth, RLS enforced)
        |
        v
   Meeting / user data
```

Phase 2+ adds a parallel media path:

```
Browser  ->  WebRTC media  ->  SFU (LiveKit / Videobridge)  ->  Other participants
   |
   +-> signalling + metadata -> Lovable Cloud
```

## Frontend architecture

- **Routes** (`src/routes`) hold page composition only; no query logic.
- **Components** are grouped by domain (`meeting/`, `chat/`, `participants/`,
  `dashboard/`, `navigation/`, `auth/`). Meeting components are isolated so the
  media layer can evolve without touching the rest of the app.
- **Services** (`src/services`) are the only place that talks to the database.
- **Types** (`src/types`) describe both database rows and the UI-facing
  `MediaParticipant` model that the future media layer will produce.
- **State**: TanStack Query for server data; React context (`useAuth`) for the
  session and profile; local component state for room UI toggles.

## Authentication architecture

```
signUp/signIn  ->  Auth service  ->  session in browser storage
                                   |
                        onAuthStateChange -> AuthProvider context
                                   |
                     _authenticated route gate (ssr: false)
```

A database trigger creates a `profiles` row for every new user. The
`_authenticated` pathless layout redirects to `/login` when no user is present.
Public routes (`/`, `/join`, `/meeting/$meetingId`) never gate on a session.

## Database architecture

Four tables: `profiles`, `meetings`, `meeting_participants`, `chat_messages`.
Access is enforced with row level security (see `docs/DATABASE.md`). Meeting
rows are readable by anyone holding the code so guests can validate a link;
writes are restricted to the host or the acting user.

## Meeting creation flow

```
/create-meeting -> validate title -> generate code ABC-123-XYZ
                -> insert meetings row (host_id = current user)
                -> show code + link + copy/share/join
```

## Meeting joining flow (authenticated)

```
/join or dashboard -> lookup meeting by code -> pre-join screen
                   -> insert meeting_participants (user_id = current user)
                   -> meeting room
```

## Guest joining flow

```
/join -> code + display name -> lookup meeting
      -> pre-join screen -> insert meeting_participants (user_id = NULL)
      -> meeting room
```

No account is created and no session is required.

## Implemented WebRTC architecture

Media flow uses a native WebRTC mesh managed by `Mesh` (`src/services/webrtc/mesh.ts`):
- `useLocalMedia` captures local camera, microphone, and optional screen share (`getDisplayMedia`).
- Each peer maintains an `RTCPeerConnection` per remote participant with pre-created audio and video transceivers (`replaceTrack` is used when toggling video/screen share without renegotiation).
- `MediaParticipant.stream` feeds live `<video>` elements in `ParticipantTile`.

## Realtime & Signaling architecture

Signaling rides Supabase Realtime channels (`createSignaling` in `src/services/signaling/channel.ts`):
- **Presence**: Tracks peer IDs, display names, participant IDs, roles, mic/camera/screen state.
- **Broadcast**: Exclaims SDP offers/answers, ICE candidates, chat broadcasts, and host commands (`mute`, `remove`, `end`, `lock`, `admitted`, `duration_updated`).
- **Database synchronization**: Realtime state changes update `meeting_participants` and `chat_messages` rows.

## Meeting Lifecycle & Active Expiry Architecture

See `docs/MEETING_LIFECYCLE.md` for complete specification:
- **Statuses**: `scheduled`, `waiting`, `active`, `expired`, `ended`.
- **Unused Expiry (Case A)**: `status = 'waiting'` with nobody joining past `duration_minutes` becomes `expired`.
- **Active Expiry (Case B)**: First join triggers `started_at = now()`, `status = 'active'`, `expires_at = started_at + duration_minutes`.
- **5-Minute Warning**: Server/UI triggers host toast warning at 5m remaining (`time_warning_sent = true`).
- **In-Call Extension**: Host updates duration via `update_meeting_duration` RPC; recalculates `expires_at` and broadcasts `duration_updated` host command **without interrupting WebRTC streams**.
- **Automated Teardown**: Server RPC `cleanup_stale_meetings()` runs on lookup/list queries. Expired/ended links reject joining.

## Guest & Waiting Room joining flow

```
/join -> code + display name -> lookup meeting via get_meeting_by_code
      -> check lock (if locked & !host: block entry)
      -> pre-join screen (camera/mic preview)
      -> if waiting_room_enabled & !host:
           insert meeting_participants status='waiting'
           wait screen -> host admits via ParticipantsPanel
           status='admitted' -> enter meeting room
      -> else:
           insert meeting_participants status='admitted'
           enter meeting room
```

## Planned LiveKit / SFU architecture

Beyond ~5–6 participants, mesh peer connections stop scaling. Phase 4 replaces the mesh with an SFU: each client publishes one upstream track set and subscribes to selectively forwarded downstream tracks. Server functions mint short-lived room tokens from `meetings` and `meeting_participants` records, keeping authorization in the database.
