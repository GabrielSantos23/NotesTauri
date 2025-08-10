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
import TopNotesLayout from "@/components/top-notes-layout";
import { Separator } from "@/components/ui/separator";
// Header was removed; TopNotesBar now includes window controls
import ErrorBoundary from "@/components/error-boundary";
import { useEffect, useState } from "react";
import Toolbar from "@/components/top-notes-layout/toolbar";

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
  const [layoutPref, setLayoutPref] = useState<string>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("notes_layout_pref") || "vertical"
      : "vertical"
  );
  useEffect(() => {
    const sync = () => {
      const stored = localStorage.getItem("notes_layout_pref");
      if (stored && stored !== layoutPref) setLayoutPref(stored);
    };
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "notes_layout_pref") sync();
    };
    const onCustom = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener("layout-pref-changed", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "layout-pref-changed",
        onCustom as EventListener
      );
    };
  }, [layoutPref]);

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
          <div className="flex h-screen flex-col bg-transparent relative">
            <TopNotesLayout />
          </div>
          {/* <div className="flex h-[calc(100vh-3rem)] flex-col bg-transparent overflow-y-auto">
            {isSettingsPage ? (
              // Settings page layout without sidebar
              <div className="flex-1 flex flex-col">
                <div
                  className="flex-1 overflow-y-auto scrollbar-custom rounded-2xl "
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "var(--muted-foreground) transparent",
                  }}
                >
                  <Outlet />
                </div>
              </div>
            ) : layoutPref === "vertical" ? (
              <TopNotesLayout />
            ) : (
              <Sidebar />
            )}
          </div> */}
          <Toaster richColors />
        </ThemeProvider>
        <TanStackRouterDevtools position="bottom-left" />
      </div>
    </ErrorBoundary>
  );
}
