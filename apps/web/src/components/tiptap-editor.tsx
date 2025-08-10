import {
  useEditor,
  EditorContent,
  ReactNodeViewRenderer,
  NodeViewWrapper,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import js from "highlight.js/lib/languages/javascript";
import ts from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml"; // html
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import Image from "@tiptap/extension-image";
import React, { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TipTapEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  className?: string;
  // --- NEW: Props for handling programmatic pasting ---
  pastedContent?: string | null;
  onPasteProcessed?: () => void;
}

export function TipTapEditor({
  content = "",
  onChange,
  placeholder = "Start writing...",
  className = "",
  pastedContent,
  onPasteProcessed,
}: TipTapEditorProps) {
  // Create lowlight instance and register common languages
  const lowlight = createLowlight();
  lowlight.register("javascript", js);
  lowlight.register("js", js);
  lowlight.register("typescript", ts);
  lowlight.register("ts", ts);
  lowlight.register("json", json);
  lowlight.register("html", xml);
  lowlight.register("xml", xml);
  lowlight.register("css", css);
  lowlight.register("bash", bash);
  lowlight.register("sh", bash);
  lowlight.register("shell", bash);
  lowlight.register("python", python);
  lowlight.register("py", python);
  lowlight.register("go", go);
  lowlight.register("golang", go);
  lowlight.register("rust", rust);
  lowlight.register("rs", rust);
  lowlight.register("yaml", yaml);
  lowlight.register("yml", yaml);
  lowlight.register("markdown", markdown);
  lowlight.register("md", markdown);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        // Disable default codeBlock; we'll use CodeBlockLowlight for highlighting
        codeBlock: false,
        blockquote: {
          HTMLAttributes: {
            class: "border-l-4 border-muted-foreground/20 pl-4 italic",
          },
        },
        code: {
          HTMLAttributes: {
            class: "rounded bg-muted px-1.5 py-0.5 font-mono text-sm",
          },
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: "rounded-md bg-muted p-4 font-mono text-sm",
        },
      }),
      Image.extend({
        addAttributes() {
          return {
            src: { default: null },
            alt: { default: null },
            title: { default: null },
            width: {
              default: null,
              renderHTML: (attrs: { width?: number | null }) => ({
                style: attrs.width ? `width: ${attrs.width}px;` : undefined,
              }),
              parseHTML: (element: HTMLElement) => {
                const width = element.style.width;
                if (!width) return null;
                const match = width.match(/(\d+(?:\.\d+)?)px/);
                return match ? Number(match[1]) : null;
              },
            },
            float: {
              default: null as "left" | "right" | null,
              renderHTML: (attrs: { float?: "left" | "right" | null }) => ({
                class:
                  attrs.float === "left"
                    ? "image-float-left"
                    : attrs.float === "right"
                      ? "image-float-right"
                      : undefined,
              }),
            },
            dataPath: { default: null },
          };
        },
        group: "inline",
        inline() {
          return true;
        },
        draggable: true,
        selectable: true,
        addNodeView() {
          return ReactNodeViewRenderer(ResizableImage);
        },
      }),
      // Cast to any to avoid v3 type mismatch in the third-party Markdown extension typings
      Markdown.configure({
        html: true, // Keep this true to allow existing HTML to be parsed correctly.
        tightLists: false,
        bulletListMarker: "-",
        linkify: true,
        breaks: true,
      }) as any,
    ],
    content,
    editorProps: {
      attributes: {
        class: `mx-auto focus:outline-none ${className}`,
        "data-placeholder": placeholder,
      },
      handleDrop(view, event) {
        const dt = (event as DragEvent).dataTransfer;
        if (!dt) return false;
        const custom = dt.getData("text/notesv2-clipboard");
        const plain = dt.getData("text/plain");
        const text = custom || plain;
        if (text) {
          event.preventDefault();
          const chain = editor?.chain().focus();
          if (!chain) return false;
          const hasBackticks = /```/.test(text);
          const isMultiline = text.split("\n").length >= 3;
          const hasIndentedLines =
            text.split("\n").filter((l) => /^\s{2,}|\t/.test(l)).length >= 2;
          const hasCodeChars =
            /(;|\{|\}|=>|#include|import\s+|function\s+|class\s+)/.test(text);

          if (
            hasBackticks ||
            (isMultiline && (hasIndentedLines || hasCodeChars))
          ) {
            let language: string | undefined;
            let body = text;
            const trimmed = text.trim();
            const fenceMatch = trimmed.match(/^```(\w+)?\n([\s\S]*?)\n```$/);
            if (fenceMatch) {
              language = fenceMatch[1];
              body = fenceMatch[2] ?? trimmed.replace(/```/g, "").trim();
              chain
                .setCodeBlock({ language: language ?? "plaintext" })
                .insertContent(body)
                .run();
            } else {
              // Not a single fenced block: insert as plain text
              const isEmpty = editor!.state.doc.textContent.length === 0;
              chain
                .command(({ tr, dispatch }) => {
                  if (dispatch && !isEmpty) {
                    tr.insertText("\n");
                  }
                  return true;
                })
                .insertContent(text)
                .run();
            }
          } else {
            const isEmpty = editor!.state.doc.textContent.length === 0;
            chain
              .command(({ tr, dispatch }) => {
                if (dispatch && !isEmpty) {
                  tr.insertText("\n");
                }
                return true;
              })
              .insertContent(text)
              .run();
          }
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((it) => it.type.startsWith("image/"));

        if (imageItem) {
          event.preventDefault();
          const file = imageItem.getAsFile();
          if (!file) return true;
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = String(reader.result);
            const chain = editor?.chain().focus();
            if (!chain) return;
            chain
              .setImage({
                src: dataUrl,
                alt: file.name,
                title: file.name,
                width: 480,
              })
              .run();
            try {
              const path: string = await invoke("save_image_base64", {
                data: dataUrl,
                suggested_name: file.name,
              });
              editor
                ?.chain()
                .focus()
                .updateAttributes("image", { dataPath: path })
                .run();
            } catch (e) {
              // ignore persistence failure
            }
          };
          reader.readAsDataURL(file);
          return true;
        }

        // Heuristics to detect code snippets
        const hasBackticks = /```/.test(text);
        const isMultiline = text.split("\n").length >= 3;
        const hasIndentedLines =
          text.split("\n").filter((l) => /^\s{2,}|\t/.test(l)).length >= 2;
        const hasCodeChars =
          /(;|\{|\}|=>|#include|import\s+|function\s+|class\s+)/.test(text);

        if (
          hasBackticks ||
          (isMultiline && (hasIndentedLines || hasCodeChars))
        ) {
          event.preventDefault();

          // Extract language from fenced code block if provided
          const chain = editor?.chain().focus();
          if (!chain) return false;

          const trimmed = text.trim();
          const fenceMatch = trimmed.match(/^```(\w+)?\n([\s\S]*?)\n```$/);
          if (fenceMatch) {
            const language = fenceMatch[1];
            const body = fenceMatch[2] ?? trimmed.replace(/```/g, "").trim();
            chain
              .setCodeBlock({ language: language ?? "plaintext" })
              .insertContent(body)
              .run();
          } else {
            // Not a single fenced block: insert as plain text
            chain.insertContent(text).run();
          }
          return true;
        }

        return false; // fall back to default handling
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // Listen to toolbar commands
  useEffect(() => {
    if (!editor) return;
    const setHeading = (e: Event) => {
      const level =
        (e as CustomEvent<{ level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }>).detail
          ?.level ?? 0;
      if (level === 0) {
        editor.chain().focus().setParagraph().run();
      } else if (level >= 1 && level <= 6) {
        editor
          .chain()
          .focus()
          .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
          .run();
      }
    };
    const setList = (e: Event) => {
      const type = (e as CustomEvent<{ type: "bullet" | "ordered" }>).detail
        ?.type;
      if (type === "bullet") {
        editor.chain().focus().toggleBulletList().run();
      } else if (type === "ordered") {
        editor.chain().focus().toggleOrderedList().run();
      }
    };
    const toggleBold = () => editor.chain().focus().toggleBold().run();
    const toggleItalic = () => editor.chain().focus().toggleItalic().run();
    const clearFormatting = () => {
      editor.chain().focus().unsetAllMarks().clearNodes().run();
    };

    window.addEventListener("editor-set-heading", setHeading as EventListener);
    window.addEventListener("editor-set-list", setList as EventListener);
    window.addEventListener("editor-toggle-bold", toggleBold as EventListener);
    window.addEventListener(
      "editor-toggle-italic",
      toggleItalic as EventListener
    );
    window.addEventListener(
      "editor-clear-formatting",
      clearFormatting as EventListener
    );

    return () => {
      window.removeEventListener(
        "editor-set-heading",
        setHeading as EventListener
      );
      window.removeEventListener("editor-set-list", setList as EventListener);
      window.removeEventListener(
        "editor-toggle-bold",
        toggleBold as EventListener
      );
      window.removeEventListener(
        "editor-toggle-italic",
        toggleItalic as EventListener
      );
      window.removeEventListener(
        "editor-clear-formatting",
        clearFormatting as EventListener
      );
    };
  }, [editor]);

  // Broadcast selection state so the toolbar can reflect active formats
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const isBold = editor.isActive("bold");
      const isItalic = editor.isActive("italic");
      let headingLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0;
      for (let l = 1 as 1 | 2 | 3 | 4 | 5 | 6; l <= 6; l = (l + 1) as any) {
        if (editor.isActive("heading", { level: l })) {
          headingLevel = l;
          break;
        }
      }
      const listType = editor.isActive("bulletList")
        ? ("bullet" as const)
        : editor.isActive("orderedList")
          ? ("ordered" as const)
          : ("none" as const);
      const detail = { headingLevel, listType, isBold, isItalic } as const;
      window.dispatchEvent(
        new CustomEvent("editor-selection-state", { detail })
      );
    };
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  // --- NEW: Effect to handle pasted content from props ---
  useEffect(() => {
    if (editor && pastedContent) {
      const text = pastedContent;
      const chain = editor.chain().focus();
      const trimmed = text.trim();
      const fenceMatch = trimmed.match(/^```(\w+)?\n([\s\S]*?)\n```$/);

      if (fenceMatch) {
        const language = fenceMatch[1];
        const body = fenceMatch[2] ?? trimmed.replace(/```/g, "").trim();
        chain
          .setCodeBlock({ language: language ?? "plaintext" })
          .insertContent(body)
          .run();
      } else {
        const isEmpty = editor.state.doc.textContent.length === 0;
        chain
          .command(({ tr, dispatch }) => {
            if (dispatch && !isEmpty) {
              tr.insertText("\n");
            }
            return true;
          })
          .insertContent(text)
          .run();
      }

      onPasteProcessed?.();
    }
  }, [pastedContent, editor, onPasteProcessed]);

  // Listen for image insertion requests coming from the screenshot toast
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ dataUrl: string; path?: string }>;
      const dataUrl = ev.detail?.dataUrl;
      if (!dataUrl) return;
      const chain = editor.chain().focus();
      chain
        .setImage({
          src: dataUrl,
          title: "Screenshot",
          alt: "Screenshot",
          width: 640,
        })
        .run();
    };
    window.addEventListener(
      "insert-image-into-editor",
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        "insert-image-into-editor",
        handler as EventListener
      );
  }, [editor]);

  // Update content when the main content prop changes (e.g., loading a note)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // This is still needed to load initial content into the editor.
      // Use setContent with proper options to handle HTML content
      editor.commands.setContent(content, {
        parseOptions: {
          preserveWhitespace: "full",
        },
      });
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full backdrop-blur-sm bg-transparent">
      <EditorContent
        editor={editor}
        className={`min-h-[200px] w-full p-4 focus:outline-none backdrop-blur-sm scrollbar-custom ${className}`}
      />
    </div>
  );
}

// Utils
// Image NodeView with resize handle and float controls
type ResizableImageProps = {
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  selected: boolean;
  editor: any;
};

const ResizableImage: React.FC<ResizableImageProps> = ({
  node,
  updateAttributes,
  selected,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef<number | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startX.current = e.clientX;
      const img = wrapperRef.current?.querySelector("img");
      startWidth.current = img
        ? img.getBoundingClientRect().width
        : (node.attrs.width ?? 320);
      const onMove = (ev: MouseEvent) => {
        if (startWidth.current == null) return;
        const delta = ev.clientX - startX.current;
        const newWidth = Math.max(
          120,
          Math.min(1200, startWidth.current + delta)
        );
        updateAttributes({ width: Math.round(newWidth) });
      };
      const onUp = () => {
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [updateAttributes, node.attrs.width]
  );

  const floatLeft = () => updateAttributes({ float: "left" });
  const floatRight = () => updateAttributes({ float: "right" });
  const floatNone = () => updateAttributes({ float: null });

  return (
    <NodeViewWrapper
      as="figure"
      className={`tiptap-image-node relative inline-block ${
        selected ? "ring-2 ring-accent" : ""
      }`}
      ref={wrapperRef as any}
      contentEditable={false}
    >
      <img
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        title={node.attrs.title || ""}
        style={{
          width: node.attrs.width ? `${node.attrs.width}px` : undefined,
        }}
        className={`max-w-full h-auto rounded-md shadow-sm ${
          node.attrs.float === "left"
            ? "image-float-left"
            : node.attrs.float === "right"
              ? "image-float-right"
              : ""
        }`}
      />
      <div
        className="resize-handle absolute -bottom-2 right-1 w-3 h-3 bg-foreground rounded-sm cursor-ew-resize opacity-80"
        onMouseDown={onMouseDown}
      />
      {selected && (
        <div className="absolute -top-8 left-0 flex items-center gap-2 bg-card/90 border border-border rounded px-2 py-1 shadow">
          <button
            onClick={floatLeft}
            className="text-xs px-1 py-0.5 hover:underline"
          >
            Left
          </button>
          <button
            onClick={floatNone}
            className="text-xs px-1 py-0.5 hover:underline"
          >
            None
          </button>
          <button
            onClick={floatRight}
            className="text-xs px-1 py-0.5 hover:underline"
          >
            Right
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
};
