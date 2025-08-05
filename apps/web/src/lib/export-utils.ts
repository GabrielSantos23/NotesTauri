import { invoke } from "@tauri-apps/api/core";

export interface Note {
  id: string;
  title: string;
  content: string;
  links: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Export a note to Markdown format using native file dialog
 */
export const exportAndDownloadNote = async (noteId: string): Promise<void> => {
  try {
    // Use the new dialog-based export function
    await invoke("export_note_with_dialog", { noteId });
    console.log("✅ Note exported successfully using native dialog");
  } catch (error) {
    console.error("Failed to export note:", error);
    throw error;
  }
};

/**
 * Legacy function for backward compatibility
 * @deprecated Use exportAndDownloadNote instead
 */
export const exportNoteToMarkdown = async (noteId: string): Promise<string> => {
  try {
    // Load the note from the backend
    const note = await invoke<Note>("load_note", { id: noteId });

    // Convert to Markdown format
    const markdown = convertNoteToMarkdown(note);

    return markdown;
  } catch (error) {
    console.error("Failed to export note to Markdown:", error);
    throw new Error("Failed to export note");
  }
};

/**
 * Convert a note object to Markdown format
 */
export const convertNoteToMarkdown = (note: Note): string => {
  const lines: string[] = [];

  // Add title as H1
  lines.push(`# ${note.title || "Untitled Note"}`);
  lines.push(""); // Empty line

  // Add content
  if (note.content.trim()) {
    lines.push(note.content);
    lines.push(""); // Empty line
  }

  // Add links section if there are any
  if (note.links && note.links.length > 0) {
    lines.push("## Links");
    lines.push("");
    note.links.forEach((link) => {
      lines.push(`- ${link}`);
    });
    lines.push(""); // Empty line
  }

  // Add metadata as comments
  lines.push("---");
  lines.push(`Created: ${new Date(note.created_at).toLocaleString()}`);
  lines.push(`Updated: ${new Date(note.updated_at).toLocaleString()}`);
  lines.push(`Note ID: ${note.id}`);
  lines.push("---");

  return lines.join("\n");
};

/**
 * Download a file with the given content and filename
 * @deprecated Use exportAndDownloadNote instead
 */
export const downloadFile = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
