import { useState } from "react";
import { X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChatDrawer({
  messages = [],
  onSend,
  onClose,
}: {
  messages?: any[];
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border text-foreground">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="font-bold text-sm">In-Meeting Chat</h3>
        <Button size="icon" variant="ghost" className="size-7 cursor-pointer" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center pt-8">No messages in meeting yet.</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="text-xs p-2.5 rounded-xl bg-accent space-y-0.5">
              <p className="font-bold text-brand">{m.sender_name || m.senderName || "Participant"}</p>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-border flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Type a message..."
          className="h-9 text-xs"
        />
        <Button size="icon" className="size-9 bg-brand text-brand-foreground hover:bg-brand-dark cursor-pointer" onClick={handleSend}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
