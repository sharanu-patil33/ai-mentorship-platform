# MeetSpace Email Privacy & Security Protections

This document details the security guarantees and email privacy controls implemented across MeetSpace.

## Privacy Model

| Information Type | Public Visibility | Accessibility |
|---|---|---|
| **Display Name** | Public | Visible in meetings, chat, and search |
| **@username** | Public | Searchable & visible in profiles & chat |
| **Public User ID** | Public | Searchable (e.g. `MS-7K4P92`) |
| **Avatar URL** | Public | Visible in meetings, chat, and search |
| **Bio & Status** | Public | Visible in user profiles |
| **Email Address** | **STRICTLY PRIVATE** | Visible **ONLY** to account owner & backend auth |

---

## Technical Safeguards

1. **Query Masking**: Frontend search calls `search_public_profiles()` RPC function which omits the `email` column entirely.
2. **Account Menu Protection**: The account menu displays Display Name, `@username`, and `Public User ID`, keeping email addresses hidden.
3. **No Email Search**: Users cannot search for people using email addresses; search accepts only `@username` or `Public User ID`.
4. **Group & Direct Chat Member Cards**: Display names and usernames are used across all member cards instead of emails.
