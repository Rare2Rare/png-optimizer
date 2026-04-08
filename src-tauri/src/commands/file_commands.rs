use std::collections::BTreeSet;
use std::path::Path;
use walkdir::WalkDir;

const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "bmp", "webp"];

fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Resolve a mixed list of files and folders into a flat list of image file paths.
/// Folders are expanded (optionally recursive). Files are validated by extension.
/// Returns sorted, deduplicated absolute paths.
#[tauri::command]
pub async fn resolve_paths(paths: Vec<String>, recursive: bool) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut result = BTreeSet::new();

        for p in &paths {
            let path = Path::new(p);
            if path.is_dir() {
                let max_depth = if recursive { usize::MAX } else { 1 };
                for entry in WalkDir::new(path).min_depth(1).max_depth(max_depth) {
                    let entry = match entry {
                        Ok(e) => e,
                        Err(_) => continue,
                    };
                    let file_path = entry.path();
                    if file_path.is_file() && is_image_file(file_path) {
                        if let Some(s) = file_path.to_str() {
                            result.insert(s.to_string());
                        }
                    }
                }
            } else if path.is_file() && is_image_file(path) {
                result.insert(p.clone());
            }
        }

        Ok(result.into_iter().collect())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
