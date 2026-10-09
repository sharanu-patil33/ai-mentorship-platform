# Meeting Lifecycle Architecture & Expiry Specification

This document defines the server-authoritative meeting lifecycle, duration limits, active countdown model, 5-minute host warning, in-call extension, and stale meeting cleanup mechanism in **MeetSpace**.

---

## 1. Meeting Statuses

At any point in time, a meeting is in exactly one of the following 5 statuses:

| Status | Description | Joinable? |
| :--- | :--- | :--- |
| `scheduled` | Created for a future `scheduled_at` timestamp. | Yes (if scheduled start window is open). |
| `waiting` | Created for immediate use, waiting for the first participant to join. | Yes (within allowed `duration_minutes` window). |
| `active` | At least one participant has joined. Expiration timer is active based on `started_at + duration_minutes`. | Yes (unless meeting is locked by host). |
| `expired` | Created or scheduled, but nobody joined within the allowed time limit. | **No** (Displays "This meeting has expired"). |
| `ended` | Active meeting reached its deadline or host manually ended the room. | **No** (Displays "This meeting has ended"). |

---

## 2. Meeting Lifecycle Diagram

```text
                 CREATE
                   │
         ┌─────────┴─────────┐
         │ (scheduled_at)    │ (immediate)
         ↓                   ↓
     SCHEDULED            WAITING
         │                   │
         └─────────┬─────────┘
                   │
          ┌────────┴────────┐
          │                 │
       First             Nobody
    participant           joins
       joins                │
          │                 ↓
          ↓              EXPIRED
       ACTIVE
          │
     ┌────┴────────┐
     │             │
  Host extends   Deadline
   duration      reached
     │             │
     │             ↓
     │          WARNING (at 5m remaining)
     │             │
     │             ↓
     │           ENDED
     │
     └──────────→ ACTIVE (New deadline)
```

---

## 3. Unused vs Active Expiry Model

### Case A — Unused Meeting (Nobody Joins)
* **Creation Timestamp**: `created_at` or `scheduled_at`.
* **Behavior**: Meeting links stay active and joinable for **24 hours** from creation (`created_at`). If `started_at` remains `NULL` and `now() > COALESCE(scheduled_at, created_at) + INTERVAL '24 hours'`, the meeting transitions to **`expired`**.
* **Result**: Meeting link/code remains joinable for 24 hours. After 24 hours without joins, it shows *"This meeting has expired"*.

### Case B — Active Meeting (First Participant Joins)
* **Start Trigger**: When the first participant joins, `started_at` is set to `now()`, `status` transitions to **`active`**, and the authoritative deadline is calculated:
  $$\text{expires\_at} = \text{started\_at} + (\text{duration\_minutes} \times \text{1 minute})$$
* **Remaining Time**: Calculated as:
  $$\text{remaining\_seconds} = \max(0, \lfloor \text{expires\_at} - \text{now()} \rfloor)$$

---

## 4. Five-Minute Host Warning & In-Call Extension

### 5-Minute Warning
When $\text{remaining\_seconds} \le 300$ (5 minutes) and $\text{time\_warning\_sent} = \text{false}$:
* The host receives a single toast notification:
  > *"Time exceeding meeting will be ended in 5mins, if you need to continue the meeting then change the time limit settings of the meeting"*
* `time_warning_sent` is set to `true` to avoid repeated spam.

### In-Call Duration Extension
* The host clicks **`More (...) → Meeting Settings (Time limit)`** in the bottom control bar.
* Host selects a new duration (e.g. `120 minutes`).
* Invokes server RPC `update_meeting_duration(_meeting_id, _duration_minutes)`.
* Recalculates $\text{expires\_at} = \text{started\_at} + \text{new\_duration\_minutes}$.
* If the new deadline is $> 5\text{ minutes}$ away, resets `time_warning_sent = false`.
* Broadcasts Realtime host command `duration_updated` to all connected participants.
* **Zero Disruption**: WebRTC mesh, audio, video, and screen sharing continue 100% uninterrupted!

---

## 5. Server-Side Time Validation & Cleanup

Frontend countdown timers are purely for UI rendering. Actual expiration enforcement is validated server-side:
* RPC `cleanup_stale_meetings()` executes server-side checks against PostgreSQL `now()`.
* Automatically invoked on meeting lookups, listing, and participant joins.
