import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MessageInputProps {
  onSend?: (text: string, mediaUrl?: string) => void | Promise<void>;
  onSendMessage?: (text: string, mediaUrl?: string) => void | Promise<void>;
  onStartMeeting?: () => void | Promise<void>;
  disabled?: boolean;
}

export function MessageInput({ onSend, onSendMessage, disabled }: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const sendFn = onSend || onSendMessage;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending || disabled) return;

    const content = text.trim();
    setText("");
    setSending(true);

    try {
      if (sendFn) {
        await sendFn(content);
      }
    } catch (err) {
      console.error("Failed sending message:", err);
      setText(content); // Restore if error
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-3 bg-card/60 backdrop-blur-xs border-t border-border/80 shrink-0">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-4xl mx-auto">
        <Input
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled || sending}
          className="flex-1 rounded-full bg-background border-border/80 px-4 text-sm h-10 shadow-inner"
          autoFocus
        />

        <Button
          type="submit"
          size="icon"
          disabled={!text.trim() || sending || disabled}
          className="shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand-dark cursor-pointer size-10 shadow-sm"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
