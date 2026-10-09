import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SiteFooter } from "@/components/navigation/SiteFooter";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { parseMeetingInput } from "@/lib/meeting-id";
import { getMeetingByCode } from "@/services/meetings";

const TITLE = "Join a MeetSpace meeting";
const DESCRIPTION =
  "Enter a meeting code or link and a display name to join a MeetSpace meeting — no account needed.";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: `${TITLE} — MeetSpace` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: JoinPage,
});

export const DISPLAY_NAME_KEY = "meetspace.display-name";

function JoinPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [code, setCode] = useState("");
  const accountName = profile?.name || user?.user_metadata?.name || (user?.email ? user.email.split("@")[0] : "");
  const [displayName, setDisplayName] = useState(accountName || "");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (accountName && (!displayName || displayName === accountName)) {
      setDisplayName(accountName);
    }
  }, [accountName]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const queryName = searchParams.get("name");
      const queryCode = searchParams.get("code");
      if (queryName && !displayName) {
        setDisplayName(queryName);
      }
      if (queryCode && !code) {
        setCode(queryCode);
      }
    }
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = parseMeetingInput(code);
    if (!parsed) {
      setError("Please enter a valid meeting code or link (e.g. ABC-123-XYZ).");
      return;
    }

    const name = (user ? accountName || displayName : displayName).trim();
    if (!user && name.length < 2) {
      setError("Enter a display name so people know who joined.");
      return;
    }

    setChecking(true);
    try {
      const existing = await getMeetingByCode(parsed);
      if (!existing || existing.status === "ended" || existing.status === "expired") {
        setError("Meeting not found or has already ended. Check your meeting code or create a new meeting.");
        return;
      }
      if (name) window.sessionStorage.setItem(DISPLAY_NAME_KEY, name);
      void navigate({ to: "/meeting/$meetingId", params: { meetingId: parsed } });
    } catch {
      setError("We couldn't reach the meeting service. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  const effectiveName = user ? accountName || displayName : displayName;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center bg-surface px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <h1 className="text-2xl font-semibold">Join a meeting</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Paste the meeting link or type the code the host shared with you.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="code">Meeting code or link</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. ABC-123-XYZ or paste link"
                autoFocus
              />
            </div>

            {!user ? (
              <div className="space-y-1.5">
                <Label htmlFor="name">Your display name</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex Smith"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Joining as <span className="font-medium text-foreground">{effectiveName}</span>
              </p>
            )}

            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={checking}>
              {checking ? "Connecting..." : "Join meeting"}
            </Button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}