import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { formatFileSize } from "../../lib/constants";
import type { QueueItem } from "../../lib/types";

interface QueuePanelProps {
  queue: QueueItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onAddFiles: (paths: string[]) => void;
  doneCount: number;
}

const statusIcons: Record<string, string> = {
  pending: "\u23F3",
  processing: "\u2699\uFE0F",
  done: "\u2705",
  error: "\u274C",
};

export function QueuePanel({
  queue,
  selectedId,
  onSelect,
  onRemove,
  onToggleSelection,
  onAddFiles,
  doneCount,
}: QueuePanelProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (queue.length === 0) return;

    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const paths = event.payload.paths;
        if (paths.length > 0) onAddFiles(paths);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queue.length, onAddFiles]);

  const handleBrowse = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const files = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp"] }],
    });
    if (files) {
      const paths = Array.isArray(files) ? files : [files];
      onAddFiles(paths);
    }
  }, [onAddFiles]);

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>
          {t("queue.title")}
        </span>
        <button
          onClick={handleBrowse}
          style={{
            padding: "3px 8px",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {t("queue.add")}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
        {queue.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 4,
              cursor: "pointer",
              background: selectedId === item.id ? "var(--bg-tertiary)" : "transparent",
              transition: "background 0.1s",
            }}
            onMouseOver={(e) => {
              if (selectedId !== item.id) e.currentTarget.style.background = "var(--bg-surface)";
            }}
            onMouseOut={(e) => {
              if (selectedId !== item.id) e.currentTarget.style.background = "transparent";
            }}
          >
            <input
              type="checkbox"
              checked={item.selected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelection(item.id);
              }}
              style={{ accentColor: "var(--accent)", flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, marginRight: 2 }}>
              {statusIcons[item.status]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={item.info.fileName}
              >
                {item.info.fileName}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {formatFileSize(item.info.fileSize)}
                {item.result && (
                  <span style={{ color: "var(--success)" }}>
                    {" → "}
                    {formatFileSize(item.result.optimizedSize)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              style={{
                padding: "1px 4px",
                background: "transparent",
                color: "var(--text-muted)",
                fontSize: 14,
                lineHeight: 1,
                borderRadius: 3,
                flexShrink: 0,
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = "var(--error)")}
              onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "6px 12px",
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        {queue.length} {t("queue.files")} / {doneCount} {t("queue.done")}
      </div>
    </div>
  );
}
