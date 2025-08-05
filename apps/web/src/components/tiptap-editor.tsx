import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";
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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        codeBlock: {
          HTMLAttributes: {
            class: "rounded-md bg-muted p-4 font-mono text-sm",
          },
        },
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
      Markdown.configure({
        html: true, // Keep this true to allow existing HTML to be parsed correctly.
        tightLists: false,
        bulletListMarker: "-",
        linkify: true,
        breaks: true,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: `mx-auto focus:outline-none ${className}`,
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // --- NEW: Effect to handle pasted content from props ---
  useEffect(() => {
    if (editor && pastedContent) {
      // Use Tiptap's command to insert content.
      // This correctly parses the new markdown without destroying existing content.
      const { from, to } = editor.state.selection;

      // Check if the editor is empty (contains only an empty paragraph)
      const isEmpty = editor.state.doc.textContent.length === 0;

      // Chain commands to ensure proper insertion
      editor
        .chain()
        .focus()
        // If not empty, add a newline before inserting to create a new block
        .command(({ tr, dispatch }) => {
          if (dispatch && !isEmpty) {
            tr.insertText("\n");
          }
          return true;
        })
        .insertContent(pastedContent)
        .run();

      // Notify the parent component that we've processed the paste
      onPasteProcessed?.();
    }
  }, [pastedContent, editor, onPasteProcessed]);

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
    <div className="w-full backdrop-blur-sm">
      <EditorContent
        editor={editor}
        className={`min-h-[200px] w-full p-4 focus:outline-none backdrop-blur-sm scrollbar-custom ${className}`}
      />
    </div>
  );
}
