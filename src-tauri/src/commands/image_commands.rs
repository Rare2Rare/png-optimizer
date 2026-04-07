use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

use rayon::prelude::*;
use tauri::Emitter;

use crate::models::{BatchProgressEvent, OptimizationResult};
use crate::processing::decoder;
use crate::processing::optimizer;
use crate::processing::quantizer;
use crate::processing::resizer;

const MAX_RESIZE_DIM: u32 = 16384;

fn optimize_one(
    input_path: &str,
    output_dir: &str,
    mode: &str,
    quality: u8,
    strip_metadata: bool,
    resize_scale: u32,
    resize_width: u32,
    resize_height: u32,
    skip_if_larger: bool,
    trash_original: bool,
) -> Result<OptimizationResult, String> {
    let (img, info) = decoder::load_image(input_path)?;

    let img = resizer::resize_image(&img, resize_scale.min(100), resize_width, resize_height);
    let (out_w, out_h) = (img.width(), img.height());

    let stem = Path::new(input_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "output".to_string());

    let base = Path::new(output_dir).join(format!("{}_optimized.png", stem));
    let output_path = if base.exists() {
        let mut i = 2u32;
        loop {
            let candidate = Path::new(output_dir).join(format!("{}_optimized_{}.png", stem, i));
            if !candidate.exists() {
                break candidate;
            }
            i += 1;
        }
    } else {
        base
    };

    fs::create_dir_all(output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    let optimized_data = match mode {
        "lossless" => {
            let png_data = decoder::encode_png(&img)?;
            optimizer::optimize_lossless(&png_data, strip_metadata)?
        }
        "lossy" => quantizer::quantize_image(&img, quality)?,
        _ => return Err("Invalid mode. Use 'lossless' or 'lossy'.".into()),
    };

    let optimized_size = optimized_data.len() as u64;

    // Skip writing if optimized is larger than original
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

    fs::write(&output_path, &optimized_data)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    // Move original to trash if requested
    if trash_original {
        trash::delete(input_path)
            .map_err(|e| format!("Failed to trash original file: {}", e))?;
    }

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
    skip_if_larger: bool,
    trash_original: bool,
) -> Result<OptimizationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        optimize_one(
            &input_path,
            &output_dir,
            &mode,
            quality.max(1).min(100),
            strip_metadata,
            resize_scale,
            resize_width.min(MAX_RESIZE_DIM),
            resize_height.min(MAX_RESIZE_DIM),
            skip_if_larger,
            trash_original,
        )
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn optimize_batch(
    app: tauri::AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    mode: String,
    quality: u8,
    strip_metadata: bool,
    resize_scale: u32,
    resize_width: u32,
    resize_height: u32,
    skip_if_larger: bool,
    trash_original: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let quality = quality.max(1).min(100);
        let resize_width = resize_width.min(MAX_RESIZE_DIM);
        let resize_height = resize_height.min(MAX_RESIZE_DIM);
        let total = input_paths.len();
        let counter = AtomicUsize::new(0);

        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;

        input_paths.par_iter().for_each(|input_path| {
            let idx = counter.fetch_add(1, Ordering::Relaxed) + 1;

            let result = optimize_one(
                input_path,
                &output_dir,
                &mode,
                quality,
                strip_metadata,
                resize_scale,
                resize_width,
                resize_height,
                skip_if_larger,
                trash_original,
            );

            let event = match &result {
                Ok(r) => BatchProgressEvent {
                    input_path: input_path.clone(),
                    index: idx,
                    total,
                    status: if r.skipped { "skipped".to_string() } else { "done".to_string() },
                    result: Some(r.clone()),
                    error: None,
                },
                Err(e) => BatchProgressEvent {
                    input_path: input_path.clone(),
                    index: idx,
                    total,
                    status: "error".to_string(),
                    result: None,
                    error: Some(e.clone()),
                },
            };

            let _ = app.emit("batch-progress", &event);
        });

        let _ = app.emit("batch-complete", ());
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
