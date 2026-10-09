import { useQuery } from "@tanstack/react-query";
import { getMeetingByCode } from "./meetings";

export function useMeetingById(code: string) {
  return useQuery({
    queryKey: ["meeting", code],
    queryFn: async () => {
      try {
        return await getMeetingByCode(code);
      } catch {
        return null;
      }
    },
    enabled: Boolean(code),
    refetchInterval: 3000,
    retry: false,
  });
}
