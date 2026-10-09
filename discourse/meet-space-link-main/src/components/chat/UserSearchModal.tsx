import { useState } from "react";
import { Search, UserPlus, ShieldAlert, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { searchPublicProfiles } from "@/services/profiles";
import type { PublicProfile } from "@/types";
import { initialsOf } from "@/components/navigation/AppHeader";

interface UserSearchModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onSelectUser: (user: PublicProfile) => void;
  currentUserId?: string;
}

export function UserSearchModal({ isOpen, open, onClose, onSelectUser, currentUserId }: UserSearchModalProps) {
  const isModalOpen = open ?? isOpen ?? false;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setHasSearched(true);
    try {
      const data = await searchPublicProfiles(query);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand" /> Find MeetSpace User
          </DialogTitle>
          <DialogDescription>
            Search people by their <strong>@username</strong> or <strong>Public User ID</strong> (e.g. <code>MS-7K4P92</code>).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search @username or MS-7K4P92..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>

        <div className="flex items-center gap-2 rounded-md bg-brand-soft/60 p-2.5 text-xs text-brand-dark mt-1">
          <ShieldAlert className="size-4 shrink-0 text-brand" />
          <span>Email addresses are strictly private and cannot be used for search.</span>
        </div>

        <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
          {searching ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Searching profiles…</div>
          ) : hasSearched && results.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No user found matching "{query}". Double check the username or User ID.
            </div>
          ) : (
            results.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    {u.avatar_url ? <AvatarImage src={u.avatar_url} /> : null}
                    <AvatarFallback className="bg-brand-soft text-xs font-semibold">
                      {initialsOf(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{u.name}</p>
                    <p className="text-xs text-brand font-medium">{u.username}</p>
                    <span className="text-[10px] font-mono text-muted-foreground">ID: {u.public_user_id}</span>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectUser(u);
                    onClose();
                  }}
                >
                  <UserPlus className="size-4 mr-1" /> Start Chat
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
