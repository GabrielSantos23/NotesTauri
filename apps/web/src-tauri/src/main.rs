// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::{command, Emitter};
use tauri_plugin_clipboard_manager::{init as clipboard_manager_plugin, ClipboardExt};

use tauri_plugin_opener::OpenerExt;
use window_vibrancy::apply_acrylic;
use tauri::Manager;
use std::sync::{Arc, Mutex};
use app_lib::{AppState, Note, NoteMetadata, SidebarState, ClipboardContent};
use rfd::FileDialog;

fn get_notes_dir() -> Result<PathBuf, String> {
    let documents_dir = dirs::document_dir()
        .ok_or("Failed to get documents directory")?;
    let notes_dir = documents_dir.join("Notes_V2");
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Failed to create notes directory: {}", e))?;
    Ok(notes_dir)
}

fn get_app_data_dir() -> Result<PathBuf, String> {
    let documents_dir = dirs::document_dir()
        .ok_or("Failed to get documents directory")?;
    let app_data_dir = documents_dir.join("Notes_V2").join("app_data");
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    Ok(app_data_dir)
}

fn load_notes_from_disk() -> Result<Vec<Note>, String> {
    let notes_dir = get_notes_dir()?;
    let mut notes = Vec::new();

    if let Ok(entries) = fs::read_dir(notes_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(note) = serde_json::from_str::<Note>(&content) {
                            notes.push(note);
                        }
                    }
                }
            }
        }
    }

    // Sort by updated_at descending (most recent first)
    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(notes)
}

fn save_note_to_disk(note: &Note) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    let file_path = notes_dir.join(format!("{}.json", note.id));
    
    let json = serde_json::to_string_pretty(note)
        .map_err(|e| format!("Failed to serialize note: {}", e))?;

    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write note file: {}", e))?;

    Ok(())
}

fn delete_note_from_disk(note_id: &str) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    let file_path = notes_dir.join(format!("{}.json", note_id));

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete note file: {}", e))?;
    }

    Ok(())
}

#[command]
fn save_sidebar_state(state: SidebarState, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    println!("💾 Saving sidebar state with {} notes", state.notes.len());
    
    // Save to memory
    if let Ok(mut sidebar_state) = app_state.sidebar_state.lock() {
        *sidebar_state = Some(state.clone());
    }

    // Save to disk
    let app_data_dir = get_app_data_dir()?;
    let file_path = app_data_dir.join("sidebar_state.json");
    
    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize sidebar state: {}", e))?;

    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write sidebar state file: {}", e))?;

    println!("✅ Sidebar state saved successfully");
    Ok(())
}

#[command]
fn load_sidebar_state(app_state: tauri::State<'_, AppState>) -> Result<Option<SidebarState>, String> {
    println!("🔍 Loading sidebar state...");
    
    // Try to load from disk first
    let app_data_dir = get_app_data_dir()?;
    let file_path = app_data_dir.join("sidebar_state.json");

    if file_path.exists() {
        let content = fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read sidebar state file: {}", e))?;
        
        let state: SidebarState = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse sidebar state: {}", e))?;

        // Also save to memory
        if let Ok(mut sidebar_state) = app_state.sidebar_state.lock() {
            *sidebar_state = Some(state.clone());
        }

        println!("✅ Loaded sidebar state with {} notes", state.notes.len());
        Ok(Some(state))
    } else {
        println!("❌ No sidebar state file found");
        Ok(None)
    }
}

#[command]
fn save_note(title: String, content: String, links: Vec<String>, app_state: tauri::State<'_, AppState>) -> Result<String, String> {
    let now = Utc::now();
    let id = format!("note_{}", now.timestamp_millis());

    let note = Note {
        id: id.clone(),
        title: title.clone(),
        content,
        links,
        created_at: now,
        updated_at: now,
    };

    // Save to memory
    if let Ok(mut notes) = app_state.notes.lock() {
        notes.push(note.clone());
    }

    // Save to disk
    save_note_to_disk(&note)?;

    println!("✅ Note saved with ID: {}", id);
    Ok(id)
}

#[command]
fn update_note(id: String, title: String, content: String, links: Vec<String>, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut notes) = app_state.notes.lock() {
        if let Some(note) = notes.iter_mut().find(|n| n.id == id) {
            note.title = title;
            note.content = content;
            note.links = links;
            note.updated_at = Utc::now();

            // Save updated note to disk
            save_note_to_disk(note)?;

            println!("✅ Note updated: {}", id);
            Ok(())
        } else {
            Err("Note not found".to_string())
        }
    } else {
        Err("Failed to lock notes state".to_string())
    }
}

#[command]
fn load_note(id: String, app_state: tauri::State<'_, AppState>) -> Result<Note, String> {
    if let Ok(notes) = app_state.notes.lock() {
        if let Some(note) = notes.iter().find(|n| n.id == id) {
            Ok(note.clone())
        } else {
            Err("Note not found".to_string())
        }
    } else {
        Err("Failed to lock notes state".to_string())
    }
}

#[command]
fn list_notes(app_state: tauri::State<'_, AppState>) -> Result<Vec<NoteMetadata>, String> {
    if let Ok(notes) = app_state.notes.lock() {
        let metadata: Vec<NoteMetadata> = notes
            .iter()
            .map(|note| NoteMetadata {
                id: note.id.clone(),
                title: note.title.clone(),
                created_at: note.created_at,
                updated_at: note.updated_at,
            })
            .collect();

        println!("📝 Listed {} notes", metadata.len());
        Ok(metadata)
    } else {
        Err("Failed to lock notes state".to_string())
    }
}

#[command]
fn delete_note(id: String, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut notes) = app_state.notes.lock() {
        if let Some(index) = notes.iter().position(|n| n.id == id) {
            notes.remove(index);

            // Delete from disk
            delete_note_from_disk(&id)?;

            println!("✅ Note deleted: {}", id);
            Ok(())
        } else {
            Err("Note not found".to_string())
        }
    } else {
        Err("Failed to lock notes state".to_string())
    }
}

#[command]
fn open_url(url: String) -> Result<(), String> {
    let result = if cfg!(target_os = "windows") {
        Command::new("cmd").args(&["/C", "start", &url]).output()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(&url).output()
    } else {
        // Linux and other Unix-like systems
        Command::new("xdg-open").arg(&url).output()
    };

    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open URL: {}", e)),
    }
}

#[command]
fn minimize_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.minimize().map_err(|e| format!("Failed to minimize window: {}", e))?;
    }
    Ok(())
}

#[command]
fn maximize_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        if window.is_maximized().unwrap_or(false) {
            window.unmaximize().map_err(|e| format!("Failed to unmaximize window: {}", e))?;
        } else {
            window.maximize().map_err(|e| format!("Failed to maximize window: {}", e))?;
        }
    }
    Ok(())
}

#[command]
fn close_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.close().map_err(|e| format!("Failed to close window: {}", e))?;
    }
    Ok(())
}

#[command]
fn is_window_minimized(app_handle: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        Ok(window.is_minimized().unwrap_or(false))
    } else {
        Ok(false)
    }
}

#[command]
fn show_notification(title: String, body: String) -> Result<(), String> {
    // For now, we'll just print to console since native notifications require additional setup
    println!("Notification - Title: {}, Body: {}", title, body);
    Ok(())
}

#[tauri::command]
async fn download_note_as_md(note_id: String, app_state: tauri::State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    // Get the note from AppState
    if let Ok(notes) = app_state.notes.lock() {
        let note = notes
            .iter()
            .find(|n| n.id == note_id)
            .ok_or("Note not found")?;

        // Get the documents directory
        let documents_dir = dirs::document_dir()
            .ok_or("Failed to get documents directory")?;
        let downloads_dir = documents_dir.join("Notes_V2").join("exports");
        
        // Create exports directory if it doesn't exist
        fs::create_dir_all(&downloads_dir)
            .map_err(|e| format!("Failed to create exports directory: {}", e))?;

        let filename = format!("{}.md", sanitize_filename::sanitize(&note.title));
        let file_path = downloads_dir.join(&filename);

        // Convert note to markdown
        let markdown = convert_note_to_markdown(note);

        // Write the markdown file
        fs::write(&file_path, markdown)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        // Use opener plugin to open the file
        let app_handle = app_handle.clone();
        let _ = app_handle.opener().open_path(file_path.to_string_lossy().to_string(), None::<&str>)
            .map_err(|e| format!("Failed to open file: {}", e))?;

        println!("✅ Note exported to: {:?}", file_path);
        Ok(())
    } else {
        Err("Failed to lock notes state".to_string())
    }
}

#[tauri::command]
async fn export_note_with_dialog(note_id: String, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Get the note from AppState
    if let Ok(notes) = app_state.notes.lock() {
        let note = notes
            .iter()
            .find(|n| n.id == note_id)
            .ok_or("Note not found")?;

        // Convert note to markdown
        let markdown = convert_note_to_markdown(note);
        
        // Create default filename
        let default_filename = format!("{}.md", sanitize_filename::sanitize(&note.title));

        // Show native save dialog
        let file_path = FileDialog::new()
            .set_title("Export Note")
            .set_file_name(&default_filename)
            .add_filter("Markdown files", &["md"])
            .add_filter("All files", &["*"])
            .save_file()
            .ok_or("User cancelled the dialog")?;

        // Write the markdown file to the selected location
        fs::write(&file_path, markdown)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        println!("✅ Note exported to: {:?}", file_path);
        Ok(())
    } else {
        Err("Failed to lock notes state".to_string())
    }
}

fn convert_note_to_markdown(note: &Note) -> String {
    let mut lines = Vec::new();

    // Add title as H1
    lines.push(format!("# {}", note.title));
    lines.push("".to_string()); // Empty line

    // Add content
    if !note.content.trim().is_empty() {
        lines.push(note.content.clone());
        lines.push("".to_string()); // Empty line
    }

    // Add links section if there are any
    if !note.links.is_empty() {
        lines.push("## Links".to_string());
        lines.push("".to_string());
        for link in &note.links {
            lines.push(format!("- {}", link));
        }
        lines.push("".to_string()); // Empty line
    }

    // Add metadata as comments
    lines.push("---".to_string());
    lines.push(format!("Created: {}", note.created_at.format("%Y-%m-%d %H:%M:%S")));
    lines.push(format!("Updated: {}", note.updated_at.format("%Y-%m-%d %H:%M:%S")));
    lines.push(format!("Note ID: {}", note.id));
    lines.push("---".to_string());

    lines.join("\n")
}

#[tauri::command]
async fn mark_internal_copy(
    text: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if let Ok(mut last_copy) = app_state.last_internal_copy.lock() {
        *last_copy = text;
    }
    Ok(())
}

#[tauri::command]
async fn get_clipboard_monitoring_enabled(app_state: tauri::State<'_, AppState>) -> Result<bool, String> {
    if let Ok(enabled) = app_state.clipboard_monitoring_enabled.lock() {
        Ok(*enabled)
    } else {
        Err("Failed to lock clipboard monitoring state".to_string())
    }
}

#[tauri::command]
async fn set_clipboard_monitoring_enabled(enabled: bool, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut enabled_state) = app_state.clipboard_monitoring_enabled.lock() {
        *enabled_state = enabled;
        Ok(())
    } else {
        Err("Failed to lock clipboard monitoring state".to_string())
    }
}

fn main() {
    // Load notes from disk on startup
    let initial_notes = match load_notes_from_disk() {
        Ok(notes) => {
            println!("📚 Loaded {} notes from disk", notes.len());
            notes
        }
        Err(e) => {
            println!("⚠️ Failed to load notes from disk: {}", e);
            Vec::new()
        }
    };

    let app_state = AppState {
        is_focused: Arc::new(Mutex::new(false)),
        last_internal_copy: Arc::new(Mutex::new(String::new())),
        notes: Arc::new(Mutex::new(initial_notes)),
        sidebar_state: Arc::new(Mutex::new(None)),
        clipboard_monitoring_enabled: Arc::new(Mutex::new(true)),
    };

    tauri::Builder::default()
        .plugin(clipboard_manager_plugin())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            open_url,
            save_note,
            update_note,
            load_note,
            list_notes,
            delete_note,
            minimize_window,
            maximize_window,
            close_window,
            save_sidebar_state,
            load_sidebar_state,
            is_window_minimized,
            show_notification,
            download_note_as_md,
            export_note_with_dialog,
            mark_internal_copy,
            get_clipboard_monitoring_enabled,
            set_clipboard_monitoring_enabled
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let window = match app.get_webview_window("main") {
                Some(window) => window,
                None => {
                    eprintln!("Failed to get main window");
                    return Ok(());
                }
            };

            #[cfg(target_os = "windows")]
            {
                // Use acrylic for better backdrop blur support
                if let Err(e) = apply_acrylic(&window, Some((18, 18, 18, 125))) {
                    eprintln!("Failed to apply acrylic on Windows: {}", e);
                }
            }

            #[cfg(target_os = "macos")]
            {
                // Note: apply_vibrancy is not available in the current version
                // macOS vibrancy support would need to be implemented differently
            }

            // Start clipboard monitoring in a separate thread
            thread::spawn(move || {
                let mut last_content = String::new();
                println!("Clipboard monitoring thread started");

                loop {
                    // Try to read clipboard using the plugin first
                    let clipboard_manager = app_handle.clipboard();
                    match clipboard_manager.read_text() {
                        Ok(text) => {
                            if !text.is_empty() && text != last_content {
                                last_content = text.clone();
                                println!("Clipboard content detected: {}", text);

                                // Emit event to frontend with new clipboard content
                                if let Err(e) = app_handle.emit(
                                    "clipboard-changed",
                                    ClipboardContent {
                                        text: text.clone(),
                                        from_app: false,
                                    },
                                ) {
                                    eprintln!("Failed to emit clipboard event: {}", e);
                                } else {
                                    println!("Clipboard event emitted successfully");
                                }
                                println!("Clipboard content changed: {}", text);
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to read clipboard: {}", e);
                            // Try alternative clipboard reading method
                            if let Ok(text) = arboard::Clipboard::new().and_then(|mut cb| cb.get_text()) {
                                if !text.is_empty() && text != last_content {
                                    last_content = text.clone();
                                    println!("Clipboard content detected (alternative method): {}", text);
                                    
                                    if let Err(e) = app_handle.emit(
                                        "clipboard-changed",
                                        ClipboardContent {
                                            text: text.clone(),
                                            from_app: false,
                                        },
                                    ) {
                                        eprintln!("Failed to emit clipboard event: {}", e);
                                    } else {
                                        println!("Clipboard event emitted successfully");
                                    }
                                }
                            }
                        }
                    }
                    // Wait a bit before checking again
                    thread::sleep(Duration::from_millis(500));
                }
            });

            println!("Tauri app setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Error while running tauri application: {}", e);
            std::process::exit(1);
        });
}