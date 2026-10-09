-- ── meetings: lifecycle + security columns ────────────────────────────────
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiting_room_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_hash text;

-- ── participants: admission status + live media flags ─────────────────────
DO $$ BEGIN
  CREATE TYPE public.participant_status AS ENUM ('waiting','admitted','rejected','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.meeting_participants
  ADD COLUMN IF NOT EXISTS status public.participant_status NOT NULL DEFAULT 'admitted',
  ADD COLUMN IF NOT EXISTS mic_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS camera_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS screen_sharing boolean NOT NULL DEFAULT false;

-- ── indexes ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS meetings_meeting_id_key ON public.meetings (meeting_id);
CREATE INDEX IF NOT EXISTS meetings_host_created_idx ON public.meetings (host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS participants_meeting_idx ON public.meeting_participants (meeting_id, joined_at);
CREATE INDEX IF NOT EXISTS participants_user_idx ON public.meeting_participants (user_id);
CREATE INDEX IF NOT EXISTS chat_meeting_created_idx ON public.chat_messages (meeting_id, created_at);

-- ── joinability: open AND unlocked ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.meeting_can_join(_meeting uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = _meeting AND m.status <> 'ended' AND m.locked = false
  )
$$;

DROP POLICY IF EXISTS participants_insert ON public.meeting_participants;
CREATE POLICY participants_insert ON public.meeting_participants
  FOR INSERT TO anon, authenticated
  WITH CHECK (((user_id IS NULL) OR (user_id = auth.uid())) AND public.meeting_can_join(meeting_id));

-- ── guest-safe lookups (security definer, exact scope) ────────────────────
DROP FUNCTION IF EXISTS public.get_meeting_by_code(text);
CREATE FUNCTION public.get_meeting_by_code(_code text)
RETURNS TABLE(
  id uuid, meeting_id text, title text, host_id uuid,
  scheduled_at timestamptz, started_at timestamptz, ended_at timestamptz,
  status public.meeting_status, locked boolean, waiting_room_enabled boolean,
  has_password boolean, created_at timestamptz, updated_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.id, m.meeting_id, m.title, m.host_id, m.scheduled_at, m.started_at, m.ended_at,
         m.status, m.locked, m.waiting_room_enabled, (m.password_hash IS NOT NULL),
         m.created_at, m.updated_at
  FROM public.meetings m
  WHERE m.meeting_id = upper(btrim(_code))
  LIMIT 1
$$;

DROP FUNCTION IF EXISTS public.list_meeting_participants(uuid);
CREATE FUNCTION public.list_meeting_participants(_meeting uuid)
RETURNS TABLE(
  id uuid, meeting_id uuid, user_id uuid, display_name text,
  role public.participant_role, status public.participant_status,
  mic_enabled boolean, camera_enabled boolean, screen_sharing boolean,
  joined_at timestamptz, left_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.meeting_id, p.user_id, p.display_name, p.role, p.status,
         p.mic_enabled, p.camera_enabled, p.screen_sharing, p.joined_at, p.left_at
  FROM public.meeting_participants p
  WHERE p.meeting_id = _meeting AND p.left_at IS NULL
  ORDER BY p.joined_at ASC
$$;

-- A waiting guest polls only their own row by its (unguessable) id.
CREATE OR REPLACE FUNCTION public.get_participant_status(_participant uuid)
RETURNS public.participant_status LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.status FROM public.meeting_participants p WHERE p.id = _participant
$$;

-- Participants may update their own media flags; hosts may admit/mute/remove.
DROP POLICY IF EXISTS participants_update_own_or_host ON public.meeting_participants;
CREATE POLICY participants_update_own_or_host ON public.meeting_participants
  FOR UPDATE TO anon, authenticated
  USING ((user_id IS NOT NULL AND user_id = auth.uid()) OR public.is_meeting_host(meeting_id, auth.uid()))
  WITH CHECK ((user_id IS NOT NULL AND user_id = auth.uid()) OR public.is_meeting_host(meeting_id, auth.uid()));

-- Guests have no auth.uid(); their own-row updates go through a definer fn.
CREATE OR REPLACE FUNCTION public.update_participant_state(
  _participant uuid, _mic boolean, _camera boolean, _screen boolean
) RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.meeting_participants
  SET mic_enabled = COALESCE(_mic, mic_enabled),
      camera_enabled = COALESCE(_camera, camera_enabled),
      screen_sharing = COALESCE(_screen, screen_sharing)
  WHERE id = _participant AND left_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.mark_participant_left(_participant uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.meeting_participants
  SET left_at = now(), screen_sharing = false
  WHERE id = _participant AND left_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.get_meeting_by_code(text) FROM public;
REVOKE ALL ON FUNCTION public.list_meeting_participants(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_participant_status(uuid) FROM public;
REVOKE ALL ON FUNCTION public.update_participant_state(uuid, boolean, boolean, boolean) FROM public;
REVOKE ALL ON FUNCTION public.mark_participant_left(uuid) FROM public;
REVOKE ALL ON FUNCTION public.meeting_can_join(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_meeting_by_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_meeting_participants(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_participant_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_participant_state(uuid, boolean, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_participant_left(uuid) TO anon, authenticated;

-- ── realtime ──────────────────────────────────────────────────────────────
ALTER TABLE public.meeting_participants REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;