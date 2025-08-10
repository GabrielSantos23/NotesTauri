"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarShortcut,
  MenubarCheckboxItem,
} from "../ui/menubar";

function AppMenubar() {
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const currentNoteId = useMemo(
    () => (currentPath.startsWith("/note/") ? currentPath.split("/")[2] : null),
    [currentPath]
  );
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("notes_recent_files");
      return s ? (JSON.parse(s) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const unlistenPromise = listen<string>("recent-file-opened", (e) => {
      const path = e.payload;
      if (!path) return;
      setRecentFiles((prev) => {
        const next = [path, ...prev.filter((p) => p !== path)].slice(0, 10);
        localStorage.setItem("notes_recent_files", JSON.stringify(next));
        return next;
      });
    });
    return () => {
      unlistenPromise.then((un) => un());
    };
  }, []);

  const saveCurrent = useCallback(async () => {
    // Ask the page to save via a custom event; route listens for Ctrl+S too
    try {
      const event = new CustomEvent("notes-save-current");
      window.dispatchEvent(event);
      toast.success("Save triggered");
    } catch {}
  }, []);

  const saveAs = useCallback(async () => {
    if (!currentNoteId) return;
    try {
      await invoke("export_note_with_dialog", { noteId: currentNoteId });
      toast.success("Saved as Markdown");
    } catch (e) {
      console.error(e);
      toast.error("Save as failed");
    }
  }, [currentNoteId]);

  const saveAll = useCallback(async () => {
    // Broadcast a save-all event; each open editor can listen and persist.
    try {
      window.dispatchEvent(new CustomEvent("notes-save-all"));
      toast.success("Save all triggered");
    } catch {}
  }, []);

  const newTab = useCallback(async () => {
    try {
      const id = await invoke<string>("save_note", {
        title: "Untitled Note",
        content: "",
        links: [],
      });
      navigate({ to: "/note/$noteId", params: { noteId: id } });
    } catch (e) {
      console.error(e);
      toast.error("Failed to create note");
    }
  }, [navigate]);

  const newWindow = useCallback(async () => {
    try {
      await invoke("new_window");
    } catch (e) {
      console.error(e);
      toast.error("Failed to open new window");
    }
  }, []);

  const openFile = useCallback(async () => {
    try {
      const id = await invoke<string>("import_note_from_file");
      navigate({ to: "/note/$noteId", params: { noteId: id } });
    } catch (e) {
      // User may cancel; avoid noisy errors
      console.log("Open cancelled or failed", e);
    }
  }, [navigate]);

  const closeTab = useCallback(async () => {
    if (currentNoteId) {
      navigate({ to: "/" });
    }
  }, [currentNoteId, navigate]);

  const closeWindow = useCallback(async () => {
    try {
      await invoke("close_window");
    } catch (e) {
      console.error(e);
    }
  }, []);

  const printPage = useCallback(() => {
    try {
      window.print();
    } catch (e) {
      console.error(e);
    }
  }, []);

  return (
    <Menubar className="bg-transparent  border-none shadow-none p-0 gap-0 ml-2">
      <MenubarMenu>
        <MenubarTrigger className="px-2 hover:bg-muted">File</MenubarTrigger>
        <MenubarContent className="border-border border bg-card">
          <MenubarItem onClick={newTab}>
            New tab
            <MenubarShortcut>Ctrl+N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={newWindow}>
            New window
            <MenubarShortcut>Ctrl+Shift+N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={newTab}>New Markdown tab</MenubarItem>
          <MenubarItem onClick={openFile}>
            Open
            <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>Recent</MenubarSubTrigger>
            <MenubarSubContent className="border-border border bg-card">
              {recentFiles.length === 0 ? (
                <MenubarItem disabled>No recent files</MenubarItem>
              ) : (
                recentFiles.map((p, idx) => (
                  <MenubarItem
                    key={idx}
                    onClick={async () => {
                      try {
                        const id = await invoke<string>(
                          "import_note_from_path",
                          {
                            path: p,
                          }
                        );
                        navigate({
                          to: "/note/$noteId",
                          params: { noteId: id },
                        });
                      } catch (e) {
                        console.error(e);
                        toast.error("Failed to open recent file");
                      }
                    }}
                  >
                    {p}
                  </MenubarItem>
                ))
              )}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem onClick={saveCurrent}>
            Save
            <MenubarShortcut>Ctrl+S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={saveAs}>
            Save as
            <MenubarShortcut>Ctrl+Shift+S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={saveAll}>
            Save all
            <MenubarShortcut>Ctrl+Alt+S</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => {}} disabled>
            Page setup
          </MenubarItem>
          <MenubarItem onClick={printPage}>
            Print
            <MenubarShortcut>Ctrl+P</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={closeTab}>
            Close tab
            <MenubarShortcut>Ctrl+W</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={closeWindow}>
            Close window
            <MenubarShortcut>Ctrl+Shift+W</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={closeWindow}>Exit</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 hover:bg-muted">Edit</MenubarTrigger>
        <MenubarContent className="border-border border bg-card">
          <MenubarItem>
            Undo
            <MenubarShortcut>Ctrl+Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            Cut
            <MenubarShortcut>Ctrl+X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Copy
            <MenubarShortcut>Ctrl+C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Paste
            <MenubarShortcut>Ctrl+V</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>Delete</MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Clear formatting</MenubarItem>
          <MenubarItem>
            Search with Bing
            <MenubarShortcut>Ctrl+E</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            Find
            <MenubarShortcut>Ctrl+F</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Find next
            <MenubarShortcut>F3</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Find previous
            <MenubarShortcut>Shift+F3</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Replace
            <MenubarShortcut>Ctrl+H</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Go to
            <MenubarShortcut>Ctrl+G</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            Select all
            <MenubarShortcut>Ctrl+A</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Time/Date
            <MenubarShortcut>F5</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Font</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 hover:bg-muted">View</MenubarTrigger>
        <MenubarContent className="border-border border bg-card">
          <MenubarSub>
            <MenubarSubTrigger>Zoom</MenubarSubTrigger>
            <MenubarSubContent className="border-border border bg-card">
              <MenubarItem>
                Zoom in
                <MenubarShortcut>Ctrl+Plus</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                Zoom out
                <MenubarShortcut>Ctrl+Minus</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                Restore default zoom
                <MenubarShortcut>Ctrl+0</MenubarShortcut>
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={showStatusBar}
            onCheckedChange={(v) => setShowStatusBar(!!v)}
          >
            Status bar
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={wordWrap}
            onCheckedChange={(v) => setWordWrap(!!v)}
          >
            Word wrap
          </MenubarCheckboxItem>
          <MenubarSub>
            <MenubarSubTrigger disabled>Markdown</MenubarSubTrigger>
          </MenubarSub>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}

export default AppMenubar;
