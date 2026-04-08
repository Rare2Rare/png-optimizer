use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;

use crate::models::OptimizationResult;
use crate::processing::{decoder, optimizer, quantizer};

const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "bmp", "webp"];

fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_optimized_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.contains("_optimized"))
        .unwrap_or(false)
}

pub struct WatcherHandle {
    _watcher: RecommendedWatcher,
}

pub type WatcherState = Arc<Mutex<Option<WatcherHandle>>>;

#[tauri::command]
pub async fn start_watch(
    app: tauri::AppHandle,
    state: tauri::State<'_, WatcherState>,
    watch_dir: String,
    output_dir: String,
    mode: String,
    quality: u8,
    strip_metadata: bool,
    skip_if_larger: bool,
    output_format: String,
    output_template: String,
) -> Result<(), String> {
    // Stop existing watcher first
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let processed = Arc::new(Mutex::new(HashSet::<String>::new()));
    let app_clone = app.clone();

    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    let output_dir = output_dir.clone();
    let mode = mode.clone();
    let quality = quality.max(1).min(100);
    let output_format = output_format.clone();
    let output_template = output_template.clone();

    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        let event = match res {
            Ok(e) => e,
            Err(_) => return,
        };

        // Only handle file creation
        if !matches!(event.kind, EventKind::Create(_)) {
            return;
        }

        for path in &event.paths {
            if !path.is_file() || !is_image_file(path) || is_optimized_file(path) {
                continue;
            }

            let path_str = match path.to_str() {
                Some(s) => s.to_string(),
                None => continue,
            };

            // Deduplicate
            {
                let mut set = processed.lock().unwrap();
                if set.contains(&path_str) {
                    continue;
                }
                set.insert(path_str.clone());
            }

            // Wait for file to be fully written
            std::thread::sleep(Duration::from_millis(500));

            let result = process_watched_file(
                &path_str, &output_dir, &mode, quality,
                strip_metadata, skip_if_larger, &output_format, &output_template,
            );

            let _ = app_clone.emit("watch-file-processed", &WatchEvent {
                input_path: path_str,
                status: if result.is_ok() { "done".to_string() } else { "error".to_string() },
                result: result.as_ref().ok().cloned(),
                error: result.as_ref().err().cloned(),
            });
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    let mut w = watcher;
    w.watch(Path::new(&watch_dir), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    let mut guard = state.lock().map_err(|e| e.to_string())?;
    *guard = Some(WatcherHandle { _watcher: w });

    Ok(())
}

#[tauri::command]
pub async fn stop_watch(
    state: tauri::State<'_, WatcherState>,
) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

fn process_watched_file(
    input_path: &str,
    output_dir: &str,
    mode: &str,
    quality: u8,
    strip_metadata: bool,
    skip_if_larger: bool,
    output_format: &str,
    output_template: &str,
) -> Result<OptimizationResult, String> {
    let (img, info) = decoder::load_image(input_path)?;
    let (out_w, out_h) = (img.width(), img.height());

    let stem = Path::new(input_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "output".to_string());

    let ext = if output_format == "webp" { "webp" } else { "png" };

    let filename = output_template
        .replace("{name}", &stem)
        .replace("{ext}", ext)
        .replace("{mode}", mode)
        .replace("{quality}", &quality.to_string());

    let output_path = Path::new(output_dir).join(&filename);

    let optimized_data = match output_format {
        "webp" => decoder::encode_webp(&img)?,
        _ => match mode {
            "lossless" => {
                let png_data = decoder::encode_png(&img)?;
                optimizer::optimize_lossless(&png_data, strip_metadata)?
            }
            "lossy" => quantizer::quantize_image(&img, quality)?,
            _ => return Err("Invalid mode".into()),
        },
    };

    let optimized_size = optimized_data.len() as u64;

    if skip_if_larger && optimized_size >= info.file_size {
        return Ok(OptimizationResult {
            input_path: input_path.to_string(),
            output_path: String::new(),
            original_size: info.file_size,
            optimized_size,
            width: out_w,
            height: out_h,
            skipped: true,
        });
    }

    std::fs::write(&output_path, &optimized_data)
        .map_err(|e| format!("Failed to write: {}", e))?;

    Ok(OptimizationResult {
        input_path: input_path.to_string(),
        output_path: output_path.to_string_lossy().to_string(),
        original_size: info.file_size,
        optimized_size,
        width: out_w,
        height: out_h,
        skipped: false,
    })
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchEvent {
    input_path: String,
    status: String,
    result: Option<OptimizationResult>,
    error: Option<String>,
}
