-- ============================================================================
-- Phase 1 final recovery patch.
--
-- Given how much partial/manual execution has already happened across the
-- last two attempts, I can no longer be fully certain from here exactly
-- which policies did or didn't get created on your database. Rather than
-- keep guessing which ones are "safe to assume new," this patch guards
-- EVERY CREATE POLICY with DROP POLICY IF EXISTS first, with no exceptions.
-- That makes it safe to run regardless of your database's exact current
-- state — every DROP is a no-op if the policy isn't there, and every CREATE
-- then runs cleanly.
--
-- Excluded (per your request — these already exist and aren't touched here):
-- message_status/chat_conversations/chat_members/direct_messages/blocked_users
-- table definitions themselves, is_chat_member(), fanout_message_status() +
-- its trigger, the 5 RPCs, and their indexes.
--
-- Does not touch meetings, meeting_participants, chat_messages, or any
-- WebRTC/signaling schema.
-- ============================================================================

-- ── Enable RLS on all five tables — idempotent: re-running this on a table
-- ── that already has RLS enabled is a no-op, no error either way. This is
-- ── what was missing before; without it, the policies below exist but are
-- ── never actually enforced, which is exactly the "UNRESTRICTED" state
-- ── you're seeing in the Table Editor.
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_status ENABLE ROW LEVEL SECURITY;

-- ── message_status ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "message_status_select" ON public.message_status;
CREATE POLICY "message_status_select" ON public.message_status FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.direct_messages dm
      WHERE dm.id = message_status.message_id AND dm.sender_id = auth.uid()
    )
  );

GRANT SELECT ON public.message_status TO authenticated;

-- ── chat_conversations ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_insert" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_update" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_delete" ON public.chat_conversations;

CREATE POLICY "chat_conversations_select" ON public.chat_conversations FOR SELECT TO authenticated
  USING (public.is_chat_member(id, auth.uid()));
CREATE POLICY "chat_conversations_update" ON public.chat_conversations FOR UPDATE TO authenticated
  USING (public.is_chat_member(id, auth.uid()))
  WITH CHECK (public.is_chat_member(id, auth.uid()));

-- ── chat_members ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chat_members_select" ON public.chat_members;
DROP POLICY IF EXISTS "chat_members_insert" ON public.chat_members;
DROP POLICY IF EXISTS "chat_members_update" ON public.chat_members;
DROP POLICY IF EXISTS "chat_members_delete" ON public.chat_members;

CREATE POLICY "chat_members_select" ON public.chat_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_member(conversation_id, auth.uid()));

-- ── direct_messages ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "direct_messages_select" ON public.direct_messages;
DROP POLICY IF EXISTS "direct_messages_insert" ON public.direct_messages;
DROP POLICY IF EXISTS "direct_messages_update" ON public.direct_messages;
DROP POLICY IF EXISTS "direct_messages_delete" ON public.direct_messages;

CREATE POLICY "direct_messages_select" ON public.direct_messages FOR SELECT TO authenticated
  USING (public.is_chat_member(conversation_id, auth.uid()));
CREATE POLICY "direct_messages_insert" ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_chat_member(conversation_id, auth.uid()));
CREATE POLICY "direct_messages_update" ON public.direct_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- ── blocked_users ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "blocked_users_select" ON public.blocked_users;
DROP POLICY IF EXISTS "blocked_users_insert" ON public.blocked_users;
DROP POLICY IF EXISTS "blocked_users_delete" ON public.blocked_users;

CREATE POLICY "blocked_users_select" ON public.blocked_users FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());
CREATE POLICY "blocked_users_insert" ON public.blocked_users FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "blocked_users_delete" ON public.blocked_users FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

-- ── Grants (idempotent by nature in Postgres — safe regardless of history) ──
REVOKE ALL ON public.chat_conversations FROM anon;
REVOKE ALL ON public.chat_members FROM anon;
REVOKE ALL ON public.direct_messages FROM anon;
REVOKE ALL ON public.blocked_users FROM anon;

GRANT SELECT, UPDATE ON public.chat_conversations TO authenticated;
GRANT SELECT ON public.chat_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.direct_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;

-- ── Realtime — DO blocks already self-guard via EXCEPTION, safe either way ──
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_status REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_status;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;