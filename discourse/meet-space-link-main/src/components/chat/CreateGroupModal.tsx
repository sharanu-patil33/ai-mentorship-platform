import { useState } from "react";
import { Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createGroupConversation } from "@/services/chat";
import type { ChatConversation } from "@/types";

interface CreateGroupModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  currentUserId: string;
  onGroupCreated?: (group: ChatConversation) => void;
  onCreated?: (convoId: string) => void;
}

export function CreateGroupModal({
  isOpen,
  open,
  onClose,
  currentUserId,
  onGroupCreated,
  onCreated,
}: CreateGroupModalProps) {
  const isModalOpen = open ?? isOpen ?? false;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter a group room name.");
      return;
    }

    setCreating(true);
    try {
      const group = await createGroupConversation(name.trim(), description.trim(), [currentUserId]);
      if (onCreated) {
        onCreated(group.id);
      }
      if (onGroupCreated) {
        onGroupCreated(group);
      }
      onClose();
      setName("");
      setDescription("");
    } catch (err: any) {
      setError(err.message || "Failed to create group.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-brand" /> Create Group Room
          </DialogTitle>
          <DialogDescription>
            Create a group chat for your project team, department, or meeting group.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              placeholder="e.g. Design System Sync"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-desc">Description (Optional)</Label>
            <Textarea
              id="group-desc"
              placeholder="Describe the purpose of this group room..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create Group"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
