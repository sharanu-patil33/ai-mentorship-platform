import { Navigate, createFileRoute } from "@tanstack/react-router";

// Sign-up lives in the student/mentor platform now.
export const Route = createFileRoute("/signup")({
  component: () => <Navigate to="/login" />,
});
