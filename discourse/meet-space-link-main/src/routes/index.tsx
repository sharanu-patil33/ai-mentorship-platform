import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarClock, KeyRound, MonitorUp, ShieldCheck, Users, Zap } from "lucide-react";

import { SiteFooter } from "@/components/navigation/SiteFooter";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { Button } from "@/components/ui/button";

const TITLE = "MeetSpace — Meetings with a room for every conversation";
const DESCRIPTION =
  "MeetSpace is a clean, fast meeting platform: create a room, share a link, and let anyone join as a guest — no downloads, no account required to join.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: KeyRound,
    title: "Share a code, not a hassle",
    body: "Every meeting gets a readable code like ABC-123-XYZ and a link that works anywhere.",
  },
  {
    icon: Users,
    title: "Guests join instantly",
    body: "Attendees type a display name and step into the room. No sign-up wall for participants.",
  },
  {
    icon: CalendarClock,
    title: "Plan ahead or start now",
    body: "Create an instant room or schedule one for later and keep it in your meeting list.",
  },
  {
    icon: ShieldCheck,
    title: "Access rules built in",
    body: "Hosts own their meetings. Access rules are enforced in the database, not in the browser.",
  },
  {
    icon: MonitorUp,
    title: "Room ready for media",
    body: "The meeting room, controls, chat and roster are built so live media can drop straight in.",
  },
  {
    icon: Zap,
    title: "No install, no plugins",
    body: "MeetSpace runs in the browser and stays out of the way of the conversation.",
  },
];

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
          <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Phase 1 · Foundation release
            </span>
            <h1 className="mt-6 text-4xl leading-tight font-semibold text-balance sm:text-6xl">
              A room for <span className="text-gradient-brand">every conversation</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
              MeetSpace gives your team a simple, dependable place to meet: create a room, share the
              link, and everyone lands in the same space — members and guests alike.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/create-meeting">Create meeting</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/join">Join meeting</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Joining never requires an account. Creating meetings does.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold sm:text-3xl">Built around the meeting itself</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            No dashboards full of charts. Just the pieces you need to start, share and run a
            conversation.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 py-16 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">Ready when you are</h2>
            <p className="max-w-xl text-muted-foreground">
              Create your MeetSpace account to host and schedule meetings, or jump straight into a
              room someone shared with you.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/signup">Sign up</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
