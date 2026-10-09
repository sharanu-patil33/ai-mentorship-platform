import { createFileRoute } from "@tanstack/react-router";

import { platformReturnUrl, ssoErrorMessage } from "@/lib/sso";

// Login is handled by the student/mentor platform. This page only explains what to do
// (and shows why the automatic sign-in failed) instead of bouncing the user around.
export const Route = createFileRoute("/login")({
  component: NotSignedIn,
});

function NotSignedIn() {
  const detail = ssoErrorMessage();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Couldn't sign you in to MeetSpace</h1>
        <p className="text-sm text-muted-foreground">
          Open Rooms or Discourse from your dashboard so you are signed in automatically.
        </p>
        {detail && (
          <p className="break-words rounded-md border p-3 text-left text-xs">Details: {detail}</p>
        )}
        <a
          href={platformReturnUrl()}
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
