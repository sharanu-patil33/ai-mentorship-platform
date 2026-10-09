import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { GlobalCallListener } from "@/components/chat/GlobalCallListener";
import { consumeSsoHandoff } from "@/lib/sso";

/**
 * Gate for every authenticated surface (dashboard, chat, create meeting, profile).
 * Login now lives in the student/mentor platform: the dashboard hands over its session,
 * and anyone without a session is sent back to the platform login.
 * Mounts GlobalCallListener so users receive incoming video call notifications across all MeetSpace pages.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    await consumeSsoHandoff();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <>
      <Outlet />
      <GlobalCallListener />
    </>
  );
}
