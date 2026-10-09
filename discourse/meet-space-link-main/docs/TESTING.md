# MeetSpace 1-to-1 Video Calling — Audit & Verification Guide

This document summarizes the architecture, state machine, testing verification steps, and audit report for the **1-to-1 person-to-person video calling system inside MeetSpace Chat**.

---

## 1. Call Architecture & Flow

```text
User A (Chat with User B)
  │
  ├─► Click 🎥 Video Call
  │      ↓
  │   [State: CALLING] (Outgoing ringtone plays)
  │      ↓
  │   Broadcast `incoming_call` on GLOBAL_CALL_TOPIC & BroadcastChannel
  │
  └─────► User B receives call signal across any page (/dashboard, /chat, /profile, etc.)
             ↓
          [State: RINGING] (Incoming ringtone plays + System Notification)
             ↓
          Incoming Call Screen (Display Name + Avatar ONLY, no email)
             │
             ├───────────────┬───────────────┐
             │               │               │
          ACCEPT          DECLINE         TIMEOUT (45s) / CANCEL
             │               │               │
             ↓               ↓               ↓
        [CONNECTING]     [DECLINED]      [MISSED / CANCELLED]
             ↓               ↓               ↓
        [CONNECTED]     Stop Ringtone   Stop Ringtone
      (Timer starts)    Log in Chat     Log in Chat
             │         Return to Chat  Return to Chat
             ↓
        Active Call
     (Remote Video Stage + Floating Local Preview + Controls)
             │
             ↓
         End Call
             │
             ↓
   [State: ENDED] -> Log call duration in Chat -> Return to Chat
```

---

## 2. Call State Machine

```text
                 ┌───────────┐
                 │   IDLE    │
                 └─────┬─────┘
                       │
                 Start Call
                       ↓
                 ┌───────────┐
                 │  CALLING  │
                 └─────┬─────┘
                       │
                  Recipient
                    responds
                       ↓
                ┌────────────┐
          ┌─────│   RINGING  │─────┐
          │     └────────────┘     │
       Decline                   Accept
          │                         │
          ↓                         ↓
      DECLINED                 CONNECTING
                                    │
                                    ↓
                               CONNECTED
                                    │
                              ┌─────┴─────┐
                              │           │
                           End Call   Connection lost
                              │           │
                              ↓           ↓
                            ENDED      RECONNECTING
                                          │
                                     ┌────┴────┐
                                     │         │
                                  Success    Failure
                                     │         │
                                     ↓         ↓
                                CONNECTED    ENDED
```

---

## 3. Key Components & Implementation Details

1. **Global Calling Ringer (`GlobalCallListener.tsx`)**:
   - Listens on `GLOBAL_CALL_TOPIC` (`meetspace_global_calls_v1`) and browser `BroadcastChannel`.
   - Mounted globally inside `<RootComponent>` (`__root.tsx`).
   - Rings and pops up call dialog across all pages (`/dashboard`, `/chat`, `/profile`, `/create-meeting`, `/join`, `/`).
   - Active Call Exemption: If user is currently in a call (`/meeting/...`), replies with `call_busy` signal to prevent ongoing call interruption.

2. **WebRTC Mesh Connection (`mesh.ts`)**:
   - Peer connections use STUN servers with explicit `isInitiator` flags to prevent WebRTC offer glare.
   - P2P audio and video streams connect directly between participants upon call acceptance.

3. **Calling Modals & Privacy (`CallModal.tsx`)**:
   - Displays avatar, display name, and call status (`Calling...`, `Incoming video call`, `User busy`, `No answer`).
   - Email addresses and technical UUIDs are completely hidden.

4. **1-on-1 Direct Video Stage (`$meetingId.tsx`, `VideoGrid.tsx`, `ControlBar.tsx`)**:
   - Remote participant is full-screen; local user preview is rounded in corner.
   - Meeting codes, waiting room dialogs, and time limit UI are hidden during 1-on-1 direct calls.
   - ESC key is guarded so pressing ESC does NOT accidentally terminate an active call.
   - Timer starts upon `connected` state.
   - Ending call redirects directly back to `/chat`.

5. **Call Event Logs in Chat (`MessageItem.tsx`)**:
   - Logs compact WhatsApp-style event cards inside the conversation thread (`📹 Video call — 05:42`, `📹 Missed video call`, `📹 Call declined`).

---

## 4. End-to-End Test Procedure Between Two Devices / Browsers

To test a call between two accounts (e.g. Account A "Vaibhavi" and Account B "Deepak"):

1. **Setup**:
   - Open Browser Window 1: Go to `http://10.208.16.231:8100/chat` logged in as Account A.
   - Open Browser Window 2: Go to `http://10.208.16.231:8100/dashboard` logged in as Account B.

2. **Start Call**:
   - In Window 1 (Account A), select Account B's conversation and click **🎥 Video Call** in top header.
   - Verify Window 1 shows outgoing calling modal ("Calling...") with outgoing ringtone playing.

3. **Receive & Accept Call**:
   - Verify Window 2 (Account B on `/dashboard`) plays incoming ringtone and shows incoming call modal with Account A's avatar and display name (no email).
   - In Window 2, click **🟢 Accept**.

4. **Active Video Call Stage**:
   - Verify ringtone stops immediately in both windows.
   - Verify both users transition to `http://10.208.16.231:8100/meeting/...`.
   - Verify top header shows `00:00` timer starting upon connection.
   - Verify local preview floats in corner and remote participant stage renders.

5. **End Call & Return to Chat**:
   - In Window 1 or 2, click red **End Call** button.
   - Verify both users return directly to `/chat`.
   - Verify chat history contains compact call log item `📹 Video call — 00:xx`.

6. **Call Decline & Busy State Test**:
   - Initiate call from A to B. Click **🔴 Decline** in Window 2. Verify ringtone stops and caller sees `Call declined`.
   - While B is in a call, initiate another call from A. Verify A receives `User is busy` modal without interrupting B's ongoing call.
