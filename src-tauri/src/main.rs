// src-tauri/src/main.rs

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod lib;

use anyhow::Result;
use lib::{start_screenshot_server, AppConfig, DesktopWatcher, ScreenshotProcessor, set_app_handle, get_app_handle};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{
    api::dialog::{ask, message},
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem,
};
use tokio::sync::RwLock;
use tracing::{error, info};

static SERVER_STATE: OnceCell<Arc<RwLock<Option<ServerHandle>>>> = OnceCell::new();

#[derive(Debug)]
struct ServerHandle {
    config: AppConfig,
    processor: ScreenshotProcessor,
    desktop_watcher: Option<DesktopWatcher>,
    server_task: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerConfig {
    anthropic_api_key: Option<String>,
    telegram_bot_token: Option<String>,
    telegram_chat_id: Option<String>,
    enable_desktop_detection: bool,
    server_port: u16,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            anthropic_api_key: None,
            telegram_bot_token: None,
            telegram_chat_id: None,
            enable_desktop_detection: false,
            server_port: 5001,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerInfo {
    status: String,
    local_ip: String,
    port: u16,
    endpoint_url: String,
    desktop_detection: bool,
    telegram_configured: bool,
}

// Tauri Commands

#[tauri::command]
async fn greet(name: &str) -> Result<String, String> {
    Ok(format!("Hello, {}! You've been greeted from Rust!", name))
}

#[tauri::command]
async fn start_server(config: ServerConfig) -> Result<ServerInfo, String> {
    info!("Starting screenshot server with config: {:?}", config);

    // Validate required fields
    let anthropic_api_key = config
        .anthropic_api_key
        .ok_or("Anthropic API key is required")?;

    let server_config = AppConfig {
        anthropic_api_key,
        telegram_bot_token: config.telegram_bot_token,
        telegram_chat_id: config.telegram_chat_id,
        enable_desktop_detection: config.enable_desktop_detection,
        server_port: config.server_port,
    };

    let processor = ScreenshotProcessor::new(server_config.clone());

    // Start desktop watcher if enabled
    let desktop_watcher = if server_config.enable_desktop_detection {
        match DesktopWatcher::new(processor.clone()) {
            Ok(watcher) => Some(watcher),
            Err(e) => {
                error!("Failed to start desktop watcher: {}", e);
                None
            }
        }
    } else {
        None
    };

    // Start HTTP server in background
    let server_config_clone = server_config.clone();
    let server_task = tokio::spawn(async move {
        if let Err(e) = start_screenshot_server(server_config_clone).await {
            error!("Screenshot server error: {}", e);
        }
    });

    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let server_handle = ServerHandle {
        config: server_config.clone(),
        processor,
        desktop_watcher,
        server_task: Some(server_task),
    };

    // Store server handle globally
    let server_state = SERVER_STATE.get_or_init(|| Arc::new(RwLock::new(None)));
    *server_state.write().await = Some(server_handle);

    Ok(ServerInfo {
        status: "running".to_string(),
        local_ip: local_ip.clone(),
        port: server_config.server_port,
        endpoint_url: format!("http://{}:{}/screenshot", local_ip, server_config.server_port),
        desktop_detection: server_config.enable_desktop_detection,
        telegram_configured: server_config.telegram_bot_token.is_some(),
    })
}

#[tauri::command]
async fn stop_server() -> Result<String, String> {
    let server_state = SERVER_STATE.get_or_init(|| Arc::new(RwLock::new(None)));
    let mut server_handle = server_state.write().await;

    if let Some(handle) = server_handle.take() {
        if let Some(task) = handle.server_task {
            task.abort();
        }
        info!("Screenshot server stopped");
        Ok("Server stopped successfully".to_string())
    } else {
        Err("Server is not running".to_string())
    }
}

#[tauri::command]
async fn get_server_status() -> Result<Option<ServerInfo>, String> {
    let server_state = SERVER_STATE.get_or_init(|| Arc::new(RwLock::new(None)));
    let server_handle = server_state.read().await;

    if let Some(ref handle) = *server_handle {
        let local_ip = local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "127.0.0.1".to_string());

        Ok(Some(ServerInfo {
            status: "running".to_string(),
            local_ip: local_ip.clone(),
            port: handle.config.server_port,
            endpoint_url: format!(
                "http://{}:{}/screenshot",
                local_ip, handle.config.server_port
            ),
            desktop_detection: handle.config.enable_desktop_detection,
            telegram_configured: handle.config.telegram_bot_token.is_some(),
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn toggle_desktop_detection(enable: bool) -> Result<String, String> {
    let server_state = SERVER_STATE.get_or_init(|| Arc::new(RwLock::new(None)));
    let mut server_handle = server_state.write().await;

    if let Some(ref mut handle) = *server_handle {
        if enable && handle.desktop_watcher.is_none() {
            match DesktopWatcher::new(handle.processor.clone()) {
                Ok(watcher) => {
                    handle.desktop_watcher = Some(watcher);
                    Ok("Desktop detection enabled".to_string())
                }
                Err(e) => Err(format!("Failed to enable desktop detection: {}", e)),
            }
        } else if !enable && handle.desktop_watcher.is_some() {
            handle.desktop_watcher = None;
            Ok("Desktop detection disabled".to_string())
        } else {
            Ok(format!(
                "Desktop detection already {}",
                if enable { "enabled" } else { "disabled" }
            ))
        }
    } else {
        Err("Server is not running".to_string())
    }
}

#[tauri::command]
async fn process_screenshot_direct(
    image_base64: String,
    metadata: Option<lib::ScreenshotMetadata>,
) -> Result<lib::ProcessingResponse, String> {
    let server_state = SERVER_STATE.get_or_init(|| Arc::new(RwLock::new(None)));
    let server_handle = server_state.read().await;

    if let Some(ref handle) = *server_handle {
        let result = handle
            .processor
            .process_screenshot(&image_base64, metadata)
            .await
            .map_err(|e| e.to_string())?;

        // REMOVE THIS ENTIRE EMIT BLOCK:
        // (The emit is already handled in lib.rs for desktop screenshots)
        //
        // if let Some(app_handle) = get_app_handle() {
        //     if let Some(window) = app_handle.get_window("main") {
        //         let screenshot_data = serde_json::json!({...});
        //         let _ = window.emit("screenshot-processed", screenshot_data);
        //     }
        // }

        Ok(result)
    } else {
        Err("Server is not running".to_string())
    }
}

#[tauri::command]
async fn get_recent_screenshots() -> Result<Vec<serde_json::Value>, String> {
    let server_state = SERVER_STATE.get_or_init(|| Arc::new(RwLock::new(None)));
    let server_handle = server_state.read().await;

    if let Some(ref handle) = *server_handle {
        let analyses = handle.processor.get_recent_analyses().await;
        Ok(analyses)
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
async fn load_env_config() -> ServerConfig {
    // Try to load from environment variables or config file
    ServerConfig {
        anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
        telegram_bot_token: std::env::var("TELEGRAM_BOT_TOKEN").ok(),
        telegram_chat_id: std::env::var("TELEGRAM_CHAT_ID").ok(),
        enable_desktop_detection: std::env::var("ENABLE_DESKTOP_DETECTION")
            .map(|v| v.to_lowercase() == "true")
            .unwrap_or(false),
        server_port: std::env::var("SERVER_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(5001),
    }
}

// System tray setup
fn create_system_tray() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide");
    let show = CustomMenuItem::new("show".to_string(), "Show");
    let server_status = CustomMenuItem::new("server_status".to_string(), "Server Status");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(server_status)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

fn handle_system_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick {
            position: _,
            size: _,
            ..
        } => {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "quit" => {
                std::process::exit(0);
            }
            "hide" => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.hide();
                }
            }
            "show" => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "server_status" => {
                // Open a window or show notification with server status
                let app_clone = app.clone();
                tokio::spawn(async move {
                    if let Ok(Some(status)) = get_server_status().await {
                        let msg = format!(
                            "Server Status: {}\nEndpoint: {}\nDesktop Detection: {}",
                            status.status, status.endpoint_url, status.desktop_detection
                        );
                        
                        if let Some(window) = app_clone.get_window("main") {
                            message(Some(&window), "Server Status", &msg);
                        }
                    } else {
                        if let Some(window) = app_clone.get_window("main") {
                            message(Some(&window), "Server Status", "Server is not running");
                        }
                    }
                });
            }
            _ => {}
        },
        _ => {}
    }
}

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt::init();

    info!("🚀 Starting Screenshot AI Studio");

    let context = tauri::generate_context!();

    tauri::Builder::default()
        .setup(|app| {
            // Store app handle for emitting events
            set_app_handle(app.handle());
            
            // The main window is already created by tauri.conf.json
            // Show setup dialog on first run
            let app_handle = app.handle();
            tokio::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
                
                if let Some(window) = app_handle.get_window("main") {
                    let app_handle_clone = app_handle.clone();
                    ask(
                        Some(&window),
                        "Welcome to Screenshot AI Studio",
                        "Would you like to configure the screenshot server now?\n\nYou can also configure it later in the Server tab.",
                        move |show_setup| {
                            if show_setup {
                                // Emit event to frontend to show setup dialog
                                if let Some(window) = app_handle_clone.get_window("main") {
                                    let _ = window.emit("show-setup-dialog", ());
                                }
                            }
                        }
                    );
                }
            });

            Ok(())
        })
        .system_tray(create_system_tray())
        .on_system_tray_event(handle_system_tray_event)
        .invoke_handler(tauri::generate_handler![
            greet,
            start_server,
            stop_server,
            get_server_status,
            toggle_desktop_detection,
            process_screenshot_direct,
            load_env_config,
            get_recent_screenshots,
        ])
        .run(context)
        .expect("error while running tauri application");
}