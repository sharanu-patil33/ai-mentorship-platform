import { createFileRoute } from "@tanstack/react-router";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { AppHeader } from "@/components/navigation/AppHeader";
import { useAuth } from "@/hooks/useAuth";

const TITLE = "Chat & Messages — MeetSpace";
const DESCRIPTION = "Real-time 1-to-1 messaging, group rooms, and instant video meeting launch in MeetSpace.";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <AppHeader />
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <ChatLayout currentUserId={user.id} />
      </div>
    </div>
  );
}
