"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Bold,
  Italic,
  List,
  Heading1,
  ChevronDown,
  Eraser,
} from "lucide-react";

type EditorSelectionState = {
  headingLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  listType: "none" | "bullet" | "ordered";
  isBold: boolean;
  isItalic: boolean;
};

const headingLabelForLevel = (level: EditorSelectionState["headingLevel"]) =>
  level === 0 ? "Body" : `H${level}`;

const headingItems: Array<{
  label: string;
  level: EditorSelectionState["headingLevel"];
  className: string;
}> = [
  { label: "Title", level: 1, className: "text-3xl font-semibold" },
  { label: "Subtitle", level: 2, className: "text-2xl font-medium" },
  { label: "Heading", level: 3, className: "text-xl font-medium" },
  { label: "Subheading", level: 4, className: "text-lg" },
  { label: "Section", level: 5, className: "text-base" },
  { label: "Subsection", level: 6, className: "text-sm" },
  { label: "Body", level: 0, className: "text-sm" },
];

export default function EditorFormatToolbar() {
  const [state, setState] = useState<EditorSelectionState>({
    headingLevel: 0,
    listType: "none",
    isBold: false,
    isItalic: false,
  });

  useEffect(() => {
    const onSelectionState = (e: Event) => {
      const detail = (e as CustomEvent<EditorSelectionState>).detail;
      if (!detail) return;
      setState(detail);
    };
    window.addEventListener(
      "editor-selection-state",
      onSelectionState as EventListener
    );
    return () =>
      window.removeEventListener(
        "editor-selection-state",
        onSelectionState as EventListener
      );
  }, []);

  const send = (name: string, detail?: any) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  };

  // Determine if there is any formatting applied
  const noFormatting =
    state.headingLevel === 0 &&
    state.listType === "none" &&
    !state.isBold &&
    !state.isItalic;

  return (
    <div className="flex gap-1 items-center">
      {/* Heading dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-1">
            <span className="tabular-nums">
              <Heading1 className="h-4 w-4" />
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 p-0 overflow-hidden border-border border bg-card">
          <div className="py-2">
            {headingItems.map((item, idx) => (
              <DropdownMenuItem
                key={idx}
                className={`cursor-pointer ${item.className}`}
                onClick={() =>
                  send("editor-set-heading", { level: item.level })
                }
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* List dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-1">
            <List className="h-4 w-4" />
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[12rem] border-border border bg-card">
          <DropdownMenuItem
            onClick={() => send("editor-set-list", { type: "bullet" })}
          >
            Bulleted list
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => send("editor-set-list", { type: "ordered" })}
          >
            Numbered list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Bold */}
      <Button
        variant="ghost"
        className={state.isBold ? "bg-accent" : ""}
        onClick={() => send("editor-toggle-bold")}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>

      {/* Italic */}
      <Button
        variant="ghost"
        className={state.isItalic ? "bg-accent" : ""}
        onClick={() => send("editor-toggle-italic")}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>

      {/* Clear formatting */}
      <Button
        variant="ghost"
        onClick={() => send("editor-clear-formatting")}
        title="Clear formatting"
      >
        <Eraser className={`h-4 w-4${noFormatting ? " opacity-60" : ""}`} />
      </Button>
    </div>
  );
}
