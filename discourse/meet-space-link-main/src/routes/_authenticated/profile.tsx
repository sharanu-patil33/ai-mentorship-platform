import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Copy,
  Check,
  KeyRound,
  Eye,
  EyeOff,
  MessageSquare,
  Video,
  Users,
  Calendar,
} from "lucide-react";

import { AppHeader, initialsOf } from "@/components/navigation/AppHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { updateProfile, generateDeterministicPublicId, generateDeterministicUsername } from "@/services/profiles";
import { getUserConversations } from "@/services/chat";
import { startMeetingFromChat } from "@/services/chatMeetings";
import { supabase } from "@/integrations/supabase/client";
import type { ChatConversation, Profile } from "@/types";

const TITLE = "Your Profile & Privacy — MeetSpace";
const DESCRIPTION = "Manage your display name, username, public user ID, chat connections, and password settings in MeetSpace.";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();

  // Fallback profile if profile row is still syncing
  const activeProfile = useMemo<Profile>(() => {
    if (profile && profile.public_user_id && profile.public_user_id !== "MS-USER") return profile;

    const emailName = user?.email ? user.email.split("@")[0] : "user";
    const displayName = profile?.name || user?.user_metadata?.name || emailName || "MeetSpace User";

    return {
      id: user?.id || "",
      name: displayName,
      email: user?.email || "",
      username: profile?.username && profile.username !== "@user" ? profile.username : generateDeterministicUsername(user?.id || "", displayName),
      public_user_id: profile?.public_user_id && profile.public_user_id !== "MS-USER" ? profile.public_user_id : generateDeterministicPublicId(user?.id || ""),
      avatar_url: profile?.avatar_url ?? null,
      bio: profile?.bio || "Hey there! I am using MeetSpace.",
      status: "online",
      last_seen: new Date().toISOString(),
      created_at: profile?.created_at || new Date().toISOString(),
    };
  }, [profile, user]);

  // Profile Form State
  const [name, setName] = useState(activeProfile.name || "");
  const [username, setUsername] = useState(activeProfile.username || "");
  const [bio, setBio] = useState(activeProfile.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(activeProfile.avatar_url ?? "");
  const [copiedId, setCopiedId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Chat Connections State
  const [connections, setConnections] = useState<ChatConversation[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // Change Password State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [updatingPass, setUpdatingPass] = useState(false);

  // Auto-sync generated Public User ID and Username to database on load if missing
  useEffect(() => {
    if (user && (!profile?.public_user_id || profile.public_user_id === "MS-USER")) {
      void updateProfile(user.id, {
        name: activeProfile.name,
        username: activeProfile.username,
        public_user_id: activeProfile.public_user_id,
        bio: activeProfile.bio,
      }).then(() => void refreshProfile());
    }
  }, [user, profile, activeProfile, refreshProfile]);

  useEffect(() => {
    setName(activeProfile.name || "");
    setUsername(activeProfile.username || "");
    setBio(activeProfile.bio || "");
    setAvatarUrl(activeProfile.avatar_url ?? "");
  }, [activeProfile]);

  useEffect(() => {
    if (!user) return;
    async function loadConnections() {
      try {
        const data = await getUserConversations(user!.id);
        setConnections(data);
      } catch (err) {
        console.error("Error loading chat connections:", err);
      } finally {
        setLoadingConnections(false);
      }
    }
    void loadConnections();
  }, [user]);

  async function onSubmitProfile(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Your name needs at least 2 characters.");
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const cleanUsername = username.trim()
        ? username.trim().startsWith("@")
          ? username.trim()
          : `@${username.trim()}`
        : undefined;

      await updateProfile(user.id, {
        name: name.trim(),
        username: cleanUsername,
        public_user_id: activeProfile.public_user_id,
        bio: bio.trim(),
        avatar_url: avatarUrl.trim() || null,
      });
      await refreshProfile();
      toast.success("Profile & Public Identity updated!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setPassError(null);

    if (newPassword.length < 8) {
      setPassError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError("Passwords do not match.");
      return;
    }

    setUpdatingPass(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPassError(updateError.message);
      } else {
        toast.success("Password updated successfully!");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      setPassError(err.message || "Failed to update password.");
    } finally {
      setUpdatingPass(false);
    }
  }

  async function handleCopyId() {
    const textToCopy = activeProfile.public_user_id || "MS-USER";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      toast.success(`Copied "${textToCopy}" to clipboard!`);
    } catch {
      toast.error("Failed to copy automatically.");
    }
  }

  async function handleStartCallFromProfile(convo: ChatConversation) {
    if (!user) return;
    const title = convo.type === "group" ? convo.name : `Call with ${convo.other_member?.name || "Member"}`;
    const meeting = await startMeetingFromChat(convo.id, user.id, title || "Instant Meeting");
    void navigate({ to: "/meeting/$meetingId", params: { meetingId: meeting.meeting_id } });
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
        {/* 1. Account Details & Public Identity Card */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-[var(--shadow-card)] space-y-6">
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Your Account & Public Identity</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your display name, unique @username, public user ID, and profile details.
            </p>
          </div>

          {/* Privacy Banner */}
          <div className="flex items-start gap-3 rounded-xl bg-brand-soft/70 p-4 border border-brand/20 text-brand-dark text-xs">
            <ShieldCheck className="size-5 shrink-0 text-brand mt-0.5" />
            <div>
              <p className="font-bold text-sm">Strict Email Privacy Guarantee</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">
                Your email address (<code>{user?.email}</code>) is strictly private. It is never displayed to other users in search, meetings, or chat. Other users find you exclusively via your <strong>@username</strong> or <strong>Public User ID</strong>.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmitProfile} className="space-y-6" noValidate>
            <div className="flex flex-wrap items-center gap-5 p-4 rounded-xl bg-muted/40 border border-border">
              <Avatar className="size-20 border-2 border-brand/30 shrink-0">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-brand-soft text-xl font-bold text-brand-dark">
                  {initialsOf(name || activeProfile.email)}
                </AvatarFallback>
              </Avatar>

              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-bold text-lg text-foreground truncate">{activeProfile.name}</p>
                <p className="text-sm text-brand font-semibold">{activeProfile.username || "@user"}</p>
                
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-mono font-bold text-foreground border border-border">
                    Unique ID: {activeProfile.public_user_id || "MS-USER"}
                  </span>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={handleCopyId}>
                    {copiedId ? <Check className="size-3.5 mr-1 text-emerald-600" /> : <Copy className="size-3.5 mr-1 text-brand" />}
                    {copiedId ? "Copied" : "Copy ID"}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1">
                  <Calendar className="size-3.5" /> Member since {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(activeProfile.created_at))}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Display Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="username">Public @username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@vaibhavi0777"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bio">About / Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Hey there! I am using MeetSpace."
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="avatar">Avatar Image URL</Label>
              <Input
                id="avatar"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand-dark">
              {saving ? "Saving changes…" : "Save Profile Details"}
            </Button>
          </form>
        </div>

        {/* 2. Chat Connections & Contacts Section */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold font-display text-foreground flex items-center gap-2">
                <MessageSquare className="size-5 text-brand" /> Chat Connections & Contacts
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                People and group rooms you have connected with in MeetSpace.
              </p>
            </div>
            <span className="text-xs font-bold bg-brand-soft text-brand-dark px-2.5 py-1 rounded-full">
              {connections.length} Connections
            </span>
          </div>

          {loadingConnections ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : connections.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl bg-muted/20">
              <Users className="size-8 mx-auto text-muted-foreground/60 mb-2" />
              <p className="font-semibold text-foreground">No chat connections yet</p>
              <p className="text-xs max-w-sm mx-auto mt-1">
                Start a conversation in <Link to="/chat" className="text-brand underline font-medium">Chat</Link> by searching someone's <strong>@username</strong> or <strong>Public User ID</strong>!
              </p>
            </div>
          ) : (
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              {connections.map((convo) => {
                const isGroup = convo.type === "group";
                const title = isGroup ? convo.name || "Group Room" : convo.other_member?.name || "Private Chat";
                const handle = isGroup ? convo.description : convo.other_member?.username;
                const publicId = convo.other_member?.public_user_id;

                return (
                  <div
                    key={convo.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-background hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-10 shrink-0">
                        {convo.avatar_url || convo.other_member?.avatar_url ? (
                          <AvatarImage src={convo.avatar_url || convo.other_member?.avatar_url || ""} />
                        ) : null}
                        <AvatarFallback className="bg-brand-soft text-xs font-bold text-brand-dark">
                          {isGroup ? <Users className="size-4" /> : initialsOf(title)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold truncate text-foreground leading-tight">{title}</p>
                        <p className="text-xs text-brand font-medium truncate leading-tight">{handle}</p>
                        {publicId && (
                          <p className="text-[10px] text-muted-foreground font-mono leading-tight">
                            ID: {publicId}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-brand hover:bg-brand-soft"
                        title="Open Chat"
                        onClick={() => void navigate({ to: "/chat" })}
                      >
                        <MessageSquare className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-brand hover:bg-brand-soft"
                        title="Start Instant Video Meeting"
                        onClick={() => void handleStartCallFromProfile(convo)}
                      >
                        <Video className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Security & Change Password Section */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-[var(--shadow-card)] space-y-4">
          <div>
            <h2 className="text-xl font-bold font-display text-foreground flex items-center gap-2">
              <KeyRound className="size-5 text-brand" /> Security & Change Password
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Update your account password securely. Passwords update automatically upon saving.
            </p>
          </div>

          <form onSubmit={onChangePassword} className="space-y-4 pt-2" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPass ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>

            {passError ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {passError}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={updatingPass || !newPassword || !confirmPassword}
              variant="outline"
              className="border-brand text-brand hover:bg-brand-soft"
            >
              {updatingPass ? "Updating Password…" : "Update Password"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}