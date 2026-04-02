use image::DynamicImage;
use imagequant::RGBA;

/// Lossy PNG optimization via color quantization (imagequant).
/// quality: 1-100 (maps to imagequant's min_quality..max_quality).
/// Returns indexed-color PNG bytes.
pub fn quantize_image(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgba = img.to_rgba8();
    let width = rgba.width() as usize;
    let height = rgba.height() as usize;
    let raw = rgba.as_raw();

    // Reinterpret &[u8] as &[RGBA] (4 bytes per pixel)
    let pixels: &[RGBA] = unsafe {
        std::slice::from_raw_parts(raw.as_ptr() as *const RGBA, width * height)
    };

    // Set up quantizer
    let mut liq = imagequant::new();
    let min_q = if quality > 20 { quality - 20 } else { 0 };
    liq.set_quality(min_q, quality)
        .map_err(|e| format!("Failed to set quality: {}", e))?;

    // Create image for quantization
    let mut liq_image = liq
        .new_image_borrowed(pixels, width, height, 0.0)
        .map_err(|e| format!("Failed to create quantization image: {}", e))?;

    // Quantize
    let mut result = liq
        .quantize(&mut liq_image)
        .map_err(|e| format!("Quantization failed: {}", e))?;

    result.set_dithering_level(1.0)
        .map_err(|e| format!("Failed to set dithering: {}", e))?;

    let (palette, indexed_pixels) = result
        .remapped(&mut liq_image)
        .map_err(|e| format!("Remapping failed: {}", e))?;

    // Encode as indexed PNG using lodepng
    let lode_palette: Vec<lodepng::RGBA> = palette
        .iter()
        .map(|c| lodepng::RGBA {
            r: c.r,
            g: c.g,
            b: c.b,
            a: c.a,
        })
        .collect();

    let mut encoder = lodepng::Encoder::new();
    encoder.set_auto_convert(false);

    {
        let info = encoder.info_raw_mut();
        info.colortype = lodepng::ColorType::PALETTE;
        info.set_bitdepth(8);
        for color in &lode_palette {
            info.palette_add(*color)
                .map_err(|e| format!("Failed to add palette color: {}", e))?;
        }
    }

    {
        let info_png = encoder.info_png_mut();
        info_png.color.colortype = lodepng::ColorType::PALETTE;
        info_png.color.set_bitdepth(8);
        for color in &lode_palette {
            info_png.color.palette_add(*color)
                .map_err(|e| format!("Failed to add palette color: {}", e))?;
        }
    }

    let png_data = encoder
        .encode(&indexed_pixels, width, height)
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    Ok(png_data)
}
