import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { RightSidebar } from "./right-sidebar";
import { Outlet } from "@tanstack/react-router";
import NotesCommand from "@/components/notes-command";

const Sidebar = () => {
  return (
    <SidebarProvider enableShortcuts={true}>
      <AppSidebar side="left" variant="inset" />
      <SidebarInset className=" overflow-hidden">
        <Header />
        <NotesCommand />
        <div
          className="overflow-y-auto scrollbar-custom  rounded-2xl"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "var(--muted-foreground) transparent",
          }}
        >
          <Outlet />
        </div>
      </SidebarInset>
      <RightSidebar side="right" variant="inset" />
    </SidebarProvider>
  );
};

export default Sidebar;
