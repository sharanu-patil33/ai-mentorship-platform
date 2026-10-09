# WebRTC plan (not implemented yet)

## WebRTC
A browser API set for direct, low-latency audio/video/data between peers.

## MediaStream
`navigator.mediaDevices.getUserMedia({ video, audio })` returns a `MediaStream`
of local tracks. It will feed the local tile in `ParticipantTile` and the
pre-join camera preview.

## RTCPeerConnection
One connection per remote peer. Local tracks are added with `addTrack`; remote
tracks arrive via the `track` event and become a remote `MediaStream`.

## SDP offer/answer
The caller creates an offer (`createOffer` -> `setLocalDescription`), the callee
answers (`setRemoteDescription` -> `createAnswer` -> `setLocalDescription`).
Both descriptions travel over the signalling channel.

## ICE candidates
Each side gathers candidate network paths and trickles them to the peer, which
adds them with `addIceCandidate` until a working path is selected.

## Signalling
WebRTC does not define transport for SDP/ICE. MeetSpace will use a realtime
channel keyed by `meetings.meeting_id`, with membership derived from
`meeting_participants`.

## STUN
Discovers the client's public address behind NAT. Public STUN servers are
sufficient for most networks.

## TURN
Relays media when direct connectivity fails (symmetric NAT, strict firewalls).
Requires a hosted, credentialed TURN service.

## Mesh architecture
Every participant connects to every other: N participants means N-1 uplinks
each. Simple and serverless, but upload bandwidth and CPU grow linearly — fine
for 2-4 people.

## SFU architecture
Clients publish once to a Selective Forwarding Unit, which forwards streams to
subscribers.

```
A --\                 /--> B
B ----> [ SFU ] ---->|---> C
C --/                 \--> A
```

## Why an SFU scales better
One uplink per client regardless of room size, server-side simulcast/layer
selection, better congestion control, and a natural place to enforce host
controls, recording and moderation.

## LiveKit / Jitsi Videobridge integration
A server function will mint a short-lived room token from the meeting and
participant records, the client will join the SFU room with that token, and the
resulting track set will be mapped onto the existing `MediaParticipant` model —
so the room UI needs no structural change.
