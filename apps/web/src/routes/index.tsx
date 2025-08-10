import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Link, AlertCircle, Globe } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { TipTapEditor } from "@/components/tiptap-editor";
import {
  isValidUrl,
  normalizeUrl,
  parseUrls,
  joinUrls,
  addUrlToUrls,
  extractDomain,
  getFaviconUrl,
} from "@/lib/url-utils";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  console.log("HomeComponent rendered");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [hasLink, setHasLink] = useState(false);
  const [content, setContent] = useState("");
  const [newPastedContent, setNewPastedContent] = useState<string | null>(null);
  const [clipboardMonitoring, setClipboardMonitoring] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [isEditingUrls, setIsEditingUrls] = useState(false);
  const [invalidUrlWarning, setInvalidUrlWarning] = useState<string | null>(
    null
  );
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const linkRef = useRef(link);
  const lastProcessedClipboardRef = useRef<string>("");
  const clipboardProcessingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  const urls = parseUrls(link);

  useEffect(() => {
    linkRef.current = link;
  }, [link]);

  useEffect(() => {
    if (invalidUrlWarning) {
      const timer = setTimeout(() => {
        setInvalidUrlWarning(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [invalidUrlWarning]);

  const saveNote = async () => {
    if (!title.trim() && !content.trim()) return;

    setIsSaving(true);

    // Clear any existing save timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save calls
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const urls = parseUrls(link);
        const noteTitle = title.trim() || "Untitled Note";

        if (currentNoteId) {
          // Update existing note
          await invoke("update_note", {
            id: currentNoteId,
            title: noteTitle,
            content,
            links: urls,
          });

          // Notify sidebar that a note was updated
          window.dispatchEvent(new CustomEvent("note-saved"));
        } else {
          // Create new note
          const noteId = await invoke<string>("save_note", {
            title: noteTitle,
            content,
            links: urls,
          });
          setCurrentNoteId(noteId);
          toast.success("Note saved");

          // Notify sidebar that a new note was created
          window.dispatchEvent(new CustomEvent("note-saved"));
        }
      } catch (error) {
        console.error("Failed to save note:", error);
        toast.error("Failed to save note");
        // Don't throw the error to prevent app restart
      } finally {
        setIsSaving(false);
      }
    }, 1000);
  };

  useEffect(() => {
    if (title.trim() || content.trim()) {
      saveNote();
    }
  }, [title, content, link]);

  useEffect(() => {
    async function setupClipboardMonitoring() {
      console.log("Setting up clipboard monitoring...");
      try {
        const unlisten = await listen("clipboard-changed", (event) => {
          console.log("Clipboard event received:", event);
          const payload = event.payload as {
            text: string;
            from_app: boolean;
          };

          console.log("Clipboard payload:", payload);

          if (!payload || !payload.text || !payload.text.trim()) {
            console.log("Invalid payload or empty text");
            return;
          }
          if (payload.from_app) {
            console.log("Ignoring app-originated clipboard content");
            return;
          }

          // Check if clipboard monitoring is enabled before processing
          invoke<boolean>("get_clipboard_monitoring_enabled")
            .then((enabled) => {
              if (!enabled) {
                console.log("Clipboard monitoring is disabled, ignoring event");
                return;
              }

              const clipboardText = payload.text.trim();

              if (clipboardProcessingTimeoutRef.current) {
                clearTimeout(clipboardProcessingTimeoutRef.current);
              }

              clipboardProcessingTimeoutRef.current = setTimeout(() => {
                console.log("Processing clipboard text:", clipboardText);

                if (lastProcessedClipboardRef.current === clipboardText) {
                  console.log("Already processed this clipboard content");
                  return;
                }

                const isUrl = isValidUrl(clipboardText);
                console.log("Is URL:", isUrl);

                if (isUrl) {
                  const currentLinkValue = linkRef.current;
                  const currentUrls = parseUrls(currentLinkValue);
                  const normalizedUrl = normalizeUrl(clipboardText);

                  if (!currentUrls.includes(normalizedUrl)) {
                    const newUrls = addUrlToUrls(currentUrls, normalizedUrl);
                    const newLinkString = joinUrls(newUrls);
                    setLink(newLinkString);
                    setHasLink(true);
                    lastProcessedClipboardRef.current = clipboardText;
                    console.log("Added URL to links:", normalizedUrl);
                  } else {
                    console.log("URL already exists in links");
                  }
                } else {
                  setNewPastedContent(clipboardText);
                  lastProcessedClipboardRef.current = clipboardText;
                  console.log("Set new pasted content:", clipboardText);
                }
              }, 100);
            })
            .catch((error) => {
              console.error(
                "Failed to check clipboard monitoring state:",
                error
              );
            });
        });
        console.log("Clipboard monitoring setup successful");
        setClipboardMonitoring(true);
        setClipboardError(null);

        return () => {
          unlisten();
          if (clipboardProcessingTimeoutRef.current) {
            clearTimeout(clipboardProcessingTimeoutRef.current);
          }
        };
      } catch (error) {
        console.error("Failed to setup clipboard monitoring:", error);
        setClipboardMonitoring(false);
        setClipboardError(
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    setupClipboardMonitoring();
  }, []);

  const handleLinkChange = (value: string) => {
    const trimmedValue = value.trim();
    if (trimmedValue === "") {
      setLink("");
      setHasLink(false);
      setInvalidUrlWarning(null);
      return;
    }
    const parsedUrls = parseUrls(trimmedValue);
    const invalidUrls = parsedUrls.filter((url) => !isValidUrl(url));
    if (invalidUrls.length === 0) {
      setLink(value);
      setHasLink(true);
      setInvalidUrlWarning(null);
    } else {
      setInvalidUrlWarning(`Invalid URL detected: ${invalidUrls.join(", ")}`);
    }
  };

  const handleTitleChange = (value: string) => {
    if (value.length <= 100) {
      setTitle(value);
    }
  };

  const handleSaveAndNavigate = async () => {
    if (!currentNoteId) {
      await saveNote();
    } else {
      // Use proper navigation to avoid app restart
      navigate({ to: "/note/$noteId", params: { noteId: currentNoteId } });
    }
  };

  const ClickableUrl = ({
    url,
    onClick,
  }: {
    url: string;
    onClick: () => void;
  }) => {
    const domain = extractDomain(url);
    const faviconUrl = getFaviconUrl(url);

    return (
      <button
        type="button"
        className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-muted hover:bg-accent transition-colors text-sm"
        onClick={onClick}
      >
        <img
          src={faviconUrl}
          alt={`${domain} favicon`}
          className="w-4 h-4 rounded-sm"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            e.currentTarget.nextElementSibling?.classList.remove("hidden");
          }}
        />
        <Globe className="w-4 h-4 hidden" />
        <span className="truncate max-w-[200px]">{domain}</span>
        <ExternalLink className="w-3 h-3" />
      </button>
    );
  };

  return (
    <div className="flex  w-full flex-col backdrop-blur-md  h-screen">
      <div className="flex h-full w-full max-w-4xl mx-auto p-4 sm:p-8 lg:p-12">
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <Input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-4xl font-bold border-none shadow-none focus-visible:ring-0 p-0 h-auto bg-transparent !h-auto !text-4xl !font-bold !border-none !shadow-none !focus-visible:ring-0 !p-0 !bg-transparent"
                placeholder="Title"
                maxLength={100}
              />
            </div>
            {isSaving && (
              <div className="text-sm text-muted-foreground ml-4">
                Saving...
              </div>
            )}
            {currentNoteId && (
              <button
                onClick={handleSaveAndNavigate}
                className="text-sm text-primary hover:text-primary/80 transition-colors ml-4"
              >
                Open Note
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 w-full">
            <div className="w-full flex items-center gap-2 text-muted-foreground">
              <Link className="size-4" />
              <div className="flex-1 flex flex-wrap gap-2 items-center min-h-[40px] p-2">
                {urls.length > 0 && !isEditingUrls ? (
                  <>
                    {urls.map((url, index) => (
                      <ClickableUrl
                        key={index}
                        url={url}
                        onClick={() => {
                          invoke("open_url", { url: url }).catch(() => {
                            window.open(url, "_blank", "noopener,noreferrer");
                          });
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsEditingUrls(true)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded"
                    >
                      Edit
                    </button>
                  </>
                ) : (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={link}
                      onChange={(e) => handleLinkChange(e.target.value)}
                      className="text-sm border-none shadow-none focus-visible:ring-0 p-0 h-auto !bg-transparent transition-colors duration-300 ease-in-out flex-1"
                      placeholder="Paste a link or click 'Edit' to add one..."
                      type="url"
                      readOnly={!isEditingUrls && urls.length > 0}
                      onFocus={() => setIsEditingUrls(true)}
                      onBlur={() => {
                        if (urls.length > 0) {
                          setIsEditingUrls(false);
                        }
                      }}
                    />
                    {isEditingUrls && (
                      <button
                        type="button"
                        onClick={() => setIsEditingUrls(false)}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded"
                      >
                        Done
                      </button>
                    )}
                  </div>
                )}
              </div>

              {invalidUrlWarning && (
                <div className="flex items-center gap-2 mt-1 text-sm text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  <span>{invalidUrlWarning}</span>
                </div>
              )}
            </div>
            {hasLink && urls.length > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    className="group p-0 m-0 bg-transparent border-none flex items-center gap-2"
                    onClick={() => {
                      if (urls[0]) {
                        invoke("open_url", { url: urls[0] }).catch(() => {
                          window.open(urls[0], "_blank", "noopener,noreferrer");
                        });
                      }
                    }}
                  >
                    <img
                      src={getFaviconUrl(urls[0])}
                      alt={`${extractDomain(urls[0])} favicon`}
                      className="w-4 h-4 rounded-sm"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextElementSibling?.classList.remove(
                          "hidden"
                        );
                      }}
                    />
                    <Globe className="w-4 h-4 hidden" />
                    <span className="text-sm text-muted-foreground truncate max-w-[150px] sm:max-w-[200px] group-hover:text-primary transition-colors">
                      {extractDomain(urls[0])}
                    </span>
                    <ExternalLink className="size-4 text-muted-foreground cursor-pointer transition-colors flex-shrink-0 group-hover:text-primary" />
                  </button>
                </div>

                {urls.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center justify-center w-6 h-6 rounded-md bg-muted hover:bg-accent transition-colors flex-shrink-0">
                        <span className="text-xs font-medium">
                          +{urls.length - 1}
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-64 max-h-64 overflow-y-auto"
                    >
                      {urls.slice(1).map((url, index) => (
                        <DropdownMenuItem
                          key={index}
                          onClick={() => {
                            invoke("open_url", { url: url }).catch(() => {
                              window.open(url, "_blank", "noopener,noreferrer");
                            });
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <img
                            src={getFaviconUrl(url)}
                            alt={`${extractDomain(url)} favicon`}
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              e.currentTarget.nextElementSibling?.classList.remove(
                                "hidden"
                              );
                            }}
                          />
                          <Globe className="w-4 h-4 hidden flex-shrink-0" />
                          <span className="truncate flex-1 text-xs">
                            {extractDomain(url)}
                          </span>
                          <ExternalLink className="size-3 flex-shrink-0" />
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 flex-1 min-h-0">
            <TipTapEditor
              content={content}
              onChange={setContent}
              pastedContent={newPastedContent}
              onPasteProcessed={() => setNewPastedContent(null)}
              placeholder="Start writing your notes..."
              className="min-h-[500px] text-lg leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
