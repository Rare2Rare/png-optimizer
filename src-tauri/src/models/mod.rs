use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub path: String,
    pub file_name: String,
    pub file_size: u64,
    pub width: u32,
    pub height: u32,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationResult {
    pub input_path: String,
    pub output_path: String,
    pub original_size: u64,
    pub optimized_size: u64,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub before_data_url: String,
    pub after_data_url: String,
    pub original_size: u64,
    pub optimized_size: u64,
    pub width: u32,
    pub height: u32,
}
