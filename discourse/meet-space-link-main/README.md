# MeetSpace

A modern video conferencing platform — **Phase 1: foundation**.

MeetSpace lets registered users create, schedule and manage meetings, and lets
anyone join an existing meeting as a guest with just a display name.

> **Phase 1 does not implement WebRTC.** The meeting room ships realistic
> placeholder tiles and controls that are structured so real media can be
> dropped in later. See `docs/WEBRTC_PLAN.md` and `docs/ROADMAP.md`.

## Features

Implemented:
- Landing page, sign up / sign in / logout, session handling (with show/hide password toggle)
- Protected routes for hosting features; public routes for joining (guests welcome)
- Real camera and microphone capture with device dropdown selectors
- Real WebRTC mesh video calls + real-time screen sharing with Presenter Mode
- Configurable Meeting Time Limits (15m, 30m, 1h default, 2h, 3h, custom)
- Active Expiry Lifecycle (`scheduled`, `waiting`, `active`, `expired`, `ended`)
- 5-Minute Host Warning & subtle remaining-time header indicator
- In-Call Duration Extension via Host Meeting Settings without interrupting audio/video
- Server-side timestamp validation & stale meeting cleanup RPCs
- Waiting Room (host admit/reject flow) & Host Meeting Lock
- Dashboard with upcoming and recent meetings, status badges, and duration limits
- Create meeting (instant or scheduled) with unique code + shareable link
- Real-time chat & participants sidebar with host mute/remove controls

## Technology stack

React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · TanStack Router/Start ·
TanStack Query · Lovable Cloud (PostgreSQL + Auth)

## Setup

```bash
bun install
bun run dev      # http://localhost:8080
bun run build    # production build
```

### Environment variables

Created and managed automatically by Lovable Cloud in `.env`:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Backend API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public client key |
| `VITE_SUPABASE_PROJECT_ID` | Project reference |

No manual secrets are required for Phase 1.

### Backend / auth setup

The database schema, grants, row level security policies and the
"create profile on signup" trigger are applied through migrations. Email +
password auth is enabled; new accounts receive a confirmation email by default.

## Project structure

```
src/
  components/
    auth/          shared auth layout
    dashboard/     meeting cards, empty states
    meeting/       room grid, tiles, controls, pre-join
    chat/          chat panel UI
    participants/  participants sidebar
    navigation/    logo, headers, footer
    ui/            shadcn primitives
  hooks/           useAuth (session + profile context)
  services/        meetings, participants, profiles, chat data access
  lib/             meeting id helpers, utils
  types/           shared TypeScript models
  routes/          file-based routes (see below)
  integrations/    generated backend client
docs/              ARCHITECTURE, DATABASE, API, WEBRTC_PLAN, ROADMAP
```

### Routes

| Route | Access |
| --- | --- |
| `/` | public landing |
| `/login`, `/signup` | public |
| `/join` | public (guests welcome) |
| `/meeting/$meetingId` | public (guests welcome) |
| `/dashboard`, `/create-meeting`, `/profile` | authenticated only |

## Current limitations

No media capture, no peer connections, no realtime chat or presence. The
participants list in the room is placeholder data; only join/leave records and
meeting data are persisted.

## Deployment and User Access

### Lovable (development) vs MeetSpace (production)

| Environment | URL shape | Who it is for | Login required |
| --- | --- | --- | --- |
| Lovable editor / preview | `lovable.dev/projects/...`, `id-preview--....lovable.app` | developers only | Lovable account + project access |
| Deployed MeetSpace app | `https://<your-app>.lovable.app` or a custom domain | end users, hosts and guests | MeetSpace account only (guests: none) |

The editor preview URL is protected by Lovable's own access control. Sharing
that URL is what makes another person see a Lovable sign-in screen. It is a
developer URL, not the application. Never share it with end users.

### How to deploy

1. Open the project in Lovable and click **Publish** (top right).
2. Lovable builds and deploys the app and shows the public URL, e.g.
   `https://meetspace.lovable.app`.
3. Optionally connect a custom domain in **Project settings → Domains**.
4. Re-publish after frontend changes; database and backend changes go live
   immediately.

### How to obtain the public URL

It is shown in the Publish dialog after the first publish, and afterwards in
**Project settings → Domains**. Only that URL (and any custom domain) should
ever be shared.

### Sharing a meeting

Meeting links are built from the origin the host is currently on
(`src/lib/meeting-id.ts`). Create meetings from the **published** site so the
generated link looks like:

```
https://<your-app>.lovable.app/meeting/ABC-123-XYZ
```

If you create a meeting inside the editor preview, the link carries the preview
origin and the recipient hits Lovable's access gate. Copy the code and use it on
the public URL instead.

### How guests join

1. Guest opens the meeting link (or `/join` and types the code).
2. MeetSpace loads directly — no Lovable account, workspace, subscription or
   project permission is involved.
3. Guest enters a display name and continues to the pre-join screen.
4. Guest joins; a `meeting_participants` row is written with `user_id = NULL`.

### Who needs to authenticate

| Action | Account needed |
| --- | --- |
| Browse the landing page | no |
| Join a meeting by link or code | no (guest, display name only) |
| Create / schedule a meeting | yes — MeetSpace sign up + sign in |
| Dashboard, profile, host controls | yes |

Authentication is MeetSpace's own (Lovable Cloud / Supabase email + password).
It has nothing to do with a Lovable account.
"# Meet_space" 
