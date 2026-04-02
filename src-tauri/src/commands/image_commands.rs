use std::fs;
use std::path::Path;

use crate::models::OptimizationResult;
use crate::processing::decoder;
use crate::processing::optimizer;
use crate::processing::quantizer;
use crate::processing::resizer;

const MAX_RESIZE_DIM: u32 = 16384;

#[tauri::command]
pub async fn optimize_single(
    input_path: String,
    output_dir: String,
    mode: String,
    quality: u8,
    strip_metadata: bool,
    resize_scale: u32,
    resize_width: u32,
    resize_height: u32,
) -> Result<OptimizationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let quality = quality.max(1).min(100);
        let resize_width = resize_width.min(MAX_RESIZE_DIM);
        let resize_height = resize_height.min(MAX_RESIZE_DIM);

        let (img, info) = decoder::load_image(&input_path)?;

        // Apply resize
        let img = resizer::resize_image(&img, resize_scale.min(100), resize_width, resize_height);
        let (out_w, out_h) = (img.width(), img.height());

        // Determine output filename
        let stem = Path::new(&input_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "output".to_string());
        let output_path = Path::new(&output_dir).join(format!("{}_optimized.png", stem));

        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;

        let optimized_data = match mode.as_str() {
            "lossless" => {
                let png_data = decoder::encode_png(&img)?;
                optimizer::optimize_lossless(&png_data, strip_metadata)?
            }
            "lossy" => quantizer::quantize_image(&img, quality)?,
            _ => return Err("Invalid mode. Use 'lossless' or 'lossy'.".into()),
        };

        let optimized_size = optimized_data.len() as u64;

        fs::write(&output_path, &optimized_data)
            .map_err(|e| format!("Failed to write output file: {}", e))?;

        Ok(OptimizationResult {
            input_path,
            output_path: output_path.to_string_lossy().to_string(),
            original_size: info.file_size,
            optimized_size,
            width: out_w,
            height: out_h,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
