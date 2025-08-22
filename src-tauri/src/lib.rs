use anyhow::{anyhow, Result};
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
    Router,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use once_cell::sync::OnceCell;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Manager};
use teloxide::{prelude::*, types::InlineKeyboardMarkup, Bot};
use tokio::{sync::{mpsc, RwLock}, time::sleep};
use tower_http::cors::CorsLayer;
use tracing::{error, info, warn};
use uuid::Uuid;

// Global app handle for emitting events
static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();

pub fn set_app_handle(handle: AppHandle) {
    APP_HANDLE.set(handle).expect("Failed to set app handle");
}

pub fn get_app_handle() -> Option<&'static AppHandle> {
    APP_HANDLE.get()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotMetadata {
    pub source: Option<String>,
    pub app: Option<String>,
    pub filename: Option<String>,
    pub location: Option<String>,
    pub auto_detected: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedImage {
    pub base64_data: String,
    pub media_type: String,
    pub size_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentAnalysis {
    pub content_type: String,
    pub webpage_url: Option<String>,
    pub research_topics: Vec<String>,
    pub user_intent: String,
    pub follow_up: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisData {
    pub image_data: ProcessedImage,
    pub brief_summary: String,
    pub content_analysis: ContentAnalysis,
    pub metadata: ScreenshotMetadata,
    pub timestamp: DateTime<Utc>,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScreenshotRequest {
    pub image: String,
    pub metadata: Option<ScreenshotMetadata>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessingResponse {
    pub success: bool,
    pub summary: Option<String>,
    pub analysis_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub follow_up_available: Option<bool>,
    pub source: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerStatus {
    pub server: String,
    pub status: String,
    pub local_ip: String,
    pub port: u16,
    pub total_requests: u64,
    pub last_request: Option<DateTime<Utc>>,
    pub active_analyses: usize,
    pub telegram_configured: bool,
    pub desktop_detection_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub anthropic_api_key: String,
    pub telegram_bot_token: Option<String>,
    pub telegram_chat_id: Option<String>,
    pub enable_desktop_detection: bool,
    pub server_port: u16,
}

#[derive(Debug, Clone)]
pub struct ScreenshotProcessor {
    config: AppConfig,
    client: Client,
    pending_analyses: Arc<DashMap<String, AnalysisData>>,
    request_count: Arc<AtomicU64>,
    last_request_time: Arc<RwLock<Option<DateTime<Utc>>>>,
    telegram_bot: Option<Bot>,
}

impl ScreenshotProcessor {
    pub fn new(config: AppConfig) -> Self {
        let telegram_bot = config
            .telegram_bot_token
            .as_ref()
            .map(|token| Bot::new(token));

        Self {
            config,
            client: Client::new(),
            pending_analyses: Arc::new(DashMap::new()),
            request_count: Arc::new(AtomicU64::new(0)),
            last_request_time: Arc::new(RwLock::new(None)),
            telegram_bot,
        }
    }

    pub async fn process_screenshot(
        &self,
        image_base64: &str,
        metadata: Option<ScreenshotMetadata>,
    ) -> Result<ProcessingResponse> {
        let count = self.request_count.fetch_add(1, Ordering::Relaxed) + 1;
        let now = Utc::now();
        *self.last_request_time.write().await = Some(now);

        let source_type = metadata
            .as_ref()
            .and_then(|m| m.source.as_ref())
            .map(|s| s.as_str())
            .unwrap_or("iOS");

        info!("📱 Processing screenshot #{} (source: {})", count, source_type);

        // Prepare image data
        let processed_image = self.prepare_image_data(image_base64)?;

        // Generate analysis ID
        let analysis_id = Uuid::new_v4().to_string();

        // Get AI analysis
        let brief_summary = self.get_brief_summary(&processed_image, source_type).await?;
        let content_analysis = self.analyze_for_content_type(&processed_image).await?;

        // Store analysis data
        let analysis_data = AnalysisData {
            image_data: processed_image,
            brief_summary: brief_summary.clone(),
            content_analysis: content_analysis.clone(),
            metadata: metadata.clone().unwrap_or_default(),
            timestamp: now,
            source: source_type.to_string(),
        };

        self.pending_analyses
            .insert(analysis_id.clone(), analysis_data);

        // Send to Telegram if configured
        if let Some(ref bot) = self.telegram_bot {
            if let Some(ref chat_id) = self.config.telegram_chat_id {
                if let Err(e) = self
                    .send_telegram_notification(
                        bot,
                        chat_id,
                        &brief_summary,
                        &analysis_id,
                        &content_analysis,
                        &metadata,
                        source_type,
                    )
                    .await
                {
                    warn!("Failed to send Telegram notification: {}", e);
                }
            }
        }

        info!("✅ Screenshot processed successfully (ID: {})", analysis_id);

        let response = ProcessingResponse {
            success: true,
            summary: Some(brief_summary),
            analysis_id: Some(analysis_id),
            timestamp: now,
            follow_up_available: Some(true),
            source: Some(source_type.to_string()),
            error: None,
        };

        Ok(response)
    }

    fn prepare_image_data(&self, image_base64: &str) -> Result<ProcessedImage> {
        // Remove data URL prefix if present
        let clean_base64 = if image_base64.starts_with("data:image") {
            image_base64
                .split(',')
                .nth(1)
                .ok_or_else(|| anyhow!("Invalid data URL format"))?
        } else {
            image_base64
        };

        // Decode and validate
        let image_bytes = general_purpose::STANDARD
            .decode(clean_base64)
            .map_err(|e| anyhow!("Invalid base64: {}", e))?;

        // Size limits
        if image_bytes.len() > 15 * 1024 * 1024 {
            return Err(anyhow!("Image too large (max 15MB)"));
        }
        if image_bytes.len() < 1024 {
            return Err(anyhow!("Image too small"));
        }

        // Determine media type
        let media_type = if image_bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            "image/png"
        } else if image_bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            "image/jpeg"
        } else {
            "image/png" // Default
        };

        Ok(ProcessedImage {
            base64_data: clean_base64.to_string(),
            media_type: media_type.to_string(),
            size_bytes: image_bytes.len(),
        })
    }

    async fn get_brief_summary(&self, processed_image: &ProcessedImage, source_type: &str) -> Result<String> {
        let prompt = if source_type.starts_with("desktop") {
            "Analyze this desktop screenshot briefly. What is shown and what might be the user's intent?"
        } else {
            "Analyze this iPhone screenshot briefly. What is shown and what might be the user's intent?"
        };

        let request_body = serde_json::json!({
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 200,
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": processed_image.media_type,
                            "data": processed_image.base64_data
                        }
                    }
                ]
            }]
        });

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.config.anthropic_api_key)
            .header("Content-Type", "application/json")
            .header("anthropic-version", "2023-06-01")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| anyhow!("API request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(anyhow!("Claude API error: {}", response.status()));
        }

        let response_json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse response: {}", e))?;

        let summary = response_json["content"][0]["text"]
            .as_str()
            .ok_or_else(|| anyhow!("Invalid response format"))?;

        Ok(summary.to_string())
    }

    async fn analyze_for_content_type(&self, processed_image: &ProcessedImage) -> Result<ContentAnalysis> {
        let analysis_prompt = r#"Analyze this screenshot and determine:

1. Content type (webpage, app, document, social media, etc.)
2. If webpage: extract any visible URLs or domains
3. If research-related: identify key topics
4. User context: what might they want to do with this?

Respond with:
CONTENT_TYPE: [webpage/app/document/social/game/other]
WEBPAGE_URL: [URL if visible, or "none"]
RESEARCH_TOPICS: [comma-separated topics if research-related]
USER_INTENT: [likely user intent]
FOLLOW_UP: [suggested follow-up actions]"#;

        let request_body = serde_json::json!({
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 300,
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": analysis_prompt
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": processed_image.media_type,
                            "data": processed_image.base64_data
                        }
                    }
                ]
            }]
        });

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.config.anthropic_api_key)
            .header("Content-Type", "application/json")
            .header("anthropic-version", "2023-06-01")
            .json(&request_body)
            .send()
            .await?;

        if response.status().is_success() {
            let response_json: serde_json::Value = response.json().await?;
            let analysis_text = response_json["content"][0]["text"]
                .as_str()
                .unwrap_or("");
            Ok(self.parse_content_analysis(analysis_text))
        } else {
            Ok(ContentAnalysis::default())
        }
    }

    fn parse_content_analysis(&self, analysis_text: &str) -> ContentAnalysis {
        let mut result = ContentAnalysis::default();

        for line in analysis_text.lines() {
            let line = line.trim();
            if line.starts_with("CONTENT_TYPE:") {
                result.content_type = line
                    .split(':')
                    .nth(1)
                    .unwrap_or("unknown")
                    .trim()
                    .to_string();
            } else if line.starts_with("WEBPAGE_URL:") {
                let url = line.split(':').nth(1).unwrap_or("none").trim();
                if url != "none" && url != "unknown" {
                    result.webpage_url = Some(url.to_string());
                }
            } else if line.starts_with("RESEARCH_TOPICS:") {
                let topics = line.split(':').nth(1).unwrap_or("").trim();
                result.research_topics = topics
                    .split(',')
                    .map(|t| t.trim().to_string())
                    .filter(|t| !t.is_empty())
                    .collect();
            } else if line.starts_with("USER_INTENT:") {
                result.user_intent = line
                    .split(':')
                    .nth(1)
                    .unwrap_or("")
                    .trim()
                    .to_string();
            } else if line.starts_with("FOLLOW_UP:") {
                result.follow_up = line
                    .split(':')
                    .nth(1)
                    .unwrap_or("")
                    .trim()
                    .to_string();
            }
        }

        result
    }

    async fn send_telegram_notification(
        &self,
        bot: &Bot,
        chat_id: &str,
        summary: &str,
        analysis_id: &str,
        content_analysis: &ContentAnalysis,
        _metadata: &Option<ScreenshotMetadata>,
        source_type: &str,
    ) -> Result<()> {
        let source_emoji = if source_type.starts_with("desktop") {
            "🖥️"
        } else {
            "📱"
        };

        let source_name = if source_type.starts_with("desktop") {
            "Desktop Screenshot"
        } else {
            "iPhone Screenshot"
        };

        let timestamp = Utc::now().format("%H:%M:%S");
        let short_caption = format!("<b>{} {}</b> <i>{}</i>", source_emoji, source_name, timestamp);

        // Create inline keyboard
        let mut buttons = vec![
            vec![teloxide::types::InlineKeyboardButton::callback(
                "🔬 Research Papers",
                format!("arxiv_research_{}", analysis_id),
            )],
            vec![teloxide::types::InlineKeyboardButton::callback(
                "🧠 Deep Research",
                format!("deep_research_{}", analysis_id),
            )],
        ];

        if content_analysis.webpage_url.is_some() {
            buttons.push(vec![teloxide::types::InlineKeyboardButton::callback(
                "🌐 Webpage Content",
                format!("full_webpage_{}", analysis_id),
            )]);
        }

        let keyboard = InlineKeyboardMarkup::new(buttons);

        // Send analysis as text message (simplified for now)
        let full_message = format!("{}\n\n<b>AI Analysis:</b>\n\n{}", short_caption, summary);

        let chat_id: teloxide::types::ChatId = teloxide::types::ChatId(chat_id.parse::<i64>()?);

        bot.send_message(chat_id, full_message)
            .reply_markup(keyboard)
            .parse_mode(teloxide::types::ParseMode::Html)
            .await?;

        Ok(())
    }

    pub async fn get_recent_analyses(&self) -> Vec<serde_json::Value> {
        let mut analyses: Vec<_> = self
            .pending_analyses
            .iter()
            .map(|entry| {
                let (id, analysis) = (entry.key(), entry.value());
                serde_json::json!({
                    "id": id,
                    "name": analysis.metadata.filename.as_ref().unwrap_or(&format!("screenshot-{}.png", &id[..8])),
                    "size": analysis.image_data.size_bytes,
                    "type": analysis.image_data.media_type,
                    "timestamp": analysis.timestamp,
                    "status": "completed",
                    "analysis": analysis.brief_summary,
                    "source": analysis.source
                })
            })
            .collect();

        // Sort by timestamp (newest first)
        analyses.sort_by(|a, b| {
            let a_time = a["timestamp"].as_str().unwrap_or("");
            let b_time = b["timestamp"].as_str().unwrap_or("");
            b_time.cmp(a_time)
        });

        // Return last 50 analyses
        analyses.truncate(50);
        analyses
    }

    pub async fn get_status(&self) -> ServerStatus {
        let local_ip = local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "127.0.0.1".to_string());

        ServerStatus {
            server: "Screenshot AI Server".to_string(),
            status: "running".to_string(),
            local_ip,
            port: self.config.server_port,
            total_requests: self.request_count.load(Ordering::Relaxed),
            last_request: *self.last_request_time.read().await,
            active_analyses: self.pending_analyses.len(),
            telegram_configured: self.config.telegram_bot_token.is_some(),
            desktop_detection_enabled: self.config.enable_desktop_detection,
        }
    }
}

impl Default for ScreenshotMetadata {
    fn default() -> Self {
        Self {
            source: None,
            app: None,
            filename: None,
            location: None,
            auto_detected: None,
        }
    }
}

impl Default for ContentAnalysis {
    fn default() -> Self {
        Self {
            content_type: "unknown".to_string(),
            webpage_url: None,
            research_topics: Vec::new(),
            user_intent: String::new(),
            follow_up: String::new(),
        }
    }
}

// HTTP handlers for the server
pub async fn handle_screenshot(
    State(processor): State<ScreenshotProcessor>,
    Json(request): Json<ScreenshotRequest>,
) -> Result<ResponseJson<ProcessingResponse>, StatusCode> {
    match processor
        .process_screenshot(&request.image, request.metadata)
        .await
    {
        Ok(response) => Ok(ResponseJson(response)),
        Err(e) => {
            error!("Screenshot processing failed: {}", e);
            Ok(ResponseJson(ProcessingResponse {
                success: false,
                summary: None,
                analysis_id: None,
                timestamp: Utc::now(),
                follow_up_available: None,
                source: None,
                error: Some(e.to_string()),
            }))
        }
    }
}

pub async fn handle_health() -> ResponseJson<serde_json::Value> {
    ResponseJson(serde_json::json!({
        "status": "healthy",
        "server": "iOS Screenshot AI Server",
        "timestamp": Utc::now(),
    }))
}

pub async fn handle_status(
    State(processor): State<ScreenshotProcessor>,
) -> ResponseJson<ServerStatus> {
    ResponseJson(processor.get_status().await)
}

pub async fn start_screenshot_server(config: AppConfig) -> Result<()> {
    let processor = ScreenshotProcessor::new(config.clone());

    let app = Router::new()
        .route("/screenshot", post(handle_screenshot))
        .route("/health", get(handle_health))
        .route("/status", get(handle_status))
        .with_state(processor)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.server_port))
        .await
        .map_err(|e| anyhow!("Failed to bind to port {}: {}", config.server_port, e))?;

    info!("🌐 Screenshot server running on port {}", config.server_port);

    axum::serve(listener, app).await?;

    Ok(())
}

// Desktop screenshot watcher
pub struct DesktopWatcher {
    #[allow(dead_code)]
    processor: ScreenshotProcessor,
    _watcher: RecommendedWatcher,
    _task_handle: tokio::task::JoinHandle<()>,
}

impl std::fmt::Debug for DesktopWatcher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DesktopWatcher")
            .field("processor", &"ScreenshotProcessor { ... }")
            .field("_watcher", &"RecommendedWatcher { ... }")
            .field("_task_handle", &"JoinHandle { ... }")
            .finish()
    }
}

impl DesktopWatcher {
    pub fn new(processor: ScreenshotProcessor) -> Result<Self> {
        let (tx, mut rx) = mpsc::unbounded_channel::<PathBuf>();
        
        // Spawn a task to handle file processing
        let processor_clone = processor.clone();
        let task_handle = tokio::spawn(async move {
            while let Some(path) = rx.recv().await {
                if let Err(e) = Self::process_desktop_screenshot(&processor_clone, &path).await {
                    error!("Failed to process desktop screenshot: {}", e);
                }
            }
        });

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                    for path in event.paths {
                        if Self::is_screenshot_file(&path) {
                            // Send to async task for processing
                            if let Err(e) = tx.send(path) {
                                error!("Failed to send file path for processing: {}", e);
                            }
                        }
                    }
                }
            }
        })?;

        let desktop_path = dirs::desktop_dir().unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join("Desktop"))
                .unwrap_or_else(|| PathBuf::from("."))
        });

        watcher.watch(&desktop_path, RecursiveMode::NonRecursive)?;

        info!("🔍 Desktop screenshot auto-detection started");
        info!("📁 Monitoring: {}", desktop_path.display());

        Ok(Self {
            processor,
            _watcher: watcher,
            _task_handle: task_handle,
        })
    }

    fn is_screenshot_file(path: &Path) -> bool {
        // Skip hidden files (starting with .)
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') {
                return false;
            }
        } else {
            return false;
        }

        if let Some(extension) = path.extension() {
            let ext = extension.to_string_lossy().to_lowercase();
            if !matches!(ext.as_str(), "png" | "jpg" | "jpeg") {
                return false;
            }
        } else {
            return false;
        }

        if let Some(name) = path.file_name() {
            let name = name.to_string_lossy().to_lowercase();
            let screenshot_patterns = [
                "screenshot", "screen shot", "capture", "cleanshot",
            ];

            return screenshot_patterns.iter().any(|pattern| name.contains(pattern));
        }

        false
    }

    async fn process_desktop_screenshot(
        processor: &ScreenshotProcessor,
        path: &Path,
    ) -> Result<()> {
        // Wait a bit longer for file to be fully written and renamed
        sleep(Duration::from_millis(1000)).await;

        if !path.exists() {
            return Err(anyhow!("File not found: {}", path.display()));
        }

        let file_size = std::fs::metadata(path)?.len();
        if file_size > 15 * 1024 * 1024 {
            warn!("Screenshot too large ({:.1}MB), skipping", file_size as f64 / 1024.0 / 1024.0);
            return Ok(());
        }

        let image_bytes = std::fs::read(path)?;
        let image_base64 = general_purpose::STANDARD.encode(&image_bytes);

        let metadata = ScreenshotMetadata {
            source: Some("desktop_auto".to_string()),
            app: Some("macOS Screenshot".to_string()),
            filename: path.file_name().map(|n| n.to_string_lossy().to_string()),
            auto_detected: Some(true),
            ..Default::default()
        };

        let result = processor
            .process_screenshot(&image_base64, Some(metadata))
            .await?;

        // Emit event to frontend for desktop auto-detected screenshots
        if let Some(app_handle) = APP_HANDLE.get() {
            if let Some(window) = app_handle.get_window("main") {
                let screenshot_data = serde_json::json!({
                    "id": result.analysis_id.as_ref().unwrap_or(&"unknown".to_string()),
                    "name": path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| format!("screenshot-{}.png", result.analysis_id.as_ref().unwrap_or(&"unknown".to_string())[..8].to_string())),
                    "size": image_bytes.len(),
                    "type": "image/png",
                    "timestamp": result.timestamp,
                    "status": "completed",
                    "analysis": result.summary.as_ref().unwrap_or(&"".to_string()),
                    "source": result.source.as_ref().unwrap_or(&"desktop_auto".to_string())
                });
                
                let _ = window.emit("screenshot-processed", screenshot_data);
            }
        }

        if result.success {
            info!(
                "✅ Desktop screenshot processed (ID: {})",
                result.analysis_id.unwrap_or_default()
            );
        }

        Ok(())
    }
}