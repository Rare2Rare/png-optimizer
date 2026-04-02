import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DropZone } from "./components/queue/DropZone";
import { PreviewPanel } from "./components/preview/PreviewPanel";
import { SettingsBar } from "./components/layout/SettingsBar";
import { ActionBar } from "./components/layout/ActionBar";
import { QueuePanel } from "./components/queue/QueuePanel";
import { loadImageInfo, generatePreview, optimizeSingle } from "./lib/tauri";
import { generateId, SUPPORTED_EXTENSIONS } from "./lib/constants";
import type {
  QueueItem,
  OptimizationSettings,
  PreviewResult,
} from "./lib/types";

function App() {
  const { t, i18n } = useTranslation();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [settings, setSettings] = useState<OptimizationSettings>({
    mode: "lossy",
    quality: 75,
    outputDir: "",
    stripMetadata: true,
    resize: { mode: "none", scale: 50, width: 0, height: 0 },
  });

  const selectedItem = queue.find((item) => item.id === selectedId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview regeneration when settings change
  useEffect(() => {
    if (!selectedItem) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await generatePreview(
          selectedItem.info.path,
          settings.mode,
          settings.quality,
          settings.stripMetadata,
          settings.resize,
        );
        setPreview(result);
      } catch (err) {
        console.error("Preview generation failed:", err);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings.mode, settings.quality, settings.stripMetadata, settings.resize, selectedItem?.id]);

  const addFiles = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      const ext = path.toLowerCase().slice(path.lastIndexOf("."));
      if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;

      try {
        const info = await loadImageInfo(path);
        const newItem: QueueItem = {
          id: generateId(),
          info,
          status: "pending",
          selected: true,
        };
        setQueue((prev) => [...prev, newItem]);
        setSelectedId((prev) => prev ?? newItem.id);
      } catch (err) {
        console.error("Failed to load image:", err);
      }
    }
  }, []);

  const removeItem = useCallback(
    (id: string) => {
      setQueue((prev) => prev.filter((item) => item.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setPreview(null);
      }
    },
    [selectedId],
  );

  const toggleItemSelection = useCallback((id: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  }, []);

  const selectItem = useCallback(
    async (id: string) => {
      setSelectedId(id);
      const item = queue.find((i) => i.id === id);
      if (!item) return;

      setPreviewLoading(true);
      try {
        const result = await generatePreview(
          item.info.path,
          settings.mode,
          settings.quality,
          settings.stripMetadata,
          settings.resize,
        );
        setPreview(result);
      } catch (err) {
        console.error("Preview generation failed:", err);
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [queue, settings],
  );

  const refreshPreview = useCallback(async () => {
    if (!selectedItem) return;
    setPreviewLoading(true);
    try {
      const result = await generatePreview(
        selectedItem.info.path,
        settings.mode,
        settings.quality,
        settings.stripMetadata,
        settings.resize,
      );
      setPreview(result);
    } catch (err) {
      console.error("Preview generation failed:", err);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedItem, settings]);

  const convertSelected = useCallback(async (selectAll = false) => {
    if (!settings.outputDir) {
      alert(t("actions.noOutputDir"));
      return;
    }

    let currentQueue = queue;
    if (selectAll) {
      currentQueue = queue.map((item) => ({ ...item, selected: true }));
      setQueue(currentQueue);
    }

    const targets = currentQueue.filter(
      (item) => item.selected && item.status !== "done",
    );
    if (targets.length === 0) return;

    setConverting(true);

    for (const item of targets) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "processing" as const } : q,
        ),
      );

      try {
        const result = await optimizeSingle(
          item.info.path,
          settings.outputDir,
          settings.mode,
          settings.quality,
          settings.stripMetadata,
          settings.resize,
        );
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "done" as const, result } : q,
          ),
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error" as const, error: errorMsg }
              : q,
          ),
        );
      }
    }

    setConverting(false);
  }, [queue, settings]);

  const convertAll = useCallback(async () => {
    convertSelected(true);
  }, [convertSelected]);

  const toggleLanguage = useCallback(() => {
    const next = i18n.language === "ja" ? "en" : "ja";
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
  }, [i18n]);

  const doneCount = queue.filter((item) => item.status === "done").length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 36,
          background: "var(--bg-secondary)",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
        data-tauri-drag-region
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>PNG Optimizer</span>
        <span
          style={{
            marginLeft: 8,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          v0.2.0
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={toggleLanguage}
          style={{
            padding: "2px 8px",
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {i18n.language === "ja" ? "EN" : "JA"}
        </button>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <QueuePanel
          queue={queue}
          selectedId={selectedId}
          onSelect={selectItem}
          onRemove={removeItem}
          onToggleSelection={toggleItemSelection}
          onAddFiles={addFiles}
          doneCount={doneCount}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {queue.length === 0 ? (
            <DropZone onFilesDropped={addFiles} />
          ) : (
            <PreviewPanel
              preview={preview}
              loading={previewLoading}
              selectedItem={selectedItem ?? null}
              onRefresh={refreshPreview}
            />
          )}
        </div>
      </div>

      {/* Settings bar */}
      <SettingsBar settings={settings} onSettingsChange={setSettings} />

      {/* Action bar */}
      <ActionBar
        onConvertSelected={convertSelected}
        onConvertAll={convertAll}
        converting={converting}
        totalCount={queue.length}
        doneCount={doneCount}
        selectedCount={queue.filter((i) => i.selected).length}
      />
    </div>
  );
}

export default App;
