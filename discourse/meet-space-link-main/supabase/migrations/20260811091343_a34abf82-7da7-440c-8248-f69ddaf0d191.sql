-- Helper: is the meeting open (not ended)?
CREATE OR REPLACE FUNCTION public.meeting_is_open(_meeting uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = _meeting AND m.status <> 'ended')
$$;

-- Helper: has the current user joined this meeting?
CREATE OR REPLACE FUNCTION public.is_meeting_member(_meeting uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants p
    WHERE p.meeting_id = _meeting AND p.user_id = _user
  )
$$;

-- MEETINGS: no more blanket public read
DROP POLICY IF EXISTS meetings_select_public ON public.meetings;
CREATE POLICY meetings_select_own ON public.meetings
  FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR public.is_meeting_member(id, auth.uid()));

-- Code-based lookup for guests and members (exact code required)
CREATE OR REPLACE FUNCTION public.get_meeting_by_code(_code text)
RETURNS TABLE (
  id uuid, meeting_id text, title text, host_id uuid,
  scheduled_at timestamptz, status public.meeting_status,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.meeting_id, m.title, m.host_id, m.scheduled_at, m.status, m.created_at, m.updated_at
  FROM public.meetings m
  WHERE m.meeting_id = upper(btrim(_code))
  LIMIT 1
$$;

-- PARTICIPANTS: scoped reads only
DROP POLICY IF EXISTS participants_select ON public.meeting_participants;
CREATE POLICY participants_select_own ON public.meeting_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_meeting_host(meeting_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.list_meeting_participants(_meeting uuid)
RETURNS TABLE (
  id uuid, meeting_id uuid, user_id uuid, display_name text,
  role public.participant_role, joined_at timestamptz, left_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.meeting_id, p.user_id, p.display_name, p.role, p.joined_at, p.left_at
  FROM public.meeting_participants p
  WHERE p.meeting_id = _meeting
  ORDER BY p.joined_at ASC
$$;

-- Guests/members may only register themselves into a live meeting
DROP POLICY IF EXISTS participants_insert ON public.meeting_participants;
CREATE POLICY participants_insert ON public.meeting_participants
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    ((user_id IS NULL) OR (user_id = auth.uid()))
    AND public.meeting_is_open(meeting_id)
  );

-- CHAT: scoped reads only
DROP POLICY IF EXISTS chat_select ON public.chat_messages;
CREATE POLICY chat_select_own ON public.chat_messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR public.is_meeting_host(meeting_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.list_meeting_messages(_meeting uuid)
RETURNS TABLE (
  id uuid, meeting_id uuid, sender_id uuid, sender_name text,
  message text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.meeting_id, c.sender_id, c.sender_name, c.message, c.created_at
  FROM public.chat_messages c
  WHERE c.meeting_id = _meeting
  ORDER BY c.created_at ASC
$$;

DROP POLICY IF EXISTS chat_insert ON public.chat_messages;
CREATE POLICY chat_insert ON public.chat_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    ((sender_id IS NULL) OR (sender_id = auth.uid()))
    AND public.meeting_is_open(meeting_id)
  );

-- PROFILES: own row only
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

REVOKE EXECUTE ON FUNCTION public.meeting_is_open(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_meeting_member(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_by_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_meeting_participants(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_meeting_messages(uuid) TO anon, authenticated;