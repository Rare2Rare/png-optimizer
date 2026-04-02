use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use crate::models::{ImageInfo, PreviewResult};
use crate::processing::decoder;
use crate::processing::optimizer;
use crate::processing::quantizer;
use crate::processing::resizer;

const PREVIEW_MAX_SIZE: u32 = 1024;

#[tauri::command]
pub fn load_image_info(path: String) -> Result<ImageInfo, String> {
    let (_img, info) = decoder::load_image(&path)?;
    Ok(info)
}

#[tauri::command]
pub fn generate_preview(
    path: String,
    mode: String,
    quality: u8,
    strip_metadata: bool,
    resize_scale: u32,
    resize_width: u32,
    resize_height: u32,
) -> Result<PreviewResult, String> {
    let (img, info) = decoder::load_image(&path)?;

    // Apply resize if requested
    let img = resizer::resize_image(&img, resize_scale, resize_width, resize_height);
    let (out_w, out_h) = (img.width(), img.height());

    // Create thumbnail for preview
    let thumb = decoder::create_thumbnail(&img, PREVIEW_MAX_SIZE);

    // Encode original thumbnail as PNG for "before"
    let before_png = decoder::encode_png(&thumb)?;
    let before_data_url = format!(
        "data:image/png;base64,{}",
        BASE64.encode(&before_png)
    );

    // Generate optimized version
    let (after_png, optimized_full_size) = match mode.as_str() {
        "lossless" => {
            let full_png = decoder::encode_png(&img)?;
            let optimized = optimizer::optimize_lossless(&full_png, strip_metadata)?;
            let opt_size = optimized.len() as u64;
            let thumb_optimized = optimizer::optimize_lossless(&before_png, strip_metadata)?;
            (thumb_optimized, opt_size)
        }
        "lossy" => {
            let quantized_full = quantizer::quantize_image(&img, quality)?;
            let opt_size = quantized_full.len() as u64;
            let quantized_thumb = quantizer::quantize_image(&thumb, quality)?;
            (quantized_thumb, opt_size)
        }
        _ => return Err("Invalid mode. Use 'lossless' or 'lossy'.".into()),
    };

    let after_data_url = format!(
        "data:image/png;base64,{}",
        BASE64.encode(&after_png)
    );

    Ok(PreviewResult {
        before_data_url,
        after_data_url,
        original_size: info.file_size,
        optimized_size: optimized_full_size,
        width: out_w,
        height: out_h,
    })
}
