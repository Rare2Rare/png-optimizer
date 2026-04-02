import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

interface DropZoneProps {
  onFilesDropped: (paths: string[]) => void;
}

export function DropZone({ onFilesDropped }: DropZoneProps) {
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
      unlisten.then((fn) => fn());
    };
  }, [onFilesDropped]);

  const handleBrowse = useCallback(async () => {
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
              {t("dropzone.formats")}
            </span>
          </>
        )}
      </div>
      <button
        onClick={handleBrowse}
        style={{
          padding: "8px 20px",
          background: "var(--accent)",
          color: "white",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          transition: "background 0.15s",
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
        onMouseOut={(e) => (e.currentTarget.style.background = "var(--accent)")}
      >
        {t("dropzone.browse")}
      </button>
    </div>
  );
}
