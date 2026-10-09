import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Video } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { MeetingCard } from "@/components/dashboard/MeetingCard";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { listMeetingsForHost, splitMeetings } from "@/services/meetings";

const TITLE = "Your meetings — MeetSpace";
const DESCRIPTION = "See upcoming and recent MeetSpace meetings, and start a new room in seconds.";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, profile } = useAuth();
  const hostName = profile?.name || user?.user_metadata?.name || (user?.email ? user.email.split("@")[0] : "You");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["meetings", user?.id],
    queryFn: () => listMeetingsForHost(user!.id),
    enabled: Boolean(user?.id),
  });

  const res = splitMeetings(data ?? []);
  const upcoming = res.upcoming || [];
  const recent = res.recent || res.past || [];

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Welcome back, {hostName.split(" ")[0]}
            </h1>
            <p className="mt-1 text-muted-foreground">
              Start a room now or pick up where you left off.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/create-meeting">
                <Plus className="size-4" aria-hidden="true" /> Create meeting
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/join">
                <Video className="size-4" aria-hidden="true" /> Join meeting
              </Link>
            </Button>
          </div>
        </section>

        {isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
            <p className="text-sm font-medium text-destructive">
              We couldn't load your meetings right now.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          {isLoading ? (
            <ListSkeleton />
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              description="Create a meeting to get a shareable code and link. Scheduled meetings show up here."
              action={
                <Button asChild size="sm">
                  <Link to="/create-meeting">Create meeting</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3">
              {upcoming.map((m) => (
                <MeetingCard key={m.id} meeting={m} hostName={hostName} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent</h2>
          {isLoading ? (
            <ListSkeleton />
          ) : recent.length === 0 ? (
            <EmptyState
              title="No meeting history yet"
              description="Meetings you've hosted will appear here once they're finished."
            />
          ) : (
            <div className="grid gap-3">
              {recent.map((m) => (
                <MeetingCard key={m.id} meeting={m} hostName={hostName} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}