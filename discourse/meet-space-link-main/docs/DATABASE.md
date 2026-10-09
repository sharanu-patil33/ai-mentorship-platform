# Database

```
auth.users
   | 1:1
profiles(id) ----< meetings(host_id)
                        | 1:N            | 1:N
                        v                v
        meeting_participants        chat_messages
```

## profiles
Purpose: public-facing user data shown in meetings.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK, FK -> auth.users(id) ON DELETE CASCADE |
| name | text | not null, default '' |
| email | text | not null, default '' |
| avatar_url | text | nullable |
| created_at / updated_at | timestamptz | not null, default now() |

Created automatically by the `handle_new_user` trigger on signup.

RLS: any signed-in user can read profiles; you can insert/update only your own row.

## meetings
Purpose: the meeting record, lifecycle timestamps, security settings, and shareable code.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| meeting_id | text | UNIQUE — human code `ABC-123-XYZ` |
| title | text | not null |
| host_id | uuid | FK -> auth.users(id) ON DELETE CASCADE |
| scheduled_at | timestamptz | nullable |
| started_at | timestamptz | nullable — set on first participant join |
| ended_at | timestamptz | nullable — set when meeting ends |
| status | meeting_status enum | scheduled \| waiting \| active \| expired \| ended |
| locked | boolean | default false — when true, new participants cannot join |
| waiting_room_enabled | boolean | default false — when true, guests enter waiting room |
| duration_minutes | integer | default 60 — configurable time limit in minutes |
| expires_at | timestamptz | nullable — calculated as `started_at + duration_minutes` |
| time_warning_sent | boolean | default false — tracks 5-minute host warning state |
| created_at / updated_at | timestamptz | not null |

Indexes: `host_id`, `scheduled_at`, `status`, unique `meeting_id`, `(host_id, created_at DESC)`.

RLS: readable by host and meeting members (guests lookup via `get_meeting_by_code`);
insert/update/delete restricted to `host_id = auth.uid()`.

## meeting_participants
Purpose: attendance records, admission status, and live media state.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| meeting_id | uuid | FK -> meetings(id) ON DELETE CASCADE |
| user_id | uuid | nullable FK -> auth.users(id) — NULL for guests |
| display_name | text | not null |
| role | participant_role enum | host \| participant |
| status | participant_status enum | waiting \| admitted \| rejected \| removed |
| mic_enabled | boolean | default true |
| camera_enabled | boolean | default true |
| screen_sharing | boolean | default false |
| joined_at | timestamptz | not null, default now() |
| left_at | timestamptz | nullable |

Indexes: `meeting_id`, `user_id`, `(meeting_id, joined_at)`.

RLS: readable by host and own row; inserts allowed if `meeting_can_join` (open + unlocked); updates permitted for own row or meeting host. Guests update media state via `update_participant_state` definer function. Host admits/rejects via `updateParticipantStatus`.

## chat_messages
Purpose: meeting chat storage (UI wired in a later phase).

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| meeting_id | uuid | FK -> meetings(id) ON DELETE CASCADE |
| sender_id | uuid | nullable FK -> auth.users(id) — NULL for guests |
| sender_name | text | not null |
| message | text | not null |
| created_at | timestamptz | not null, default now() |

Index: `(meeting_id, created_at)`.

RLS: readable per meeting; inserts must be a guest message or attributed to the
acting user.

## Access model update (guest-safe reads)

Blanket public `SELECT` on `meetings`, `meeting_participants` and
`chat_messages` was removed. Reads are now:

| Data | Signed-in user | Guest |
| --- | --- | --- |
| `meetings` | own hosted meetings + meetings joined | only via `get_meeting_by_code(_code)` — exact code required |
| `meeting_participants` | own rows + rows of meetings they host | only via `list_meeting_participants(_meeting)` |
| `chat_messages` | own messages + messages in hosted meetings | only via `list_meeting_messages(_meeting)` |
| `profiles` | own profile only | no access |

Writes: anyone may insert a participant row or chat message for themselves
(`user_id`/`sender_id` is `NULL` for guests or must equal `auth.uid()`), and
only while the meeting is not `ended`. Meeting update/delete stays host-only.
RLS remains enabled on every table.
