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
  onAddFolder: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClearCompleted: () => void;
  doneCount: number;
  selectedCount: number;
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
  onAddFolder,
  onSelectAll,
  onDeselectAll,
  onClearCompleted,
  doneCount,
  selectedCount,
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
      unlisten.then((fn) => fn()).catch(console.error);
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

  const allSelected = queue.length > 0 && selectedCount === queue.length;

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "6px 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>
          {t("queue.title")}
        </span>
        {queue.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {selectedCount}/{queue.length} {t("queue.selected")}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {queue.length > 0 && (
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="btn-secondary"
            style={{ fontSize: 10, padding: "1px 5px" }}
          >
            {allSelected ? t("queue.deselectAll") : t("queue.selectAll")}
          </button>
        )}
        <button onClick={handleBrowse} className="btn-secondary" style={{ fontSize: 10, padding: "1px 5px" }}>
          {t("queue.add")}
        </button>
        <button onClick={onAddFolder} className="btn-secondary" style={{ fontSize: 10, padding: "1px 5px" }}>
          {t("queue.addFolder")}
        </button>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
        {queue.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`queue-item${selectedId === item.id ? " active" : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 4,
              cursor: "pointer",
              transition: "background 0.1s",
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
              className="btn-remove"
              aria-label="Remove image"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "6px 10px",
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>
          {queue.length} {t("queue.files")} / {doneCount} {t("queue.done")}
        </span>
        {doneCount > 0 && (
          <>
            <div style={{ flex: 1 }} />
            <button
              onClick={onClearCompleted}
              style={{
                padding: "1px 6px",
                background: "transparent",
                color: "var(--text-muted)",
                fontSize: 10,
                borderRadius: 3,
                border: "1px solid var(--border)",
              }}
            >
              {t("queue.clearCompleted")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
