"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useEffect } from "react";

import { useAuthStore } from "@/features/auth/store/auth-store";

interface ProvidersProps {
  children: ReactNode;
}

function AuthHydrationBoundary({ children }: ProvidersProps) {
  const isHydrated = useAuthStore((state) => state.isHydrated);

  useEffect(() => {
    void useAuthStore.persist.rehydrate();
  }, []);

  if (!isHydrated) {
    return <div className="shell">Preparing secure workspace...</div>;
  }

  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrationBoundary>{children}</AuthHydrationBoundary>
    </QueryClientProvider>
  );
}
