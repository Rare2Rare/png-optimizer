use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

use image::DynamicImage;
use rayon::prelude::*;
use tauri::Emitter;

use crate::models::{BatchProgressEvent, OptimizationResult};
use crate::processing::decoder;
use crate::processing::optimizer;
use crate::processing::quantizer;
use crate::processing::resizer;

const MAX_RESIZE_DIM: u32 = 16384;

fn expand_template(template: &str, name: &str, ext: &str, mode: &str, quality: u8) -> String {
    template
        .replace("{name}", name)
        .replace("{ext}", ext)
        .replace("{mode}", mode)
        .replace("{quality}", &quality.to_string())
}

/// Encode image with given quality and return bytes.
/// Used for both one-shot encoding and binary search target-size mode.
fn encode_with_quality(
    img: &DynamicImage,
    mode: &str,
    quality: u8,
    strip_metadata: bool,
    output_format: &str,
) -> Result<Vec<u8>, String> {
    match output_format {
        "webp" => decoder::encode_webp(img),
        _ => match mode {
            "lossless" => {
                let png_data = decoder::encode_png(img)?;
                optimizer::optimize_lossless(&png_data, strip_metadata)
            }
            "lossy" => quantizer::quantize_image(img, quality),
            _ => Err("Invalid mode. Use 'lossless' or 'lossy'.".into()),
        },
    }
}

/// Binary-search quality to reach a target file size.
/// Returns the best (quality, data) that is <= target_size, or the smallest attempt.
fn encode_to_target_size(
    img: &DynamicImage,
    mode: &str,
    strip_metadata: bool,
    output_format: &str,
    target_size: u64,
) -> Result<(u8, Vec<u8>), String> {
    // First try max quality — if already under target, use it
    let full = encode_with_quality(img, mode, 100, strip_metadata, output_format)?;
    if (full.len() as u64) <= target_size {
        return Ok((100, full));
    }

    // Binary search between 1 and 100
    let mut low: u8 = 1;
    let mut high: u8 = 100;
    let mut best: (u8, Vec<u8>) = (1, full); // fallback to max if nothing fits
    let mut best_fits = false;

    for _ in 0..8 {
        if low >= high {
            break;
        }
        let mid = low + (high - low) / 2;
        let data = encode_with_quality(img, mode, mid, strip_metadata, output_format)?;
        let size = data.len() as u64;

        if size <= target_size {
            // Fits — try higher quality
            best = (mid, data);
            best_fits = true;
            low = mid + 1;
        } else {
            // Too large — try lower quality
            high = mid.saturating_sub(1);
        }
    }

    // If nothing fit, try quality=1 as last resort
    if !best_fits {
        let q1 = encode_with_quality(img, mode, 1, strip_metadata, output_format)?;
        if (q1.len() as u64) < (best.1.len() as u64) {
            best = (1, q1);
        }
    }

    Ok(best)
}

#[allow(clippy::too_many_arguments)]
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
    output_format: &str,
    output_template: &str,
    target_file_size: u64,
) -> Result<OptimizationResult, String> {
    let (img, info) = decoder::load_image(input_path)?;

    let img = resizer::resize_image(&img, resize_scale.min(100), resize_width, resize_height);
    let (out_w, out_h) = (img.width(), img.height());

    let stem = Path::new(input_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "output".to_string());

    let ext = match output_format {
        "webp" => "webp",
        _ => "png",
    };

    // Encode: either fixed quality or target-size binary search
    let (effective_quality, optimized_data) = if target_file_size > 0 && mode == "lossy" {
        encode_to_target_size(&img, mode, strip_metadata, output_format, target_file_size)?
    } else {
        let data = encode_with_quality(&img, mode, quality, strip_metadata, output_format)?;
        (quality, data)
    };

    let filename = expand_template(output_template, &stem, ext, mode, effective_quality);
    let base = Path::new(output_dir).join(&filename);
    let output_path = if base.exists() {
        let out_stem = Path::new(&filename)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| filename.clone());
        let mut i = 2u32;
        loop {
            let candidate = Path::new(output_dir).join(format!("{}_{}.{}", out_stem, i, ext));
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

    fs::write(&output_path, &optimized_data)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

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

#[allow(clippy::too_many_arguments)]
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
    output_format: String,
    output_template: String,
    target_file_size: u64,
) -> Result<OptimizationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        optimize_one(
            &input_path, &output_dir, &mode,
            quality.max(1).min(100), strip_metadata,
            resize_scale, resize_width.min(MAX_RESIZE_DIM), resize_height.min(MAX_RESIZE_DIM),
            skip_if_larger, trash_original, &output_format, &output_template,
            target_file_size,
        )
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[allow(clippy::too_many_arguments)]
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
    output_format: String,
    output_template: String,
    target_file_size: u64,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let quality = quality.max(1).min(100);
        let resize_width = resize_width.min(MAX_RESIZE_DIM);
        let resize_height = resize_height.min(MAX_RESIZE_DIM);
        let total = input_paths.len();
        let counter = AtomicUsize::new(0);
        const CHUNK_SIZE: usize = 100;

        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;

        for chunk in input_paths.chunks(CHUNK_SIZE) {
            chunk.par_iter().for_each(|input_path| {
                let idx = counter.fetch_add(1, Ordering::Relaxed) + 1;

                let result = optimize_one(
                    input_path, &output_dir, &mode,
                    quality, strip_metadata,
                    resize_scale, resize_width, resize_height,
                    skip_if_larger, trash_original, &output_format, &output_template,
                    target_file_size,
                );

                let event = match &result {
                    Ok(r) => BatchProgressEvent {
                        input_path: input_path.clone(),
                        index: idx, total,
                        status: if r.skipped { "skipped".to_string() } else { "done".to_string() },
                        result: Some(r.clone()),
                        error: None,
                    },
                    Err(e) => BatchProgressEvent {
                        input_path: input_path.clone(),
                        index: idx, total,
                        status: "error".to_string(),
                        result: None,
                        error: Some(e.clone()),
                    },
                };

                let _ = app.emit("batch-progress", &event);
            });
        }

        let _ = app.emit("batch-complete", ());
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
