-- Migration: 20260813120000_meeting_lifecycle_and_duration.sql
-- Adds configurable meeting duration, active expiration deadline tracking, 5-minute warning flag, and lifecycle cleanup.

-- 1. Add new enum values to meeting_status if not present
DO $$ BEGIN
  ALTER TYPE public.meeting_status ADD VALUE 'waiting';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.meeting_status ADD VALUE 'expired';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add duration and expiration columns to public.meetings
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_warning_sent BOOLEAN NOT NULL DEFAULT false;

-- 3. Cleanup stale meetings function (server-authoritative time checks)
CREATE OR REPLACE FUNCTION public.cleanup_stale_meetings()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Meeting links stay active for 24 hours from creation/scheduled time.
  -- If nobody joins within 24 hours from creation -> expired
  UPDATE public.meetings
  SET status = 'expired', updated_at = now()
  WHERE status IN ('scheduled', 'waiting')
    AND started_at IS NULL
    AND now() > (COALESCE(scheduled_at, created_at) + INTERVAL '24 hours');

  -- Active meetings whose duration expires_at deadline has passed -> ended
  UPDATE public.meetings
  SET status = 'ended', ended_at = COALESCE(ended_at, now()), updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND now() >= expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_meetings() TO anon, authenticated;

-- 4. Update get_meeting_by_code to run cleanup and return meeting info with duration
CREATE OR REPLACE FUNCTION public.get_meeting_by_code(_code text)
RETURNS TABLE(
  id uuid, meeting_id text, title text, host_id uuid,
  scheduled_at timestamptz, started_at timestamptz, ended_at timestamptz,
  status public.meeting_status, locked boolean, waiting_room_enabled boolean,
  duration_minutes integer, expires_at timestamptz, time_warning_sent boolean,
  has_password boolean, created_at timestamptz, updated_at timestamptz
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Perform automated stale meeting cleanup
  PERFORM public.cleanup_stale_meetings();

  RETURN QUERY
  SELECT m.id, m.meeting_id, m.title, m.host_id, m.scheduled_at, m.started_at, m.ended_at,
         m.status, m.locked, m.waiting_room_enabled, m.duration_minutes, m.expires_at,
         m.time_warning_sent, (m.password_hash IS NOT NULL), m.created_at, m.updated_at
  FROM public.meetings m
  WHERE m.meeting_id = upper(btrim(_code))
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_meeting_by_code(text) TO anon, authenticated;

-- 5. Update join_meeting to initialize started_at, active status, and expires_at on first join
CREATE OR REPLACE FUNCTION public.join_meeting(
  _meeting_id uuid,
  _user_id uuid,
  _display_name text,
  _role public.participant_role DEFAULT 'participant',
  _status public.participant_status DEFAULT 'admitted'
) RETURNS SETOF public.meeting_participants
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_meeting public.meetings;
  v_participant public.meeting_participants;
BEGIN
  -- Perform stale cleanup first
  PERFORM public.cleanup_stale_meetings();

  SELECT * INTO v_meeting FROM public.meetings WHERE id = _meeting_id;
  IF v_meeting.id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found.';
  END IF;

  IF v_meeting.status = 'ended' THEN
    RAISE EXCEPTION 'This meeting has ended.';
  END IF;

  IF v_meeting.status = 'expired' THEN
    RAISE EXCEPTION 'This meeting has expired.';
  END IF;

  IF v_meeting.locked = true AND v_meeting.host_id <> _user_id THEN
    RAISE EXCEPTION 'This meeting is locked by the host.';
  END IF;

  -- If this is the first participant joining, transition meeting to ACTIVE and set expires_at
  IF v_meeting.started_at IS NULL THEN
    UPDATE public.meetings
    SET started_at = now(),
        status = 'active',
        expires_at = now() + (v_meeting.duration_minutes * INTERVAL '1 minute'),
        updated_at = now()
    WHERE id = _meeting_id;
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

GRANT EXECUTE ON FUNCTION public.join_meeting(uuid, uuid, text, public.participant_role, public.participant_status) TO anon, authenticated;

-- 6. RPC to allow host to extend or update meeting duration in real-time
CREATE OR REPLACE FUNCTION public.update_meeting_duration(
  _meeting_id uuid,
  _duration_minutes integer
) RETURNS TABLE(
  id uuid, duration_minutes integer, expires_at timestamptz, time_warning_sent boolean
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_meeting public.meetings;
  v_new_expires timestamptz;
  v_new_warning boolean;
BEGIN
  SELECT * INTO v_meeting FROM public.meetings WHERE id = _meeting_id;

  IF v_meeting.id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found.';
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_meeting.host_id THEN
    RAISE EXCEPTION 'Only the meeting host can change the time limit.';
  END IF;

  IF _duration_minutes < 5 OR _duration_minutes > 1440 THEN
    RAISE EXCEPTION 'Meeting duration must be between 5 minutes and 24 hours.';
  END IF;

  IF v_meeting.started_at IS NOT NULL THEN
    v_new_expires := v_meeting.started_at + (_duration_minutes * INTERVAL '1 minute');
  ELSE
    v_new_expires := NULL;
  END IF;

  -- Reset warning if new expiration is more than 5 minutes in the future
  IF v_new_expires IS NOT NULL AND (v_new_expires - now()) > INTERVAL '5 minutes' THEN
    v_new_warning := false;
  ELSE
    v_new_warning := v_meeting.time_warning_sent;
  END IF;

  UPDATE public.meetings
  SET duration_minutes = _duration_minutes,
      expires_at = v_new_expires,
      time_warning_sent = v_new_warning,
      updated_at = now()
  WHERE id = _meeting_id;

  RETURN QUERY
  SELECT m.id, m.duration_minutes, m.expires_at, m.time_warning_sent
  FROM public.meetings m
  WHERE m.id = _meeting_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_meeting_duration(uuid, integer) TO authenticated;
