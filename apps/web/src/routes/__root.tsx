import Loader from "@/components/loader";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "../index.css";
import Sidebar from "@/components/dual-sidebar";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/header";
import ErrorBoundary from "@/components/error-boundary";
import { useEffect } from "react";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Notes_V2",
      },
      {
        name: "description",
        content: "Notes_V2 is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  const isFetching = useRouterState({
    select: (s) => s.isLoading,
  });
  const location = useLocation();
  const isSettingsPage = location.pathname === "/settings";

  // Prevent context menu on right click throughout the app
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="overflow-hidden relative ">
        <HeadContent />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
          storageKey="vite-ui-theme"
        >
          {/* Always-present draggable area */}
          <div className="fixed top-0 left-0 right-0 h-12 z-40 header-draggable" />

          {/* Overlay Header */}
          <div className="fixed top-0 left-0 right-0 z-50 group">
            {/* Invisible trigger area */}
            {/* Header that slides down on hover */}
            <div className="transform -translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
              <Header />
            </div>
          </div>

          <div className="flex h-screen bg-[#0a0a0acc]">
            {isSettingsPage ? (
              // Settings page layout without sidebar
              <div className="flex-1 flex flex-col">
                <div
                  className="flex-1 overflow-y-auto scrollbar-custom rounded-2xl"
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "var(--muted-foreground) transparent",
                  }}
                >
                  <Outlet />
                </div>
              </div>
            ) : (
              <Sidebar />
            )}
          </div>
          <Toaster richColors />
        </ThemeProvider>
        <TanStackRouterDevtools position="bottom-left" />
      </div>
    </ErrorBoundary>
  );
}
