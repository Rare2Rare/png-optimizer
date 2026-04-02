use image::{DynamicImage, ImageFormat};
use std::fs;
use std::path::Path;

use crate::models::ImageInfo;

/// Decode an image file and return its metadata.
pub fn load_image(path: &str) -> Result<(DynamicImage, ImageInfo), String> {
    let path_obj = Path::new(path);

    if !path_obj.exists() {
        return Err(format!("File not found: {}", path));
    }

    let file_name = path_obj
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let file_size = fs::metadata(path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?
        .len();

    let format = match path_obj
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .as_deref()
    {
        Some("png") => "PNG",
        Some("jpg" | "jpeg") => "JPEG",
        Some("bmp") => "BMP",
        _ => return Err("Unsupported image format. Supported: PNG, JPEG, BMP".into()),
    };

    let img = image::open(path).map_err(|e| format!("Failed to decode image: {}", e))?;

    let info = ImageInfo {
        path: path.to_string(),
        file_name,
        file_size,
        width: img.width(),
        height: img.height(),
        format: format.to_string(),
    };

    Ok((img, info))
}

/// Encode a DynamicImage as PNG bytes.
pub fn encode_png(img: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    img.write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;
    Ok(buf)
}

/// Create a thumbnail of the image (max dimension = max_size).
pub fn create_thumbnail(img: &DynamicImage, max_size: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w <= max_size && h <= max_size {
        return img.clone();
    }
    img.thumbnail(max_size, max_size)
}
