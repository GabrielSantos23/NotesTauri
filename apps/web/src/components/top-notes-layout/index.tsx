"use client";

import * as React from "react";
import { Outlet } from "@tanstack/react-router";
import { TopNotesBar } from "./top-notes-bar";
import NotesCommand from "@/components/notes-command";
import Toolbar from "./toolbar";

const TopNotesLayout = () => {
  return (
    <div className="flex flex-col h-full">
      <NotesCommand />
      <TopNotesBar />
      <Toolbar />
      <div
        className="flex-1 overflow-y-auto scrollbar-custom"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--muted-foreground) transparent",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
};

export default TopNotesLayout;
