"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
  useSidebarWithSide,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Search,
  Plus,
  MoreHorizontal,
  FileText,
  Trash2,
  Edit,
  Calendar,
  Download,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { exportAndDownloadNote } from "@/lib/export-utils";

interface NoteMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SidebarState {
  notes: NoteMetadata[];
  last_sync_time: number;
  is_collapsed?: boolean;
  selected_note_id?: string;
  is_right_collapsed?: boolean;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Get sidebar state from the context
  const sidebar = useSidebar();
  const rightSidebar = useSidebarWithSide("right");

  // Update our collapsed state when sidebar state changes
  useEffect(() => {
    const newCollapsedState = sidebar.state === "collapsed";
    if (newCollapsedState !== isCollapsed) {
      console.log(
        "🔄 Sidebar state changed:",
        sidebar.state,
        "collapsed:",
        newCollapsedState
      );
      setIsCollapsed(newCollapsedState);
    }
  }, [sidebar.state, isCollapsed]);

  // Get current route to highlight selected note
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const selectedNoteId = currentPath.startsWith("/note/")
    ? currentPath.split("/")[2]
    : null;

  // Load sidebar state on component mount
  useEffect(() => {
    initializeSidebar();
  }, []);

  const saveSidebarState = useCallback(async () => {
    try {
      const state: SidebarState = {
        notes,
        last_sync_time: Date.now(),
        is_collapsed: isCollapsed,
        selected_note_id: selectedNoteId || undefined,
        is_right_collapsed: rightSidebar.state === "collapsed",
      };
      console.log("💾 SAVING SIDEBAR STATE:", {
        notesCount: notes.length,
        isCollapsed,
        selectedNoteId,
        lastSyncTime: state.last_sync_time,
      });
      await invoke("save_sidebar_state", { state });
      console.log("✅ Sidebar state saved successfully");
    } catch (error) {
      console.error("❌ Failed to save sidebar state:", error);
    }
  }, [notes, isCollapsed, selectedNoteId, rightSidebar.state]);

  // Save sidebar state whenever it changes
  useEffect(() => {
    // Only save if we have notes or if the state has meaningful changes
    if (notes.length > 0) {
      console.log(
        "📝 Notes changed, saving sidebar state...",
        notes.length,
        "notes"
      );
      saveSidebarState();
    }
  }, [notes, saveSidebarState]);

  // Save collapsed state separately to avoid unnecessary saves
  useEffect(() => {
    if (isCollapsed !== false) {
      console.log(
        "📝 Collapsed state changed, saving sidebar state...",
        isCollapsed
      );
      saveSidebarState();
    }
  }, [isCollapsed, saveSidebarState]);

  // Save RIGHT collapsed state changes as well
  useEffect(() => {
    console.log(
      "📝 Right sidebar state changed, saving sidebar state...",
      rightSidebar.state
    );
    saveSidebarState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightSidebar.state]);

  // Listen for note updates to refresh the list
  useEffect(() => {
    const handleNoteSaved = async () => {
      console.log("Note saved, refreshing notes...");
      try {
        const freshNotes = await invoke<NoteMetadata[]>("list_notes");
        setNotes(freshNotes);
        console.log("Notes refreshed, count:", freshNotes.length);
      } catch (error) {
        console.error("Failed to refresh notes:", error);
      }
    };

    const handleNoteTitleChanged = (event: CustomEvent) => {
      const { noteId, title } = event.detail;
      console.log("Note title changed:", noteId, title);
      setNotes((prevNotes) =>
        prevNotes.map((note) =>
          note.id === noteId ? { ...note, title } : note
        )
      );
    };

    window.addEventListener("note-saved", handleNoteSaved);
    window.addEventListener(
      "note-title-changed",
      handleNoteTitleChanged as EventListener
    );

    return () => {
      window.removeEventListener("note-saved", handleNoteSaved);
      window.removeEventListener(
        "note-title-changed",
        handleNoteTitleChanged as EventListener
      );
    };
  }, []);

  const initializeSidebar = async () => {
    try {
      console.log("=== SIDEBAR INITIALIZATION START ===");

      // First, try to load saved state for quick display
      const savedState = await invoke<SidebarState | null>(
        "load_sidebar_state"
      );
      console.log("Loaded saved state:", savedState);
      console.log("Saved state notes count:", savedState?.notes?.length || 0);

      if (savedState && savedState.notes && savedState.notes.length > 0) {
        console.log(
          "✅ Applying saved state with",
          savedState.notes.length,
          "notes"
        );
        console.log(
          "Saved notes:",
          savedState.notes.map((n) => n.title)
        );
        setNotes(savedState.notes);
        setIsCollapsed(savedState.is_collapsed || false);
        setIsLoading(false);

        // Restore left sidebar collapsed state (default is open)
        if (savedState.is_collapsed === true) {
          console.log("🔄 Restoring collapsed LEFT sidebar state");
          sidebar.setOpen(false);
        }
        // Restore right sidebar state (default is closed)
        if (savedState.is_right_collapsed === true) {
          console.log("🔄 Restoring collapsed RIGHT sidebar state");
          rightSidebar.setOpen(false);
        } else if (savedState.is_right_collapsed === false) {
          console.log("🔄 Restoring EXPANDED RIGHT sidebar state");
          rightSidebar.setOpen(true);
        }
      } else {
        console.log("❌ No saved state or empty notes, loading fresh data");
        // Load fresh notes if no saved state
        const freshNotes = await invoke<NoteMetadata[]>("list_notes");
        console.log("Fresh notes loaded:", freshNotes.length);
        setNotes(freshNotes);
        setIsLoading(false);
      }

      // Always load fresh notes to ensure we have the latest data
      console.log("Loading fresh notes for comparison...");
      const freshNotes = await invoke<NoteMetadata[]>("list_notes");
      console.log("Fresh notes count:", freshNotes.length);
      console.log(
        "Fresh notes:",
        freshNotes.map((n) => n.title)
      );

      // Compare fresh notes with what we currently have
      const currentNotes = savedState?.notes || [];
      console.log(
        "Current notes from saved state:",
        currentNotes.map((n) => n.title)
      );

      const notesMatch =
        JSON.stringify(currentNotes) === JSON.stringify(freshNotes);
      console.log("Notes match:", notesMatch);

      if (!notesMatch) {
        console.log("🔄 Updating notes with fresh data");
        setNotes(freshNotes);
      } else {
        console.log("✅ Fresh data matches saved data, keeping current state");
      }

      console.log("=== SIDEBAR INITIALIZATION COMPLETE ===");
    } catch (error) {
      console.error("❌ Failed to initialize sidebar:", error);
      // Fallback to loading fresh notes
      await loadNotes();
    } finally {
      setIsLoading(false);
    }
  };

  const loadSidebarState = async () => {
    try {
      const savedState = await invoke<SidebarState | null>(
        "load_sidebar_state"
      );
      if (savedState) {
        setNotes(savedState.notes || []);
        setIsCollapsed(savedState.is_collapsed || false);
        // Note: We don't restore selected_note_id as it should be based on current route
      }
    } catch (error) {
      console.error("Failed to load sidebar state:", error);
    }
  };

  const loadNotes = async () => {
    try {
      setIsLoading(true);
      const notesList = await invoke<NoteMetadata[]>("list_notes");
      setNotes(notesList);
    } catch (error) {
      console.error("Failed to load notes:", error);
      toast.error("Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNoteClick = (noteId: string) => {
    navigate({ to: "/note/$noteId", params: { noteId } });
  };

  const handleNewNote = () => {
    navigate({ to: "/" });
  };

  const handleDeleteNote = async (noteId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      await invoke("delete_note", { id: noteId });
      toast.success("Note deleted");
      await loadNotes();

      // If the deleted note was selected, navigate to home
      if (selectedNoteId === noteId) {
        navigate({ to: "/" });
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
      toast.error("Failed to delete note");
    }
  };

  const handleExportNote = async (noteId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      await exportAndDownloadNote(noteId);
      toast.success("Note exported successfully");
    } catch (error) {
      console.error("Failed to export note:", error);
      toast.error("Failed to export note");
    }
  };

  // Debounced search function for instant filtering
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffInDays === 0) {
        return format(date, "HH:mm");
      } else if (diffInDays === 1) {
        return "Yesterday";
      } else if (diffInDays < 7) {
        return format(date, "EEE");
      } else {
        return format(date, "MMM d");
      }
    } catch {
      return "Unknown";
    }
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b border-border/40">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewNote}
                className="w-full justify-start gap-2 h-10"
              >
                <Plus className="size-4" />
                <span className="text-sm font-medium">New Note</span>
              </Button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <SidebarMenu>
          <SidebarGroup>
            <SidebarGroupLabel>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Notes ({filteredNotes.length})
                </span>
              </div>
            </SidebarGroupLabel>

            <div className="space-y-1">
              {isLoading ? (
                // Loading skeletons
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="px-2 py-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-2 w-1/2" />
                      </div>
                    </div>
                  </div>
                ))
              ) : filteredNotes.length === 0 ? (
                <div className="px-2 py-4 text-center">
                  <FileText className="size-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {searchQuery ? "No notes found" : "No notes yet"}
                  </p>
                  {!searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNewNote}
                      className="mt-2 h-7 text-xs"
                    >
                      Create your first note
                    </Button>
                  )}
                </div>
              ) : (
                filteredNotes.map((note) => (
                  <SidebarMenuItem key={note.id}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div
                          className="w-full"
                          onMouseEnter={() => setHoveredNoteId(note.id)}
                          onMouseLeave={() => setHoveredNoteId(null)}
                        >
                          <SidebarMenuButton
                            asChild
                            className={`data-[slot=sidebar-menu-button]:!p-2 data-[slot=sidebar-menu-button]:!h-auto ${
                              selectedNoteId === note.id ? "bg-muted/50" : ""
                            }`}
                            onClick={() => handleNoteClick(note.id)}
                          >
                            <div className="flex items-center gap-3 w-full cursor-pointer">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium truncate">
                                    {note.title || "Untitled Note"}
                                  </p>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-6 w-6 p-0 transition-opacity duration-200 ease-in-out hover:bg-accent/50 ${
                                          hoveredNoteId === note.id
                                            ? "opacity-100"
                                            : "opacity-0"
                                        }`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreHorizontal className="size-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="w-48 border border-border bg-opacity-90 backdrop-blur-lg"
                                    >
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleNoteClick(note.id);
                                        }}
                                      >
                                        <Edit className="size-3 mr-2" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) =>
                                          handleExportNote(note.id, e)
                                        }
                                      >
                                        <Download className="size-3 mr-2" />
                                        Export as Markdown
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) =>
                                          handleDeleteNote(note.id, e)
                                        }
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="size-3 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                  <Calendar className="size-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(note.updated_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </SidebarMenuButton>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 border border-border bg-opacity-90 backdrop-blur-lg">
                        <ContextMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNoteClick(note.id);
                          }}
                        >
                          <Edit className="size-3 mr-2" />
                          Edit Note
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={(e) => handleExportNote(note.id, e)}
                        >
                          <Download className="size-3 mr-2" />
                          Export as Markdown
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={(e) => handleDeleteNote(note.id, e)}
                          variant="destructive"
                        >
                          <Trash2 className="size-3 mr-2" />
                          Delete Note
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </SidebarMenuItem>
                ))
              )}
            </div>
          </SidebarGroup>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {notes.length} notes
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/settings" })}
            className="h-6 px-2 text-xs"
          >
            <Settings className="size-3 mr-1" />
            Settings
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
