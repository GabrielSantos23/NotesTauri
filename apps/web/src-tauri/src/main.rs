// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{Utc, Duration as ChronoDuration};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{command, Emitter};
use tauri_plugin_clipboard_manager::{init as clipboard_manager_plugin, ClipboardExt};

use tauri_plugin_opener::OpenerExt;
use window_vibrancy::apply_acrylic;
use tauri::Manager;
use std::sync::{Arc, Mutex};
use app_lib::{AppState, Note, NoteMetadata, SidebarState, ClipboardContent, ClipboardHistoryEntry, Rule};
use regex::Regex;
use url::Url;
use serde::Serialize;
use sha2::{Digest, Sha256};
use png::{Encoder, ColorType, BitDepth};

#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowTextLengthW};

fn normalize_text_for_hash(text: &str) -> String {
    let lowered = text.to_lowercase();
    let collapsed_ws = lowered.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed_ws.trim().to_string()
}

fn compute_text_hash(text: &str) -> String {
    let normalized = normalize_text_for_hash(text);
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn is_url(text: &str) -> bool {
    Url::parse(text).is_ok()
}

fn extract_domain(url: &str) -> Option<String> {
    Url::parse(url).ok().and_then(|u| u.domain().map(|d| d.to_string()))
}

fn detect_capture_type(text: &str) -> String {
    if is_url(text) { return "link".to_string(); }
    let looks_like_code = text.contains('\n') && (text.contains(';') || text.contains('{') || text.contains('}') || text.contains("fn ") || text.contains("class "));
    if looks_like_code { return "code".to_string(); }
    "text".to_string()
}

#[cfg(target_os = "windows")]
fn get_active_window_info() -> (Option<String>, Option<String>) {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() { return (None, None); }
        let len = GetWindowTextLengthW(hwnd);
        let mut buf: Vec<u16> = vec![0; (len + 2) as usize];
        let read = GetWindowTextW(hwnd, &mut buf);
        let title = if read > 0 { String::from_utf16_lossy(&buf[..read as usize]) } else { String::new() };
        (if title.is_empty() { None } else { Some(title) }, None)
    }
}

#[cfg(not(target_os = "windows"))]
fn get_active_window_info() -> (Option<String>, Option<String>) { (None, None) }

fn auto_tags_for_text_and_url(text: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    if let Ok(u) = Url::parse(text) {
        if let Some(domain) = u.domain() {
            let t = match domain {
                "github.com" => Some("github".to_string()),
                "docs.rs" => Some("rust-docs".to_string()),
                d => Some(d.split('.').next().unwrap_or(d).to_string()),
            };
            if let Some(tg) = t { tags.push(tg); }
        }
    }
    tags
}

#[cfg(target_os = "windows")]
fn is_snipping_window_title(title_lower: &str) -> bool {
    title_lower.contains("snipping tool")
        || title_lower.contains("snippingtool")
        || title_lower.contains("snip & sketch")
        || title_lower.contains("screen snip")
        || title_lower.contains("screenshot")
        || title_lower.contains("print screen")
        || title_lower.contains("prt sc")
        || title_lower.contains("sharex")
        || title_lower.contains("greenshot")
        || title_lower.contains("lightshot")
        || title_lower.contains("snipaste")
        || title_lower.contains("recorte")
        || title_lower.contains("captura")
        || title_lower.contains("ferramenta de recorte")
        || title_lower.contains("recortes")
}

#[cfg(not(target_os = "windows"))]
fn is_snipping_window_title(_title_lower: &str) -> bool { false }

// Heuristic: only treat clipboard images as screenshots when the active window
// indicates a screenshot tool (Windows) to avoid firing toast for arbitrary images.
fn is_probable_screenshot(img_width: u32, img_height: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        if let (Some(title), _) = get_active_window_info() {
            let t = title.to_lowercase();
            // Common Windows screenshot tools / overlays (including localized keywords)
            // English
            if t.contains("snipping tool")
                || t.contains("snippingtool")
                || t.contains("snip & sketch")
                || t.contains("screen snip")
                || t.contains("screenshot")
                || t.contains("print screen")
                || t.contains("prt sc")
                // Popular third-party tools
                || t.contains("sharex")
                || t.contains("greenshot")
                || t.contains("lightshot")
                || t.contains("snipaste")
                // Portuguese / Spanish hints
                || t.contains("recorte")
                || t.contains("captura")
                || t.contains("ferramenta de recorte")
                || t.contains("recortes")
            {
                return true;
            }
        }
        // Fallback: large images are likely screenshots
        (img_width >= 800 && img_height >= 600) || (img_width as u64 * img_height as u64 >= 400_000)
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for other platforms: large images only
        (img_width >= 800 && img_height >= 600) || (img_width as u64 * img_height as u64 >= 400_000)
    }
}

fn apply_rules(text: &str, source_url: Option<&str>, source_app: Option<&str>, capture_type: &str, rules: &Vec<Rule>) -> (Vec<String>, bool, bool) {
    let mut tags: Vec<String> = Vec::new();
    let mut ignore = false;
    let mut merge = false;
    for r in rules {
        let re = match Regex::new(&r.pattern) { Ok(x) => x, Err(_) => continue };
        let target = match r.field.as_str() {
            "url" => source_url.unwrap_or(""),
            "app" => source_app.unwrap_or(""),
            "type" => capture_type,
            _ => text,
        };
        if re.is_match(target) {
            match r.action.as_str() {
                "tag" => {
                    if let Some(t) = &r.tag { tags.push(t.clone()); }
                },
                "ignore" => { ignore = true; },
                "merge" => { merge = true; },
                _ => {}
            }
        }
    }
    (tags, ignore, merge)
}
#[derive(Serialize, Clone)]
struct ClipboardImagePayload {
    data_url: String,
    width: u32,
    height: u32,
}
#[command]
fn get_clipboard_history(app_state: tauri::State<'_, AppState>) -> Result<Vec<ClipboardHistoryEntry>, String> {
    if let Ok(history) = app_state.clipboard_history.lock() {
        Ok(history.clone())
    } else {
        Err("Failed to lock clipboard history".to_string())
    }
}

#[command]
fn set_clipboard_history_limit(limit: usize, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if limit == 0 { return Err("Limit must be greater than 0".to_string()); }
    if let Ok(mut l) = app_state.clipboard_history_limit.lock() {
        *l = limit;
        // Persist with new limit enforced
        if let Ok(mut history) = app_state.clipboard_history.lock() {
            enforce_history_order_and_limit(&mut history, limit);
            if let Err(e) = save_clipboard_history_to_disk(&history.clone()) {
                eprintln!("Failed to save clipboard history: {}", e);
            }
        }
        Ok(())
    } else {
        Err("Failed to set history limit".to_string())
    }
}

#[command]
fn get_clipboard_history_limit(app_state: tauri::State<'_, AppState>) -> Result<usize, String> {
    if let Ok(l) = app_state.clipboard_history_limit.lock() {
        Ok(*l)
    } else {
        Err("Failed to get history limit".to_string())
    }
}

#[command]
fn clear_clipboard_history(keep_pinned: bool, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut history) = app_state.clipboard_history.lock() {
        if keep_pinned {
            history.retain(|e| e.pinned);
        } else {
            history.clear();
        }
        // persist
        if let Err(e) = save_clipboard_history_to_disk(&history.clone()) {
            eprintln!("Failed to save clipboard history: {}", e);
        }
        Ok(())
    } else {
        Err("Failed to clear history".to_string())
    }
}

#[command]
fn pin_clipboard_entry(id: String, pinned: bool, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut history) = app_state.clipboard_history.lock() {
        if let Some(entry) = history.iter_mut().find(|e| e.id == id) {
            entry.pinned = pinned;
            // Re-sort: pinned first, then timestamp desc
            history.sort_by(|a, b| {
                match b.pinned.cmp(&a.pinned) {
                    core::cmp::Ordering::Equal => b.timestamp.cmp(&a.timestamp),
                    other => other,
                }
            });
            if let Err(e) = save_clipboard_history_to_disk(&history.clone()) {
                eprintln!("Failed to save clipboard history: {}", e);
            }
            Ok(())
        } else {
            Err("Entry not found".to_string())
        }
    } else {
        Err("Failed to lock history".to_string())
    }
}

#[command]
fn delete_clipboard_entry(id: String, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut history) = app_state.clipboard_history.lock() {
        let before = history.len();
        history.retain(|e| e.id != id);
        if history.len() < before {
            if let Err(e) = save_clipboard_history_to_disk(&history.clone()) {
                eprintln!("Failed to save clipboard history: {}", e);
            }
            Ok(())
        } else {
            Err("Entry not found".to_string())
        }
    } else {
        Err("Failed to lock history".to_string())
    }
}

#[command]
fn restore_clipboard_entry(text: String, app_handle: tauri::AppHandle, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Write to system clipboard
    let clipboard_manager = app_handle.clipboard();
    clipboard_manager.write_text(text.clone()).map_err(|e| format!("Failed to write clipboard: {}", e))?;

    // Mark internal copy to avoid loops
    if let Ok(mut last_copy) = app_state.last_internal_copy.lock() {
        *last_copy = text.clone();
    }

    // Emit event indicating this came from the app
    app_handle.emit(
        "clipboard-changed",
        ClipboardContent { text, from_app: true }
    ).map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(())
}
use rfd::FileDialog;
use base64::{engine::general_purpose, Engine as _};

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

fn get_clipboard_history_file() -> Result<PathBuf, String> {
    let app_data_dir = get_app_data_dir()?;
    Ok(app_data_dir.join("clipboard_history.json"))
}

fn enforce_history_order_and_limit(history: &mut Vec<ClipboardHistoryEntry>, limit: usize) {
    // Remove duplicates by content hash if present, else by text
    let mut seen = std::collections::HashSet::new();
    history.retain(|e| {
        let key = e.content_hash.clone().unwrap_or_else(|| e.text.clone());
        seen.insert(key)
    });
    // Keep pinned entries and up to `limit` non-pinned entries
    let mut non_pinned = 0usize;
    history.retain(|e| {
        if e.pinned { return true; }
        if non_pinned < limit { non_pinned += 1; true } else { false }
    });
    // Sort: pinned first, then timestamp desc
    history.sort_by(|a, b| {
        match b.pinned.cmp(&a.pinned) {
            core::cmp::Ordering::Equal => b.timestamp.cmp(&a.timestamp),
            other => other,
        }
    });
}

fn load_clipboard_history_from_disk(limit: usize) -> Vec<ClipboardHistoryEntry> {
    if let Ok(path) = get_clipboard_history_file() {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(mut v) = serde_json::from_str::<Vec<ClipboardHistoryEntry>>(&content) {
                    enforce_history_order_and_limit(&mut v, limit);
                    return v;
                }
            }
        }
    }
    Vec::new()
}

fn save_clipboard_history_to_disk(history: &Vec<ClipboardHistoryEntry>) -> Result<(), String> {
    let path = get_clipboard_history_file()?;
    let json = serde_json::to_string_pretty(history)
        .map_err(|e| format!("Failed to serialize clipboard history: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write clipboard history: {}", e))
}

#[command]
fn save_image_base64(data: String, suggested_name: Option<String>) -> Result<String, String> {
    // Expect data URL: data:image/png;base64,XXXX
    let (mime, b64) = if let Some(comma_idx) = data.find(",") {
        let header = &data[..comma_idx];
        let b64 = &data[comma_idx + 1..];
        let mime = header
            .split(':')
            .nth(1)
            .and_then(|s| s.split(';').next())
            .unwrap_or("image/png");
        (mime.to_string(), b64)
    } else {
        ("image/png".to_string(), data.as_str())
    };

    let ext = match mime.as_str() {
        "image/jpeg" => "jpg",
        "image/jpg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    };

    let bytes = general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let notes_dir = get_notes_dir()?;
    let images_dir = notes_dir.join("images");
    fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Failed to create images dir: {}", e))?;

    let ts = Utc::now().timestamp_millis();
    let filename = suggested_name
        .and_then(|n| {
            let n = n.trim();
            if n.is_empty() { None } else { Some(n.to_string()) }
        })
        .unwrap_or_else(|| format!("img_{}.{ext}", ts));
    let filepath = images_dir.join(filename);
    fs::write(&filepath, bytes)
        .map_err(|e| format!("Failed to write image: {}", e))?;

    Ok(filepath.to_string_lossy().to_string())
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

    let (window_title, source_app) = get_active_window_info();
    // Auto tags from links
    let mut tags: Vec<String> = Vec::new();
    for l in &links {
        if let Some(d) = extract_domain(l) {
            tags.push(match d.as_str() { "github.com" => "github".to_string(), "docs.rs" => "rust-docs".to_string(), _ => d.split('.').next().unwrap_or(&d).to_string() });
        }
    }
    let capture_type = if !links.is_empty() { Some("link".to_string()) } else { Some(detect_capture_type(&content)) };

    let note = Note {
        id: id.clone(),
        title: title.clone(),
        content,
        links,
        created_at: now,
        updated_at: now,
        tags,
        capture_type,
        source_app,
        window_title,
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
            // update context
            note.capture_type = Some(if !note.links.is_empty() { "link".to_string() } else { detect_capture_type(&note.content) });
            let (win_title, app_name) = get_active_window_info();
            note.window_title = win_title;
            note.source_app = app_name;
            // regenerate tags from links
            let mut tags: Vec<String> = Vec::new();
            for l in &note.links {
                if let Some(d) = extract_domain(l) {
                    tags.push(match d.as_str() { "github.com" => "github".to_string(), "docs.rs" => "rust-docs".to_string(), _ => d.split('.').next().unwrap_or(&d).to_string() });
                }
            }
            note.tags = tags;

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

#[tauri::command]
async fn get_persistence_enabled(app_state: tauri::State<'_, AppState>) -> Result<bool, String> {
    if let Ok(enabled) = app_state.persistence_enabled.lock() {
        Ok(*enabled)
    } else {
        Err("Failed to get persistence flag".to_string())
    }
}

#[tauri::command]
async fn set_persistence_enabled(enabled: bool, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut flag) = app_state.persistence_enabled.lock() {
        *flag = enabled;
        if enabled {
            if let Ok(history) = app_state.clipboard_history.lock() {
                let _ = save_clipboard_history_to_disk(&history.clone());
            }
        }
        Ok(())
    } else {
        Err("Failed to set persistence flag".to_string())
    }
}

#[tauri::command]
fn set_min_clipboard_text_length(min_len: usize, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut v) = app_state.min_clipboard_text_length.lock() { *v = min_len; Ok(()) } else { Err("Failed to set min length".into()) }
}

#[tauri::command]
fn get_min_clipboard_text_length(app_state: tauri::State<'_, AppState>) -> Result<usize, String> {
    if let Ok(v) = app_state.min_clipboard_text_length.lock() { Ok(*v) } else { Err("Failed to get min length".into()) }
}

#[tauri::command]
fn set_dedup_window_minutes(minutes: u64, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut v) = app_state.dedup_window_minutes.lock() { *v = minutes; Ok(()) } else { Err("Failed to set dedup window".into()) }
}

#[tauri::command]
fn get_dedup_window_minutes(app_state: tauri::State<'_, AppState>) -> Result<u64, String> {
    if let Ok(v) = app_state.dedup_window_minutes.lock() { Ok(*v) } else { Err("Failed to get dedup window".into()) }
}

#[tauri::command]
fn set_rules(rules: Vec<Rule>, app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut r) = app_state.rules.lock() { *r = rules; Ok(()) } else { Err("Failed to set rules".into()) }
}

#[tauri::command]
fn get_rules(app_state: tauri::State<'_, AppState>) -> Result<Vec<Rule>, String> {
    if let Ok(r) = app_state.rules.lock() { Ok(r.clone()) } else { Err("Failed to get rules".into()) }
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

    let initial_history = load_clipboard_history_from_disk(50);

    let app_state = AppState {
        is_focused: Arc::new(Mutex::new(false)),
        last_internal_copy: Arc::new(Mutex::new(String::new())),
        notes: Arc::new(Mutex::new(initial_notes)),
        sidebar_state: Arc::new(Mutex::new(None)),
        clipboard_monitoring_enabled: Arc::new(Mutex::new(true)),
        clipboard_history: Arc::new(Mutex::new(initial_history)),
        clipboard_history_limit: Arc::new(Mutex::new(50)),
        persistence_enabled: Arc::new(Mutex::new(true)),
        min_clipboard_text_length: Arc::new(Mutex::new(8)),
        dedup_window_minutes: Arc::new(Mutex::new(3)),
        rules: Arc::new(Mutex::new(Vec::new())),
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
            set_clipboard_monitoring_enabled,
            save_image_base64,
            get_clipboard_history,
            set_clipboard_history_limit,
            get_clipboard_history_limit,
            clear_clipboard_history,
            pin_clipboard_entry,
            delete_clipboard_entry,
            restore_clipboard_entry,
            get_persistence_enabled,
            set_persistence_enabled,
            set_min_clipboard_text_length,
            get_min_clipboard_text_length,
            set_dedup_window_minutes,
            get_dedup_window_minutes,
            set_rules,
            get_rules
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
                if let Err(e) = apply_acrylic(&window, Some((0, 0, 0, 235))) {
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
                let mut last_image_hash = String::new();
                let mut last_snip_seen_at: Instant = Instant::now() - Duration::from_secs(60);
                println!("Clipboard monitoring thread started");

                loop {
                    // Track if a snipping/screenshot window is active recently
                    if let (Some(title), _) = get_active_window_info() {
                        let t = title.to_lowercase();
                        if is_snipping_window_title(&t) {
                            last_snip_seen_at = Instant::now();
                        }
                    }
                    // Respect the auto-copy/monitoring flag
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        let enabled = *state.clipboard_monitoring_enabled.lock().unwrap();
                        if !enabled {
                            thread::sleep(Duration::from_millis(500));
                            continue;
                        }
                    }

                    // Try to read clipboard using the plugin first
                    let clipboard_manager = app_handle.clipboard();
                    match clipboard_manager.read_text() {
                        Ok(text) => {
                            if !text.is_empty() && text != last_content {
                                last_content = text.clone();
                                println!("Clipboard content detected: {}", text);

                                // Update clipboard history
                                if let Some(state) = app_handle.try_state::<AppState>() {
                                    let limit = *state.clipboard_history_limit.lock().unwrap();
                                    let min_len = *state.min_clipboard_text_length.lock().unwrap();
                                    let dedup_mins = *state.dedup_window_minutes.lock().unwrap();
                                    let rules = state.rules.lock().unwrap().clone();

                                    let trimmed = text.trim().to_string();
                                    let cap_type = detect_capture_type(&trimmed);
                                    if trimmed.len() < min_len && cap_type != "code" && cap_type != "link" {
                                        // skip short non-code/non-link
                                    } else {
                                        let (win_title, app_name) = get_active_window_info();
                                        let source_url = if is_url(&trimmed) { Some(trimmed.clone()) } else { None };
                                        let (mut extra_tags, ignore, _merge) = apply_rules(&trimmed, source_url.as_deref(), app_name.as_deref(), &cap_type, &rules);
                                        if !ignore {
                                            let mut history = state.clipboard_history.lock().unwrap();
                                            let now_ts = Utc::now();
                                            let hash = compute_text_hash(&trimmed);
                                            history.retain(|e| {
                                                if let Some(h) = &e.content_hash {
                                                    if *h == hash {
                                                        return now_ts - e.timestamp > ChronoDuration::minutes(dedup_mins as i64);
                                                    }
                                                }
                                                true
                                            });
                                            if let Some(url) = &source_url { extra_tags.extend(auto_tags_for_text_and_url(url)); }
                                            history.insert(0, ClipboardHistoryEntry {
                                                id: format!("clip_{}", now_ts.timestamp_millis()),
                                                text: trimmed.clone(),
                                                pinned: false,
                                                timestamp: now_ts,
                                                source_app: app_name,
                                                window_title: win_title,
                                                source_url,
                                                capture_type: cap_type,
                                                tags: extra_tags,
                                                content_hash: Some(hash),
                                            });
                                            enforce_history_order_and_limit(&mut history, limit);
                                        }
                                    }
                                }
                                // Persist to disk if enabled
                                if let Some(state) = app_handle.try_state::<AppState>() {
                                    let enabled = *state.persistence_enabled.lock().unwrap();
                                    if enabled {
                                        if let Ok(history) = state.clipboard_history.lock() {
                                            if let Err(e) = save_clipboard_history_to_disk(&history.clone()) {
                                                eprintln!("Failed to save clipboard history: {}", e);
                                            }
                                        }
                                    }
                                }

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
                            // Also try to read image from clipboard when present
                            // Using arboard as it provides raw image bytes
                            if let Ok(img) = arboard::Clipboard::new().and_then(|mut cb| cb.get_image()) {
                                let bytes = img.bytes.into_owned();
                                // Compute hash to avoid duplicates
                                let mut hasher = Sha256::new();
                                hasher.update(&bytes);
                                let hash = format!("{:x}", hasher.finalize());
                                if hash != last_image_hash {
                                    last_image_hash = hash;
                                    // Encode to PNG
                                    let mut png_data: Vec<u8> = Vec::new();
                                    {
                                        let mut encoder = Encoder::new(&mut png_data, img.width as u32, img.height as u32);
                                        encoder.set_color(ColorType::Rgba);
                                        encoder.set_depth(BitDepth::Eight);
                                        match encoder.write_header() {
                                            Ok(mut header) => {
                                                if let Err(e) = header.write_image_data(&bytes) {
                                                    eprintln!("Failed to write PNG data: {}", e);
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!("Failed to write PNG header: {}", e);
                                            }
                                        }
                                    }
                                    if !png_data.is_empty() {
                                        let probable_size = is_probable_screenshot(img.width as u32, img.height as u32);
                                        let recent_snip = last_snip_seen_at.elapsed() <= Duration::from_secs(6);
                                        let probable = probable_size || recent_snip;
                                        let (win_title, _) = get_active_window_info();
                                        println!("📸 Clipboard image {}x{}, window={:?}, probable_screenshot={}, recent_snip={}", img.width, img.height, win_title, probable, recent_snip);
                                        if probable {
                                            let b64 = base64::engine::general_purpose::STANDARD.encode(&png_data);
                                            let data_url = format!("data:image/png;base64,{}", b64);
                                            let payload = ClipboardImagePayload { data_url, width: img.width as u32, height: img.height as u32 };
                                            let _ = app_handle.emit("clipboard-image", payload);
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to read clipboard: {}", e);
                            // Try alternative clipboard reading method
                            if let Ok(text) = arboard::Clipboard::new().and_then(|mut cb| cb.get_text()) {
                                if !text.is_empty() && text != last_content {
                                    last_content = text.clone();
                                    println!("Clipboard content detected (alternative method): {}", text);
                                    // Update clipboard history
                                    if let Some(state) = app_handle.try_state::<AppState>() {
                                        let limit = *state.clipboard_history_limit.lock().unwrap();
                                        let min_len = *state.min_clipboard_text_length.lock().unwrap();
                                        let dedup_mins = *state.dedup_window_minutes.lock().unwrap();
                                        let rules = state.rules.lock().unwrap().clone();

                                        let trimmed = text.trim().to_string();
                                        let cap_type = detect_capture_type(&trimmed);
                                        if trimmed.len() >= min_len || cap_type == "code" || cap_type == "link" {
                                            let (win_title, app_name) = get_active_window_info();
                                            let source_url = if is_url(&trimmed) { Some(trimmed.clone()) } else { None };
                                            let (mut extra_tags, ignore, _merge) = apply_rules(&trimmed, source_url.as_deref(), app_name.as_deref(), &cap_type, &rules);
                                            if !ignore {
                                                let mut history = state.clipboard_history.lock().unwrap();
                                                let now_ts = Utc::now();
                                                let hash = compute_text_hash(&trimmed);
                                                history.retain(|e| {
                                                    if let Some(h) = &e.content_hash {
                                                        if *h == hash {
                                                            return now_ts - e.timestamp > ChronoDuration::minutes(dedup_mins as i64);
                                                        }
                                                    }
                                                    true
                                                });
                                                if let Some(url) = &source_url { extra_tags.extend(auto_tags_for_text_and_url(url)); }
                                                history.insert(0, ClipboardHistoryEntry {
                                                    id: format!("clip_{}", now_ts.timestamp_millis()),
                                                    text: trimmed.clone(),
                                                    pinned: false,
                                                    timestamp: now_ts,
                                                    source_app: app_name,
                                                    window_title: win_title,
                                                    source_url,
                                                    capture_type: cap_type,
                                                    tags: extra_tags,
                                                    content_hash: Some(hash),
                                                });
                                                enforce_history_order_and_limit(&mut history, limit);
                                            }
                                        }
                                    }
                                    // Persist to disk if enabled
                                    if let Some(state) = app_handle.try_state::<AppState>() {
                                        let enabled = *state.persistence_enabled.lock().unwrap();
                                        if enabled {
                                            if let Ok(history) = state.clipboard_history.lock() {
                                                if let Err(e) = save_clipboard_history_to_disk(&history.clone()) {
                                                    eprintln!("Failed to save clipboard history: {}", e);
                                                }
                                            }
                                        }
                                    }

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
                            // Attempt to read image via arboard in the fallback too
                            if let Ok(img) = arboard::Clipboard::new().and_then(|mut cb| cb.get_image()) {
                                let bytes = img.bytes.into_owned();
                                let mut hasher = Sha256::new();
                                hasher.update(&bytes);
                                let hash = format!("{:x}", hasher.finalize());
                                if hash != last_image_hash {
                                    last_image_hash = hash;
                                    let mut png_data: Vec<u8> = Vec::new();
                                    {
                                        let mut encoder = Encoder::new(&mut png_data, img.width as u32, img.height as u32);
                                        encoder.set_color(ColorType::Rgba);
                                        encoder.set_depth(BitDepth::Eight);
                                        match encoder.write_header() {
                                            Ok(mut header) => {
                                                if let Err(e) = header.write_image_data(&bytes) {
                                                    eprintln!("Failed to write PNG data: {}", e);
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!("Failed to write PNG header: {}", e);
                                            }
                                        }
                                    }
                                    if !png_data.is_empty() {
                                        let probable_size = is_probable_screenshot(img.width as u32, img.height as u32);
                                        let recent_snip = last_snip_seen_at.elapsed() <= Duration::from_secs(6);
                                        let probable = probable_size || recent_snip;
                                        let (win_title, _) = get_active_window_info();
                                        println!("📸 Clipboard image (fallback) {}x{}, window={:?}, probable_screenshot={}, recent_snip={}", img.width, img.height, win_title, probable, recent_snip);
                                        if probable {
                                            let b64 = base64::engine::general_purpose::STANDARD.encode(&png_data);
                                            let data_url = format!("data:image/png;base64,{}", b64);
                                            let payload = ClipboardImagePayload { data_url, width: img.width as u32, height: img.height as u32 };
                                            let _ = app_handle.emit("clipboard-image", payload);
                                        }
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