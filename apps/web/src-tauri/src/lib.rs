use serde::{Serialize, Deserialize};
use std::sync::{Arc, Mutex};
use chrono::{DateTime, Utc};
use tauri_plugin_dialog;

#[derive(Clone, Serialize)]
pub struct ClipboardContent {
    pub text: String,
    pub from_app: bool,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ClipboardHistoryEntry {
    pub id: String,
    pub text: String,
    pub pinned: bool,
    pub timestamp: DateTime<Utc>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub links: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct NoteMetadata {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SidebarState {
    pub notes: Vec<NoteMetadata>,
    pub last_sync_time: i64,
    pub is_collapsed: Option<bool>,
    pub selected_note_id: Option<String>,
    pub is_right_collapsed: Option<bool>,
}

#[derive(Clone, Serialize)]
pub struct AppState {
    pub is_focused: Arc<Mutex<bool>>,
    pub last_internal_copy: Arc<Mutex<String>>,
    pub notes: Arc<Mutex<Vec<Note>>>,
    pub sidebar_state: Arc<Mutex<Option<SidebarState>>>,
    pub clipboard_monitoring_enabled: Arc<Mutex<bool>>,
    pub clipboard_history: Arc<Mutex<Vec<ClipboardHistoryEntry>>>,
    pub clipboard_history_limit: Arc<Mutex<usize>>,
    pub persistence_enabled: Arc<Mutex<bool>>,
}

pub fn run() {
    println!("Initializing Tauri plugins...");
    tauri::Builder::default()
       .plugin(tauri_plugin_updater::Builder::new().build())
       .plugin(tauri_plugin_dialog::init())
       .plugin(tauri_plugin_clipboard_manager::init())
       .run(tauri::generate_context!())
       .expect("error while running tauri application");
}