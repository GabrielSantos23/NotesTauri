"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Download,
  Minus,
  Square,
  X,
  Maximize2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
// Header removed; window controls are integrated below

interface NoteMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function TopNotesBar() {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const newBtnRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [visibleCount, setVisibleCount] = useState<number>(0);

  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const selectedNoteId = currentPath.startsWith("/note/")
    ? currentPath.split("/")[2]
    : null;

  const loadNotes = useCallback(async () => {
    try {
      const list = await invoke<NoteMetadata[]>("list_notes");
      setNotes(list);
    } catch (e) {
      console.error("Failed to load notes", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
    const handler = () => loadNotes();
    window.addEventListener("note-saved", handler as EventListener);
    return () =>
      window.removeEventListener("note-saved", handler as EventListener);
  }, [loadNotes]);

  const filteredNotes = notes; // search moved to Command palette

  const recalcVisible = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const measuredNewWidth = newBtnRef.current?.offsetWidth ?? 0;
    // Fallback width to always leave space for the New button even on first paint
    const newButtonWidth = measuredNewWidth > 0 ? measuredNewWidth : 80;
    const gap = 8; // gap-2

    const countForReserve = (overflowReserve: number) => {
      let used = 0;
      let count = 0;
      for (const note of filteredNotes) {
        const el = itemRefs.current.get(note.id);
        if (!el) continue;
        const w = el.offsetWidth;
        const add = count === 0 ? w : w + gap;
        const available = containerWidth - newButtonWidth - overflowReserve;
        if (used + add <= available) {
          used += add;
          count += 1;
        } else {
          break;
        }
      }
      return count;
    };

    const total = filteredNotes.length;
    const countNoOverflow = countForReserve(0);
    if (countNoOverflow >= total) {
      setVisibleCount(total);
      return;
    }
    const countWithOverflow = countForReserve(40);
    setVisibleCount(countWithOverflow);
    // If we had to use fallback for new button width, try to recalc on next frame
    if (measuredNewWidth === 0) {
      requestAnimationFrame(() => {
        const realWidth = newBtnRef.current?.offsetWidth ?? 0;
        if (realWidth > 0) {
          // Re-run with actual measurements
          const containerW = containerRef.current?.clientWidth ?? 0;
          const gap = 8;
          const countForReserve2 = (overflowReserve: number) => {
            let used2 = 0;
            let count2 = 0;
            for (const note of filteredNotes) {
              const el2 = itemRefs.current.get(note.id);
              if (!el2) continue;
              const w2 = el2.offsetWidth;
              const add2 = count2 === 0 ? w2 : w2 + gap;
              const available2 = containerW - realWidth - overflowReserve;
              if (used2 + add2 <= available2) {
                used2 += add2;
                count2 += 1;
              } else {
                break;
              }
            }
            return count2;
          };
          const total2 = filteredNotes.length;
          const noOverflow2 = countForReserve2(0);
          if (noOverflow2 >= total2) setVisibleCount(total2);
          else setVisibleCount(countForReserve2(40));
        }
      });
    }
  }, [filteredNotes]);

  useEffect(() => {
    recalcVisible();
  }, [filteredNotes, recalcVisible]);

  useEffect(() => {
    const ro = new ResizeObserver(() => recalcVisible());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recalcVisible);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recalcVisible);
    };
  }, [recalcVisible]);

  const handleCreateNote = async () => {
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
  };

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

  const handleExportNote = async (id: string) => {
    try {
      await invoke("export_note_with_dialog", { note_id: id });
    } catch (e) {
      console.error(e);
      toast.error("Export failed");
    }
  };

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

  return (
    <div
      data-tauri-acrylic
      className="sticky top-0 z-30 w-full backdrop-blur-3xl bg-sidebar/95 border-b border-border select-none"
    >
      <div className="w-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 pt-2 min-h-[48px] header-draggable">
          <div
            ref={containerRef}
            className="flex items-stretch gap-2 flex-1 overflow-hidden"
          >
            {isLoading ? (
              <div className="text-sm text-muted-foreground px-2">Loading…</div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-sm text-muted-foreground px-2">No notes</div>
            ) : (
              filteredNotes.map((note, index) => {
                const isActive = selectedNoteId === note.id;
                return (
                  <div
                    key={note.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(note.id, el);
                    }}
                    className={`group shrink-0 rounded-md relative ${
                      isActive
                        ? "border-primary bg-card rounded-t-lg rounded-b-none"
                        : "border-border bg-transparent text-muted-foreground"
                    } hover:bg-accent/50 transition-colors ${
                      index >= visibleCount ? "hidden" : ""
                    }`}
                  >
                    {/* Left SVG decoration for active note */}
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

                    {/* Right SVG decoration for active note (inverted) */}
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
                      className="px-3 py-2 text-sm whitespace-nowrap max-w-[240px] text-left"
                      onClick={() =>
                        navigate({
                          to: "/note/$noteId",
                          params: { noteId: note.id },
                        })
                      }
                      title={note.title}
                    >
                      <span className="line-clamp-1">
                        {note.title || "Untitled"}
                      </span>
                    </button>
                    {/* <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="hidden group-hover:flex items-center justify-center w-full border-t border-border text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onClick={() => handleExportNote(note.id)}
                      >
                        <Download className="h-4 w-4 mr-2" /> Export…
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu> */}
                  </div>
                );
              })
            )}
            {/* Overflow dropdown for hidden notes */}
            {filteredNotes.length - visibleCount > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="shrink-0">
                    +{filteredNotes.length - visibleCount}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {filteredNotes.slice(visibleCount).map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      onClick={() =>
                        navigate({
                          to: "/note/$noteId",
                          params: { noteId: n.id },
                        })
                      }
                    >
                      {n.title || "Untitled"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* New note button at the end of the row */}
            <Button
              size="sm"
              onClick={handleCreateNote}
              disabled={isCreating}
              className="gap-2 shrink-0 ml-2"
              ref={newBtnRef}
            >
              <Plus className="h-4 w-4" />
              New
            </Button>
          </div>
          {/* Window controls on the right */}
          <div className="ml-auto flex items-center gap-1 non-draggable">
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
    </div>
  );
}
