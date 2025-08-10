"use client";
import {
  Bold,
  Eraser,
  Heading1,
  Italic,
  Link,
  List,
  Settings,
  Settings2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import AppMenubar from "./app-menubar";
import EditorFormatToolbar from "./editor-format-toolbar";

const Toolbar = () => {
  return (
    <div className="flex w-full bg-card">
      <div className="flex items-center justify-between w-full">
        <div className="py-1">
          <AppMenubar />
        </div>
        <div className="py-1 flex gap-1">
          <EditorFormatToolbar />
        </div>
        <div className="py-1 flex gap-1"></div>
        <div className="py-1">
          <Button variant="ghost">
            <Settings />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
