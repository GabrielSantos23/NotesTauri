"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  Pin,
  PinOff,
  Trash2,
  RotateCcw,
  Clock,
  Settings,
  X,
} from "lucide-react";
import { toast } from "sonner";

type ClipboardEntry = {
  id: string;
  text: string;
  pinned: boolean;
  timestamp: string;
};

export function RightSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const [history, setHistory] = useState<ClipboardEntry[]>([]);
  const [limit, setLimit] = useState<number>(50);
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((e) => e.text.toLowerCase().includes(q));
  }, [history, search]);

  const load = useCallback(async () => {
    try {
      const [items, lim] = await Promise.all([
        invoke<ClipboardEntry[]>("get_clipboard_history"),
        invoke<number>("get_clipboard_history_limit"),
      ]);
      setHistory(items);
      setLimit(lim);
    } catch (e) {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let unlistenText: (() => void) | undefined;
    let unlistenImage: (() => void) | undefined;
    listen("clipboard-changed", () => load()).then((u) => {
      unlistenText = u;
    });
    listen("clipboard-image", (event) => {
      const payload = event.payload as {
        data_url: string;
        width: number;
        height: number;
      };
      if (!payload?.data_url) return;
      const id = Math.random().toString(36).slice(2);
      toast("Add screenshot to notes?", {
        id,
        description: "We detected a screenshot in your clipboard.",
        action: {
          label: "Accept",
          onClick: async () => {
            try {
              const path: string = await invoke("save_image_base64", {
                data: payload.data_url,
                suggested_name: `screenshot_${Date.now()}.png`,
              });
              window.dispatchEvent(
                new CustomEvent("insert-image-into-editor", {
                  detail: { dataUrl: payload.data_url, path },
                })
              );
            } catch (e) {
              toast.error("Failed to save screenshot");
            }
          },
        },
        cancel: {
          label: "Refuse",
          onClick: () => {},
        },
      });
    }).then((u) => {
      unlistenImage = u;
    });
    return () => {
      if (unlistenText) unlistenText();
      if (unlistenImage) unlistenImage();
    };
  }, [load]);

  const handlePin = async (id: string, pinned: boolean) => {
    try {
      await invoke("pin_clipboard_entry", { id, pinned });
      await load();
    } catch (e) {
      toast.error("Failed to update pin");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_clipboard_entry", { id });
      await load();
    } catch (e) {
      toast.error("Failed to delete entry");
    }
  };

  const handleRestore = async (text: string) => {
    try {
      await invoke("restore_clipboard_entry", { text });
      try {
        // Also write via Web Clipboard API to improve reliability across targets
        await navigator.clipboard.writeText(text);
      } catch {}
      toast.success("Copied to clipboard");
    } catch (e) {
      toast.error("Failed to restore to clipboard");
    }
  };

  const handleClear = async (keepPinned: boolean) => {
    try {
      await invoke("clear_clipboard_history", { keepPinned });
      await load();
    } catch (e) {
      toast.error("Failed to clear history");
    }
  };

  const handleSetLimit = async (newLimit: number) => {
    try {
      await invoke("set_clipboard_history_limit", { limit: newLimit });
      setLimit(newLimit);
      await load();
    } catch (e) {
      toast.error("Failed to set limit");
    }
  };

  return (
    <Sidebar {...props}>
      <SidebarRail />
      <SidebarHeader>
        <SidebarMenu>
          <div className="px-2 py-1 flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Clipboard History
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleClear(true)}
                title="Clear non-pinned"
              >
                <X className="size-3 mr-1" />
                Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleClear(false)}
                title="Clear all"
              >
                <Trash2 className="size-3 mr-1" />
                All
              </Button>
            </div>
          </div>
          <div className="px-2 pb-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 text-xs"
            />
          </div>
        </SidebarMenu>
        <SidebarSeparator />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground">
                Entries ({filtered.length})
              </span>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-xs text-muted-foreground">
                  Nothing copied yet
                </div>
              ) : (
                filtered.map((e) => (
                  <SidebarMenuItem key={e.id}>
                    <div className="group/menu-item w-full">
                      <SidebarMenuButton asChild className="items-start">
                        <div
                          className="flex flex-col gap-1"
                          draggable
                          onDragStart={(ev) => {
                            try {
                              ev.dataTransfer?.setData("text/plain", e.text);
                              ev.dataTransfer?.setData(
                                "text/notesv2-clipboard",
                                e.text
                              );
                            } catch {}
                          }}
                          title="Drag into editor to insert"
                        >
                          <div className="text-xs whitespace-pre-wrap break-words max-w-[7rem]">
                            {e.text.length > 100
                              ? e.text.slice(0, 100) + "…"
                              : e.text}
                          </div>
                          <div className="flex items-center gap-1 opacity-70 text-[10px]">
                            {e.pinned ? (
                              <span className="px-1 rounded bg-muted">
                                Pinned
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </SidebarMenuButton>
                      <div className="absolute right-1 top-1 flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handlePin(e.id, !e.pinned)}
                          title={e.pinned ? "Unpin" : "Pin"}
                        >
                          {e.pinned ? (
                            <PinOff className="size-3" />
                          ) : (
                            <Pin className="size-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRestore(e.text)}
                          title="Copy to clipboard"
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDelete(e.id)}
                          title="Delete entry"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="text-xs text-muted-foreground px-3 py-2">
        <div className="flex items-center justify-between">
          <span>{history.length} total</span>
          <span className="flex items-center gap-1">
            <Settings className="size-3" />
            Ctrl/Cmd+Alt+B toggles
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
