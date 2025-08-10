"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";

interface NoteMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export default function NotesCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const navigate = useNavigate();

  const loadNotes = useCallback(async () => {
    try {
      const list = await invoke<NoteMetadata[]>("list_notes");
      setNotes(list);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadNotes();
    const onSaved = () => loadNotes();
    window.addEventListener("note-saved", onSaved as EventListener);
    return () =>
      window.removeEventListener("note-saved", onSaved as EventListener);
  }, [loadNotes]);

  // Global shortcut: Ctrl/Cmd+K to open; Esc closes handled by dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = (e.key || "").toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, query]);

  const createNote = async () => {
    try {
      const id = await invoke<string>("save_note", {
        title: "Untitled Note",
        content: "",
        links: [],
      });
      setOpen(false);
      navigate({ to: "/note/$noteId", params: { noteId: id } });
      toast.success("New note created");
    } catch (e) {
      toast.error("Failed to create note");
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command Palette">
      <CommandInput
        autoFocus
        placeholder="Search notes or type a command…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={createNote} value="new note">
            <Plus className="h-4 w-4" />
            <span>New note</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Notes">
          {filteredNotes.map((n) => (
            <CommandItem
              key={n.id}
              value={n.title}
              onSelect={() => {
                setOpen(false);
                navigate({ to: "/note/$noteId", params: { noteId: n.id } });
              }}
            >
              <FileText className="h-4 w-4" />
              <span className="truncate">{n.title || "Untitled"}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
