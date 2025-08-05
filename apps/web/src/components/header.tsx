import { useState, useEffect } from "react";
import { Minus, Square, X, FileText, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";

interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  const [currentNoteTitle, setCurrentNoteTitle] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const location = useLocation();

  // Get current note ID from the route
  const currentNoteId = location.pathname.startsWith("/note/")
    ? location.pathname.split("/note/")[1]
    : null;

  // Load note title when note ID changes
  useEffect(() => {
    const loadNoteTitle = async () => {
      if (currentNoteId) {
        try {
          const note = await invoke<{ title: string }>("load_note", {
            id: currentNoteId,
          });
          setCurrentNoteTitle(note.title || "Untitled Note");
        } catch (error) {
          console.error("Failed to load note title:", error);
          setCurrentNoteTitle("Untitled Note");
        }
      } else {
        setCurrentNoteTitle(null);
      }
    };

    loadNoteTitle();
  }, [currentNoteId]);

  const handleMinimize = () => {
    console.log("Minimize clicked");
    invoke("minimize_window").catch((error) => {
      console.error("Failed to minimize window:", error);
    });
  };

  const handleMaximize = () => {
    console.log("Maximize clicked");
    invoke("maximize_window")
      .then(() => {
        // Toggle the state since the backend handles the actual maximize/unmaximize
        setIsMaximized(!isMaximized);
      })
      .catch((error) => {
        console.error("Failed to maximize window:", error);
      });
  };

  const handleClose = () => {
    console.log("Close clicked");
    invoke("close_window").catch((error) => {
      console.error("Failed to close window:", error);
    });
  };

  const title = currentNoteTitle || "Notes";

  return (
    <div
      className={`relative flex items-center h-12 px-4 bg-sidebar/95 backdrop-blur-md border-b border-border select-none header-draggable shadow-lg ${className}`}
    >
      {/* Centered - App icon and title */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 pointer-events-none">
        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
          {title}
        </span>
      </div>

      {/* Right side - Window controls */}
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
  );
}
