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

const Toolbar = () => {
  return (
    <div className="sticky top-12 z-20 flex w-full bg-card/80 border-b border-border" style={{position: 'sticky'}}>
      <div className="flex items-center justify-between w-full">
        <div className="py-1">
          <Button variant="ghost">File</Button>
          <Button variant="ghost">Edit</Button>
          <Button variant="ghost">View</Button>
        </div>
        <div className="py-1 flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">
                <Heading1 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">
                <List />
              </Button>
            </TooltipTrigger>
            <TooltipContent>List</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">
                <Bold />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bold</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">
                <Italic />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Italic</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">
                <Link />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Link</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">
                <Eraser />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear formatting</TooltipContent>
          </Tooltip>
        </div>
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
