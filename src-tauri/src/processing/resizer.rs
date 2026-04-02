use image::DynamicImage;

/// Resize an image. Returns the resized image.
/// - scale: percentage (e.g., 50 = 50%). If 0 or 100, returns original.
/// - custom_width/custom_height: if both > 0, resize to exact dimensions.
pub fn resize_image(
    img: &DynamicImage,
    scale: u32,
    custom_width: u32,
    custom_height: u32,
) -> DynamicImage {
    if custom_width > 0 && custom_height > 0 {
        img.resize_exact(custom_width, custom_height, image::imageops::FilterType::Lanczos3)
    } else if scale > 0 && scale < 100 {
        let new_w = (img.width() as f64 * scale as f64 / 100.0).round() as u32;
        let new_h = (img.height() as f64 * scale as f64 / 100.0).round() as u32;
        img.resize(new_w.max(1), new_h.max(1), image::imageops::FilterType::Lanczos3)
    } else {
        img.clone()
    }
}
