"use client";

import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Minus,
  Square,
  X,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "../ui/separator";
// Header removed; window controls are integrated below

interface NoteMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface FullNote {
  id: string;
  title: string;
  content: string;
  links: string[];
}

interface SidebarState {
  notes: NoteMetadata[];
  last_sync_time: number;
  is_collapsed?: boolean | null;
  selected_note_id?: string | null;
  is_right_collapsed?: boolean | null;
}

export function TopNotesBar() {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState<boolean>(false);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<NoteMetadata | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);

  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const selectedNoteId = currentPath.startsWith("/note/")
    ? currentPath.split("/")[2]
    : null;

  const loadNotes = useCallback(async () => {
    try {
      const list = await invoke<NoteMetadata[]>("list_notes");
      let ordered = list;
      try {
        const state = await invoke<SidebarState | null>("load_sidebar_state");
        if (state && Array.isArray(state.notes) && state.notes.length > 0) {
          const idOrder = state.notes.map((n) => n.id);
          const map = new Map(list.map((n) => [n.id, n] as const));
          const inOrder: NoteMetadata[] = [];
          idOrder.forEach((id) => {
            const n = map.get(id);
            if (n) inOrder.push(n);
          });
          // append notes not present in saved order
          list.forEach((n) => {
            if (!idOrder.includes(n.id)) inOrder.push(n);
          });
          ordered = inOrder;
        }
      } catch (err) {
        // ignore ordering errors and fallback to list order
      }
      setNotes(ordered);
    } catch (e) {
      console.error("Failed to load notes", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistOrder = useCallback(async (ordered: NoteMetadata[]) => {
    try {
      const state: SidebarState = {
        notes: ordered,
        last_sync_time: Date.now(),
        is_collapsed: null,
        selected_note_id: null,
        is_right_collapsed: null,
      };
      await invoke("save_sidebar_state", { state });
    } catch (e) {
      console.error("Failed to save notes order", e);
    }
  }, []);

  useEffect(() => {
    loadNotes();
    const handler = () => loadNotes();
    window.addEventListener("note-saved", handler as EventListener);
    const onTitleChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        noteId: string;
        title: string;
      };
      if (!detail || !detail.noteId) return;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === detail.noteId ? { ...n, title: detail.title } : n
        )
      );
    };
    window.addEventListener(
      "note-title-changed",
      onTitleChanged as EventListener
    );
    return () => {
      window.removeEventListener("note-saved", handler as EventListener);
      window.removeEventListener(
        "note-title-changed",
        onTitleChanged as EventListener
      );
    };
  }, [loadNotes]);

  const filteredNotes = notes; // search moved to Command palette

  const updateOverflowState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 1; // tolerance
    setIsOverflowing(hasOverflow);
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateOverflowState();
  }, [filteredNotes, updateOverflowState]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => updateOverflowState();
    const ro = new ResizeObserver(() => updateOverflowState());
    ro.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateOverflowState);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll as EventListener);
      window.removeEventListener("resize", updateOverflowState);
    };
  }, [updateOverflowState]);

  const handleCreateNote = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const id = await invoke<string>("save_note", {
        title: "Untitled Note",
        content: "",
        links: [],
      });
      await loadNotes();
      navigate({ to: "/note/$noteId", params: { noteId: id } });
      toast.success("New note created");
    } catch (e) {
      console.error(e);
      toast.error("Failed to create note");
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, loadNotes, navigate]);

  const handleDeleteNote = async (id: string) => {
    try {
      await invoke("delete_note", { id });
      await loadNotes();
      toast.success("Note deleted");
      if (selectedNoteId === id) {
        navigate({ to: "/" });
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete note");
    }
  };

  // Keyboard shortcut: Ctrl/Cmd + T to create a new note
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isT = event.key.toLowerCase() === "t";
      if (isT && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleCreateNote();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCreateNote]);

  const handleMinimize = () => {
    invoke("minimize_window").catch((error) => {
      console.error("Failed to minimize window:", error);
    });
  };

  const handleMaximize = () => {
    invoke("maximize_window")
      .then(() => {
        setIsMaximized((prev) => !prev);
      })
      .catch((error) => {
        console.error("Failed to maximize window:", error);
      });
  };

  const handleClose = () => {
    invoke("close_window").catch((error) => {
      console.error("Failed to close window:", error);
    });
  };

  const requestDelete = useCallback(async (noteMeta: NoteMetadata) => {
    try {
      const full = await invoke<FullNote>("load_note", { id: noteMeta.id });
      const titleEmpty =
        !full.title ||
        full.title.trim() === "" ||
        full.title === "Untitled Note";
      const contentEmpty = !full.content || full.content.trim() === "";
      const linksEmpty = !full.links || full.links.length === 0;
      const isEmpty = titleEmpty && contentEmpty && linksEmpty;
      if (isEmpty) {
        await handleDeleteNote(noteMeta.id);
        return;
      }
    } catch (e) {
      // If load fails, be safe and ask for confirmation
    }
    setDeleteTarget(noteMeta);
    setShowDeleteDialog(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = notes.findIndex((n) => n.id === String(active.id));
    const newIndex = notes.findIndex((n) => n.id === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(notes, oldIndex, newIndex);
    setNotes(reordered);
    // Recompute overflow/scroll affordances after reorder
    requestAnimationFrame(() => updateOverflowState());
    // Persist order
    persistOrder(reordered);
  };

  const scrollByAmount = (dir: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const delta = Math.max(200, Math.floor(el.clientWidth * 0.5));
    el.scrollBy({ left: dir === "left" ? -delta : delta, behavior: "smooth" });
  };

  return (
    <div
      data-tauri-acrylic
      className="sticky top-0 z-30 w-full bg-sidebar/95 backdrop-blur-md  select-none"
    >
      <div className="w-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 pt-2 min-h-[48px] header-draggable">
          <div
            ref={containerRef}
            className="flex items-stretch gap-2 flex-1 overflow-x-auto overflow-y-hidden scrollbar-hidden scroll-smooth"
          >
            {isLoading ? (
              <div className="text-sm text-muted-foreground px-2">Loading…</div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-sm text-muted-foreground px-2">No notes</div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredNotes.map((n) => n.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {filteredNotes.map((note) => {
                    const isActive = selectedNoteId === note.id;
                    return (
                      <SortableNoteItem
                        key={note.id}
                        note={note}
                        isActive={!!isActive}
                        onNavigate={() =>
                          navigate({
                            to: "/note/$noteId",
                            params: { noteId: note.id },
                          })
                        }
                        onDelete={() => {
                          requestDelete(note);
                        }}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            )}
          </div>
          {/* New button fixed next to window controls */}
          <div className="ml-auto flex items-center gap-1 non-draggable">
            {isOverflowing && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => scrollByAmount("left")}
                  disabled={!canScrollLeft}
                  title="Scroll left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => scrollByAmount("right")}
                  disabled={!canScrollRight}
                  title="Scroll right"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateNote}
              disabled={isCreating}
              className="gap-2 shrink-0 h-8 hover:bg-muted/50 bg-card"
              title="New note (Ctrl/Cmd+T)"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <div className="flex items-center h-8 px-1">
              <Separator
                orientation="vertical"
                className="h-full w-px bg-muted-foreground/10"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-muted/50 rounded-none"
              onClick={handleMinimize}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-muted/50 rounded-none"
              onClick={handleMaximize}
            >
              {isMaximized ? (
                <Square className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-none"
              onClick={handleClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The note will be permanently
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  const id = deleteTarget.id;
                  setShowDeleteDialog(false);
                  setDeleteTarget(null);
                  handleDeleteNote(id);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableNoteItem({
  note,
  isActive,
  onNavigate,
  onDelete,
}: {
  note: NoteMetadata;
  isActive: boolean;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
      }}
      style={style}
      className={`group shrink-0 rounded-md relative non-draggable mt-1 ${
        isActive
          ? "border-primary bg-card rounded-t-lg rounded-b-none"
          : "border-border bg-transparent text-muted-foreground hover:bg-accent/50"
      } transition-colors`}
      {...attributes}
      {...listeners}
    >
      {isActive && (
        <div className="absolute -left-[50px] bottom-0 w-[50px] h-[100px] flex items-end">
          <svg
            width="50"
            height="50"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            style={{ color: "oklch(0.205 0 0)" }}
          >
            <path
              d="M 100,100 L 60,100 A 40,40 0 0 0 100,60 Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}

      {isActive && (
        <div className="absolute -right-[100px] bottom-0 w-[100px] h-[100px] flex items-end">
          <svg
            width="50"
            height="50"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            style={{ color: "oklch(0.205 0 0)" }}
            className="scale-x-[-1]"
          >
            <path
              d="M 100,100 L 60,100 A 40,40 0 0 0 100,60 Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}

      <button
        className="px-3 py-2 text-sm whitespace-nowrap max-w-[240px] text-left "
        onClick={onNavigate}
        title={note.title}
      >
        <span className="line-clamp-1">{note.title || "Untitled"}</span>
      </button>

      {/* Hover close button */}
      <button
        className="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Delete note"
        title="Delete note"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
