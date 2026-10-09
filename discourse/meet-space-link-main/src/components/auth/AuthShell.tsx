import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Logo } from "@/components/navigation/Logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="px-6 py-6">
        <Logo />
      </div>
      <main className="flex flex-1 items-start justify-center px-6 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
        </div>
      </main>
      <div className="px-6 pb-8 text-center text-sm text-muted-foreground">
        Just here to join a meeting?{" "}
        <Link to="/join" className="font-medium text-foreground underline underline-offset-4">
          Join as a guest
        </Link>
      </div>
    </div>
  );
}