# MeetSpace Chat Architecture & Real-Time Specification

## Overview
MeetSpace Chat provides production-grade 1-to-1 direct messaging, group rooms, and instant video call initiation natively integrated into MeetSpace while matching WhatsApp's real-time messaging UX standards and strictly protecting user email privacy.

---

## 1. Real-Time Conversation & Message Engine
- **Zero-Disruption Reception**: Incoming messages automatically add the conversation to the receiver's sidebar list, update the message preview + timestamp, bump the room to the top, play a single audio chime (`D5` ➔ `A5`), and display an in-app toast notification **without changing or auto-switching the receiver's current room/page context**.
- **Active Room Notification Rule**: When a user is actively viewing a conversation, incoming messages append instantly to the chat thread and mark as read with **zero audio chime or toast alert** to avoid noise.
- **Message Deduplication**: All message handlers validate unique message IDs (`msg.id`) to prevent duplicate items from WebSockets or local broadcast channels.

---

## 2. Keyboard Escape Key (`ESC`) Navigation
- **Active Room Exit**: Pressing `ESC` when inside a conversation room exits back to the **MeetSpace Chat Landing View** (`/chat`).
- **Modal Priority**: If a modal (User Search, Create Group, or Confirmation Modal) is open, `ESC` closes the modal first.
- **Navigation Safety**: If no room or modal is open, `ESC` does nothing (never logs out or breaks route navigation).

---

## 3. Conversation Actions & Header Profile Menu
- **Top-Level Delete Removal**: Generic top-level delete buttons have been removed from the chat header.
- **Interactive Recipient Header**: Clicking the recipient's Name or Avatar in the chat header opens a user profile menu:
  - **Displays**: Avatar, Display Name, `@username`, and `Public User ID` (`MS-XXXXXX`).
  - 🧹 **Clear Chat**: Clears message view for the current user (`cleared_at` timestamp filtering) with confirmation modal without deleting the room or the recipient's history.
  - 🚫 **Block / Unblock User**: Toggles user block status. When blocked:
    - Input area locks to `🚫 This contact is blocked. [Unblock]`.
    - Incoming messages from blocked user are ignored silently.

---

## 4. Email Privacy Standard
- Identity across profiles, headers, user search, member lists, and notifications is strictly restricted to `@username` and `Public User ID` (`MS-XXXXXX`).
- Email addresses are never exposed in UI or network payloads.
