-- Unified Chat and Meetings Migration for MeetSpace

-- 1. Extend public.profiles table for Username and Public User ID
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS public_user_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT 'Hey there! I am using MeetSpace.',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS allow_group_add TEXT DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true;

-- Helper generator function for random public user ID (e.g. MS-7K4P92)
CREATE OR REPLACE FUNCTION public.generate_public_user_id()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := 'MS-';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Auto-generate username & public_user_id on profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_name TEXT;
  clean_username TEXT;
  generated_id TEXT;
BEGIN
  base_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  clean_username := '@' || lower(regexp_replace(base_name, '[^a-zA-Z0-9]', '', 'g')) || floor(random() * 8999 + 1000)::text;
  generated_id := public.generate_public_user_id();

  INSERT INTO public.profiles (id, name, email, avatar_url, username, public_user_id)
  VALUES (
    NEW.id,
    base_name,
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'avatar_url',
    clean_username,
    generated_id
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    public_user_id = EXCLUDED.public_user_id;
  RETURN NEW;
END; $$;

-- Backfill existing profiles without username or public_user_id
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, name, email FROM public.profiles WHERE username IS NULL OR public_user_id IS NULL LOOP
    UPDATE public.profiles
    SET 
      username = COALESCE(username, '@' || lower(regexp_replace(COALESCE(name, split_part(email, '@', 1), 'user'), '[^a-zA-Z0-9]', '', 'g')) || floor(random() * 8999 + 1000)::text),
      public_user_id = COALESCE(public_user_id, public.generate_public_user_id())
    WHERE id = r.id;
  END LOOP;
END $$;

-- 2. Create Chat Conversations Table
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('private', 'group')),
  name TEXT,
  description TEXT,
  avatar_url TEXT,
  invite_code TEXT UNIQUE,
  invite_enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create Chat Members Table
CREATE TABLE IF NOT EXISTS public.chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  unread_count INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- 4. Create Direct Messages Table
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  text TEXT,
  media_url TEXT,
  media_type TEXT DEFAULT 'none',
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  reply_to_id UUID REFERENCES public.direct_messages(id) ON DELETE SET NULL,
  reactions JSONB DEFAULT '[]'::jsonb,
  deleted_for_everyone BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create Blocked Users Table
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON public.chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON public.chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_convo ON public.chat_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_convo ON public.direct_messages(conversation_id, created_at ASC);

-- Grants & Row Level Security (RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_members TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_messages TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_users TO authenticated, anon;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "chat_conversations_select" ON public.chat_conversations FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "chat_conversations_insert" ON public.chat_conversations FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "chat_conversations_update" ON public.chat_conversations FOR UPDATE TO authenticated, anon USING (true);
CREATE POLICY "chat_conversations_delete" ON public.chat_conversations FOR DELETE TO authenticated, anon USING (true);

CREATE POLICY "chat_members_select" ON public.chat_members FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "chat_members_insert" ON public.chat_members FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "chat_members_update" ON public.chat_members FOR UPDATE TO authenticated, anon USING (true);
CREATE POLICY "chat_members_delete" ON public.chat_members FOR DELETE TO authenticated, anon USING (true);

CREATE POLICY "direct_messages_select" ON public.direct_messages FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "direct_messages_insert" ON public.direct_messages FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "direct_messages_update" ON public.direct_messages FOR UPDATE TO authenticated, anon USING (true);
CREATE POLICY "direct_messages_delete" ON public.direct_messages FOR DELETE TO authenticated, anon USING (true);

CREATE POLICY "blocked_users_select" ON public.blocked_users FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "blocked_users_insert" ON public.blocked_users FOR INSERT TO authenticated, anon WITH CHECK (true);

-- Privacy-Preserving Search RPC Function (NEVER exposes email)
CREATE OR REPLACE FUNCTION public.search_public_profiles(query_text TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  username TEXT,
  public_user_id TEXT,
  avatar_url TEXT,
  bio TEXT,
  status TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    p.id,
    p.name,
    COALESCE(p.username, '@user') AS username,
    COALESCE(p.public_user_id, 'MS-USER') AS public_user_id,
    p.avatar_url,
    p.bio,
    p.status
  FROM public.profiles p
  WHERE 
    LOWER(p.username) LIKE LOWER('%' || query_text || '%')
    OR LOWER(p.public_user_id) LIKE LOWER('%' || query_text || '%')
    OR LOWER(p.name) LIKE LOWER('%' || query_text || '%')
  LIMIT 20;
$$;
