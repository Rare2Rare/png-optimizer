use image::{DynamicImage, ImageFormat, RgbaImage};
use imagequant::RGBA;

/// Lossy PNG optimization via color quantization (imagequant).
/// quality: 1-100 (maps to imagequant's min_quality..max_quality).
/// Returns optimized PNG bytes.
pub fn quantize_image(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgba = img.to_rgba8();
    let width = rgba.width() as usize;
    let height = rgba.height() as usize;
    let raw = rgba.as_raw();

    // Validate buffer length before reinterpret
    let expected_len = width * height * 4;
    if raw.len() != expected_len {
        return Err(format!(
            "Buffer size mismatch: expected {} bytes, got {}",
            expected_len,
            raw.len()
        ));
    }

    // Safety: RGBA is #[repr(C)] with 4 u8 fields, same layout as [u8; 4].
    // Buffer length is validated above.
    let pixels: &[RGBA] = unsafe {
        std::slice::from_raw_parts(raw.as_ptr() as *const RGBA, width * height)
    };

    // Set up quantizer
    let mut liq = imagequant::new();
    let min_q = if quality > 20 { quality - 20 } else { 0 };
    liq.set_quality(min_q, quality)
        .map_err(|e| format!("Failed to set quality: {}", e))?;

    let mut liq_image = liq
        .new_image_borrowed(pixels, width, height, 0.0)
        .map_err(|e| format!("Failed to create quantization image: {}", e))?;

    let mut result = liq
        .quantize(&mut liq_image)
        .map_err(|e| format!("Quantization failed: {}", e))?;

    result.set_dithering_level(1.0)
        .map_err(|e| format!("Failed to set dithering: {}", e))?;

    let (palette, indexed_pixels) = result
        .remapped(&mut liq_image)
        .map_err(|e| format!("Remapping failed: {}", e))?;

    // Expand indexed pixels back to RGBA using the quantized palette
    let mut out_buf = Vec::with_capacity(width * height * 4);
    for &idx in &indexed_pixels {
        let c = &palette[idx as usize];
        out_buf.push(c.r);
        out_buf.push(c.g);
        out_buf.push(c.b);
        out_buf.push(c.a);
    }

    let out_img = RgbaImage::from_raw(width as u32, height as u32, out_buf)
        .ok_or_else(|| "Failed to create output image".to_string())?;

    // Encode as PNG using the image crate
    let mut png_buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_buf);
    DynamicImage::ImageRgba8(out_img)
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    Ok(png_buf)
}
