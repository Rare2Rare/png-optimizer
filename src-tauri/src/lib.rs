mod commands;
mod models;
mod processing;

use commands::image_commands;
use commands::preview_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            preview_commands::load_image_info,
            preview_commands::generate_preview,
            image_commands::optimize_single,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
