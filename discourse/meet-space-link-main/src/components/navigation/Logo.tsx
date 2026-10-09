import { Link } from "@tanstack/react-router";

export function Logo({ to = "/", inverted = false }: { to?: string; inverted?: boolean }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="MeetSpace home"
    >
      <span
        className={`grid size-8 place-items-center rounded-[10px] ${
          inverted ? "bg-brand text-brand-foreground" : "bg-brand text-brand-foreground"
        }`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <rect x="2" y="6" width="12" height="12" rx="3.5" fill="currentColor" />
          <path d="M16 11.2 21 8v8l-5-3.2z" fill="currentColor" opacity="0.75" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">MeetSpace</span>
    </Link>
  );
}