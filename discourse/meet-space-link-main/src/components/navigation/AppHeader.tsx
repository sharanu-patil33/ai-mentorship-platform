import { useState, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, User as UserIcon, MessageSquare, Video, PlusCircle } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "./Logo";
import { getUserConversations } from "@/services/chat";
import { initialsOf } from "@/lib/utils";
import { platformReturnUrl } from "@/lib/sso";

export { initialsOf };

export function AppHeader() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [totalUnread, setTotalUnread] = useState<number>(0);

  const name = profile?.name || user?.user_metadata?.name || (user?.email ? user.email.split("@")[0] : "MeetSpace User");
  const username = profile?.username || (user?.email ? `@${user.email.split("@")[0]}` : "@user");
  const publicUserId = profile?.public_user_id || `MS-USER`;

  // Sync global chat unread count
  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const convos = await getUserConversations(user.id);
        const sum = convos.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        setTotalUnread(sum);
      } catch {
        // Ignore
      }
    };

    void fetchUnread();

    const handleSync = () => void fetchUnread();
    window.addEventListener("storage", handleSync);
    const interval = setInterval(fetchUnread, 2000);

    return () => {
      window.removeEventListener("storage", handleSync);
      clearInterval(interval);
    };
  }, [user]);

  // Login lives in the student/mentor platform, so this just returns there.
  async function handleSignOut() {
    window.location.href = platformReturnUrl();
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-card/95 backdrop-blur-md shrink-0">
      <div className="flex h-16 items-center justify-between px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-6 min-w-0">
          <Logo />
          {/* Header Nav Links — Always visible on split screen & mobile */}
          <nav className="flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm font-medium overflow-x-auto no-scrollbar">
            <Link
              to="/dashboard"
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors [&.active]:bg-brand-soft [&.active]:text-brand-dark [&.active]:font-semibold shrink-0"
            >
              <Video className="size-4" /> <span className="inline">Meetings</span>
            </Link>

            <Link
              to="/chat"
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative [&.active]:bg-brand-soft [&.active]:text-brand-dark [&.active]:font-semibold shrink-0"
            >
              <MessageSquare className="size-4" /> <span className="inline">Chat</span>
              {totalUnread > 0 && (
                <span className="ml-0.5 sm:ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand text-brand-foreground shadow-xs animate-pulse">
                  {totalUnread}
                </span>
              )}
            </Link>

            <Link
              to="/join"
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors [&.active]:bg-brand-soft [&.active]:text-brand-dark [&.active]:font-semibold shrink-0"
            >
              Join
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Button
            asChild
            size="sm"
            className="hidden sm:inline-flex font-semibold shadow-xs cursor-pointer bg-brand hover:bg-brand-dark text-brand-foreground"
          >
            <Link to="/create-meeting">
              <PlusCircle className="size-4 mr-1.5" /> New Meeting
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative size-9 sm:size-10 rounded-full cursor-pointer p-0">
                <Avatar className="size-9 sm:size-10 border border-border">
                  {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
                  <AvatarFallback className="bg-brand-soft font-bold text-brand-dark">
                    {initialsOf(name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-bold leading-none">{name}</p>
                  <p className="text-xs leading-none text-muted-foreground">{username}</p>
                  <p className="text-[10px] font-mono text-brand pt-1">ID: {publicUserId}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void navigate({ to: "/profile" })} className="cursor-pointer">
                <UserIcon className="mr-2 size-4" />
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleSignOut()} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 size-4" />
                Back to dashboard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}