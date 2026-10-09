# Roadmap

## Phase 1 — Foundation ✅ implemented
- UI and design system
- Authentication (sign up, sign in, logout, sessions, protected routes)
- Database schema with row level security
- Meeting creation (instant and scheduled)
- Meeting joining by code or link
- Guest joining without an account
- Documentation

## Phase 2 — WebRTC ✅ implemented
- Camera and microphone capture, device selection (`useLocalMedia`)
- MediaStream in live `ParticipantTile` and pre-join preview
- RTCPeerConnection, SDP offer/answer and ICE candidate handling (`Mesh`)
- Supabase Realtime signaling channel (`createSignaling`)
- Working multi-peer video calls

## Phase 3 — Meeting features ✅ implemented
- Multiple participants, live roster presence
- Screen sharing (with track switching & badge indicators)
- Realtime chat with broadcast and DB history persistence
- Mute and camera toggles synchronized across peers

## Phase 4 — SFU ⏳ planned
- LiveKit or Jitsi Videobridge integration
- Scalable rooms, simulcast, connection management

## Phase 5 — Advanced features 🔄 in progress
- Waiting room (host admission / rejection flow) ✅
- Enforced host controls & meeting lock (UI + DB RLS policies) ✅
- Meeting time limits (15m, 30m, 1h default, 2h, 3h, custom) ✅
- Active expiry lifecycle (`scheduled`, `waiting`, `active`, `expired`, `ended`) ✅
- 5-Minute host warning & subtle remaining-time header indicator ✅
- In-call duration extension without interrupting audio/video ✅
- Server-side timestamp validation & stale meeting cleanup RPCs ✅
- Richer meeting history and duration tracking on dashboard ✅
- Recording, raise hand ⏳

## Phase 6 — Production ⏳ planned
- Testing, security review, performance work, deployment, monitoring
