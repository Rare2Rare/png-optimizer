use oxipng::{Options, StripChunks};

/// Lossless PNG optimization using oxipng.
/// Takes raw PNG bytes and returns optimized PNG bytes.
pub fn optimize_lossless(png_data: &[u8], strip_metadata: bool) -> Result<Vec<u8>, String> {
    let mut opts = Options::from_preset(4); // Balanced preset (0=fast, 6=max compression)

    if strip_metadata {
        opts.strip = StripChunks::Safe;
    } else {
        opts.strip = StripChunks::None;
    }

    oxipng::optimize_from_memory(png_data, &opts)
        .map_err(|e| format!("Lossless optimization failed: {}", e))
}
