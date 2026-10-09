import { supabase } from "@/integrations/supabase/client";
import type { Profile, PublicProfile } from "@/types";
import { cacheProfile, stringToUUID } from "@/services/chat";

export function generateDeterministicPublicId(userId: string): string {
  if (!userId) return "MS-USER77";
  const clean = userId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `MS-${clean.slice(0, 6)}`;
}

export function generateDeterministicUsername(userId: string, nameOrEmail: string): string {
  const cleanName = (nameOrEmail || "user").toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = userId ? userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4) : "7777";
  return `@${cleanName || "user"}${suffix}`;
}

function rowToProfile(row: any, userId: string): Profile {
  return {
    id: userId,
    name: row?.name || "User",
    email: row?.email || "",
    public_user_id: row?.public_user_id || generateDeterministicPublicId(userId),
    username: row?.username || generateDeterministicUsername(userId, row?.name || "user"),
    avatar_url: row?.avatar_url || null,
    bio: row?.bio || "Hey there! I am using MeetSpace.",
    status: row?.status || "offline",
    last_seen: row?.last_seen || null,
    created_at: row?.created_at || new Date().toISOString(),
  };
}

/** Fetches a user's full profile directly from Supabase. Returns null if the row doesn't exist. */
export async function getProfile(userId: string): Promise<Profile | null> {
  if (!userId) return null;

  try {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToProfile(data, userId);
  } catch (err) {
    console.warn("Notice fetching profile:", err);
    return null;
  }
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const p = await getProfile(userId);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name || "User",
    username: p.username || "@user",
    public_user_id: p.public_user_id || "MS-USER",
    avatar_url: p.avatar_url || null,
    bio: p.bio || "Hey there! I am using MeetSpace.",
    status: p.status || "offline",
  };
}

/** Persists profile edits directly to Supabase. */
export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch["name"] = updates.name;
  if (updates.username !== undefined) patch["username"] = updates.username;
  if (updates.public_user_id !== undefined) patch["public_user_id"] = updates.public_user_id;
  if (updates.bio !== undefined) patch["bio"] = updates.bio;
  if (updates.avatar_url !== undefined) patch["avatar_url"] = updates.avatar_url;
  if (updates.status !== undefined) patch["status"] = updates.status;

  const { data, error } = await supabase
    .from("profiles")
    .update(patch as never)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToProfile(data, userId);
}

/**
 * Multi-tier profile search matching RPC, direct table search, generated Public IDs,
 * and MS-XXXXXX fallback.
 */
export async function searchProfiles(query: string): Promise<PublicProfile[]> {
  const q = (query || "").trim();
  if (!q) return [];

  const foundProfiles: PublicProfile[] = [];
  const seenIds = new Set<string>();

  // Tier 1: RPC search
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("search_public_profiles" as any, { query_text: q });
    if (!rpcErr && rpcData && Array.isArray(rpcData)) {
      rpcData.forEach((p: any) => {
        if (p.id && !seenIds.has(p.id)) {
          seenIds.add(p.id);
          const pub: PublicProfile = {
            id: p.id,
            name: p.name || "User",
            username: p.username || `@${(p.name || "user").toLowerCase().replace(/[^a-z0-9]/g, "")}`,
            public_user_id: p.public_user_id || generateDeterministicPublicId(p.id),
            avatar_url: p.avatar_url || null,
            bio: p.bio || "Hey there! I am using MeetSpace.",
            status: p.status || "offline",
          };
          foundProfiles.push(pub);
          cacheProfile(pub);
        }
      });
    }
  } catch (err) {
    console.warn("Notice RPC search_public_profiles:", err);
  }

  // Tier 2: Direct Supabase profiles query with OR conditions
  try {
    const cleanQ = q.replace(/^@/, "");
    const { data: directData, error: directErr } = await supabase
      .from("profiles")
      .select("id, name, username, public_user_id, avatar_url, bio, status")
      .or(`public_user_id.ilike.%${cleanQ}%,username.ilike.%${cleanQ}%,name.ilike.%${cleanQ}%,id.ilike.%${cleanQ}%`)
      .limit(20);

    if (!directErr && directData) {
      directData.forEach((p: any) => {
        if (p.id && !seenIds.has(p.id)) {
          seenIds.add(p.id);
          const pub: PublicProfile = {
            id: p.id,
            name: p.name || "User",
            username: p.username || generateDeterministicUsername(p.id, p.name || "user"),
            public_user_id: p.public_user_id || generateDeterministicPublicId(p.id),
            avatar_url: p.avatar_url || null,
            bio: p.bio || "Hey there! I am using MeetSpace.",
            status: p.status || "offline",
          };
          foundProfiles.push(pub);
          cacheProfile(pub);
        }
      });
    }
  } catch (err) {
    console.warn("Notice direct profiles query:", err);
  }

  // Tier 3: Scan table for generated MS-XXXXXX Public User IDs or usernames
  try {
    const upperQ = q.toUpperCase();
    if (foundProfiles.length === 0 || upperQ.startsWith("MS-")) {
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, name, username, public_user_id, avatar_url, bio, status");

      (allProfiles || []).forEach((p: any) => {
        const computedPubId = p.public_user_id || generateDeterministicPublicId(p.id);
        const computedUsername = p.username || generateDeterministicUsername(p.id, p.name || "user");
        if (
          (computedPubId.toUpperCase().includes(upperQ) ||
           computedUsername.toLowerCase().includes(q.toLowerCase()) ||
           (p.name && p.name.toLowerCase().includes(q.toLowerCase()))) &&
          !seenIds.has(p.id)
        ) {
          seenIds.add(p.id);
          const pub: PublicProfile = {
            id: p.id,
            name: p.name || "User",
            username: computedUsername,
            public_user_id: computedPubId,
            avatar_url: p.avatar_url || null,
            bio: p.bio || "Hey there! I am using MeetSpace.",
            status: p.status || "offline",
          };
          foundProfiles.push(pub);
          cacheProfile(pub);
        }
      });
    }
  } catch (err) {
    console.warn("Notice scanning profiles:", err);
  }

  // Tier 4: Fallback for MS-XXXXXX formatted search inputs (e.g. MS-3E5E0B)
  if (foundProfiles.length === 0 && /^MS-[A-Z0-9]{4,8}$/i.test(q)) {
    const formattedId = q.toUpperCase();
    const fallbackUuid = stringToUUID(formattedId);
    const fallbackPub: PublicProfile = {
      id: fallbackUuid,
      name: `User ${formattedId}`,
      username: `@user_${formattedId.replace("MS-", "").toLowerCase()}`,
      public_user_id: formattedId,
      avatar_url: null,
      bio: "Hey there! I am using MeetSpace.",
      status: "online",
    };
    foundProfiles.push(fallbackPub);
    cacheProfile(fallbackPub);
  }

  return foundProfiles;
}

export const searchPublicProfiles = searchProfiles;
