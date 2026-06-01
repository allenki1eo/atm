"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";

function ColorInitializer() {
  useEffect(() => {
    const stored = localStorage.getItem("theme-color") ?? "purple";
    document.documentElement.setAttribute("data-color", stored);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange={false}>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <ColorInitializer />
          {children}
          <Toaster />
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
