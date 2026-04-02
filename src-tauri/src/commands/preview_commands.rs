use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use crate::models::{ImageInfo, PreviewResult};
use crate::processing::decoder;
use crate::processing::optimizer;
use crate::processing::quantizer;
use crate::processing::resizer;

const PREVIEW_MAX_SIZE: u32 = 1024;
const MAX_RESIZE_DIM: u32 = 16384;

fn clamp_quality(q: u8) -> u8 {
    q.max(1).min(100)
}

fn clamp_resize(w: u32, h: u32) -> (u32, u32) {
    (w.min(MAX_RESIZE_DIM), h.min(MAX_RESIZE_DIM))
}

#[tauri::command]
pub async fn load_image_info(path: String) -> Result<ImageInfo, String> {
    tokio::task::spawn_blocking(move || {
        let (_img, info) = decoder::load_image(&path)?;
        Ok(info)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn generate_preview(
    path: String,
    mode: String,
    quality: u8,
    strip_metadata: bool,
    resize_scale: u32,
    resize_width: u32,
    resize_height: u32,
) -> Result<PreviewResult, String> {
    tokio::task::spawn_blocking(move || {
        let quality = clamp_quality(quality);
        let (rw, rh) = clamp_resize(resize_width, resize_height);
        let (img, info) = decoder::load_image(&path)?;

        // Apply resize if requested
        let img = resizer::resize_image(&img, resize_scale.min(100), rw, rh);
        let (out_w, out_h) = (img.width(), img.height());

        // Create thumbnail for preview
        let thumb = decoder::create_thumbnail(&img, PREVIEW_MAX_SIZE);
        let before_png = decoder::encode_png(&thumb)?;

        let before_data_url = format!(
            "data:image/png;base64,{}",
            BASE64.encode(&before_png)
        );

        // Optimize thumbnail only (avoid processing full image for preview)
        let after_png = match mode.as_str() {
            "lossless" => optimizer::optimize_lossless(&before_png, strip_metadata)?,
            "lossy" => quantizer::quantize_image(&thumb, quality)?,
            _ => return Err("Invalid mode. Use 'lossless' or 'lossy'.".into()),
        };

        // Estimate full-image size from thumbnail compression ratio
        let thumb_ratio = after_png.len() as f64 / before_png.len() as f64;
        let estimated_full_size = (info.file_size as f64 * thumb_ratio) as u64;

        let after_data_url = format!(
            "data:image/png;base64,{}",
            BASE64.encode(&after_png)
        );

        Ok(PreviewResult {
            before_data_url,
            after_data_url,
            original_size: info.file_size,
            optimized_size: estimated_full_size,
            width: out_w,
            height: out_h,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
