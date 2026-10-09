-- Grant execute permissions on security definer functions used inside RLS policies.
-- Run this script in your Supabase Dashboard -> SQL Editor to fix "permission denied for function is_meeting_host".

GRANT EXECUTE ON FUNCTION public.is_meeting_host(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_meeting_member(uuid, uuid) TO anon, authenticated;

-- Security-definer helper for joining meetings (guest & authenticated)
CREATE OR REPLACE FUNCTION public.join_meeting(
  _meeting_id uuid,
  _user_id uuid,
  _display_name text,
  _role public.participant_role DEFAULT 'participant',
  _status public.participant_status DEFAULT 'admitted'
) RETURNS SETOF public.meeting_participants
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_participant public.meeting_participants;
BEGIN
  IF NOT public.meeting_can_join(_meeting_id) THEN
    RAISE EXCEPTION 'This meeting is locked or has ended.';
  END IF;

  INSERT INTO public.meeting_participants (
    meeting_id, user_id, display_name, role, status
  ) VALUES (
    _meeting_id, _user_id, btrim(_display_name), _role, _status
  )
  RETURNING * INTO v_participant;

  RETURN NEXT v_participant;
END;
$$;

REVOKE ALL ON FUNCTION public.join_meeting(uuid, uuid, text, public.participant_role, public.participant_status) FROM public;
GRANT EXECUTE ON FUNCTION public.join_meeting(uuid, uuid, text, public.participant_role, public.participant_status) TO anon, authenticated;
