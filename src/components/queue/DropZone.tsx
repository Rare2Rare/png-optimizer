import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

interface DropZoneProps {
  onFilesDropped: (paths: string[]) => void;
  onBrowseFolder: () => void;
}

export function DropZone({ onFilesDropped, onBrowseFolder }: DropZoneProps) {
  const { t } = useTranslation();
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setHovering(true);
      } else if (event.payload.type === "drop") {
        setHovering(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          onFilesDropped(paths);
        }
      } else if (event.payload.type === "leave") {
        setHovering(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn()).catch(console.error);
    };
  }, [onFilesDropped]);

  const handleBrowseFiles = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const files = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp"] }],
    });
    if (files) {
      const paths = Array.isArray(files) ? files : [files];
      onFilesDropped(paths);
    }
  }, [onFilesDropped]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        border: `2px dashed ${hovering ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12,
        margin: 24,
        background: hovering ? "rgba(74, 158, 255, 0.05)" : "transparent",
        transition: "all 0.2s ease",
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.3 }}>
        {hovering ? "\u{1F4E5}" : "\u{1F5BC}"}
      </div>
      <div style={{ fontSize: 16, color: "var(--text-secondary)", textAlign: "center" }}>
        {hovering ? (
          t("dropzone.drop")
        ) : (
          <>
            {t("dropzone.message")}
            <br />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("dropzone.formatsAndFolders")}
            </span>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleBrowseFiles} className="btn-primary">
          {t("dropzone.browse")}
        </button>
        <button onClick={onBrowseFolder} className="btn-secondary" style={{ padding: "8px 16px", fontSize: 13 }}>
          {t("dropzone.browseFolder")}
        </button>
      </div>
    </div>
  );
}
