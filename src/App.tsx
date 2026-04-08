import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DropZone } from "./components/queue/DropZone";
import { PreviewPanel } from "./components/preview/PreviewPanel";
import { SettingsBar } from "./components/layout/SettingsBar";
import { ActionBar } from "./components/layout/ActionBar";
import { QueuePanel } from "./components/queue/QueuePanel";
import {
  loadImageInfo,
  generatePreview,
  resolvePaths,
  optimizeBatch,
  startWatch,
  stopWatch,
} from "./lib/tauri";
import { generateId } from "./lib/constants";
import type {
  QueueItem,
  OptimizationSettings,
  PreviewResult,
  BatchProgressPayload,
  WatchEvent,
} from "./lib/types";

function App() {
  const { t, i18n } = useTranslation();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [watchDir, setWatchDir] = useState("");
  const [settings, setSettings] = useState<OptimizationSettings>({
    mode: "lossy",
    quality: 75,
    outputDir: "",
    outputFormat: "png",
    outputTemplate: "{name}_optimized.{ext}",
    stripMetadata: true,
    skipIfLarger: true,
    trashOriginal: false,
    resize: { mode: "none", scale: 50, width: 0, height: 0 },
  });

  const selectedItem = queue.find((item) => item.id === selectedId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const watchUnlistenRef = useRef<UnlistenFn | null>(null);

  // Debounced preview regeneration
  useEffect(() => {
    if (!selectedItem) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await generatePreview(
          selectedItem.info.path, settings.mode, settings.quality,
          settings.stripMetadata, settings.resize,
        );
        setPreview(result);
      } catch (err) {
        console.error("Preview generation failed:", err);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [settings.mode, settings.quality, settings.stripMetadata, settings.resize, selectedItem?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) unlistenRef.current();
      if (watchUnlistenRef.current) watchUnlistenRef.current();
    };
  }, []);

  const addFiles = useCallback(async (paths: string[]) => {
    let resolved: string[];
    try {
      resolved = await resolvePaths(paths, true);
    } catch {
      resolved = paths;
    }
    for (const path of resolved) {
      try {
        const info = await loadImageInfo(path);
        const newItem: QueueItem = {
          id: generateId(), info, status: "pending", selected: true,
        };
        setQueue((prev) => {
          if (prev.some((item) => item.info.path === path)) return prev;
          return [...prev, newItem];
        });
        setSelectedId((prev) => prev ?? newItem.id);
      } catch (err) {
        console.error("Failed to load image:", err);
      }
    }
  }, []);

  const addFolder = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true });
    if (dir) addFiles([dir as string]);
  }, [addFiles]);

  const removeItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
    if (selectedId === id) { setSelectedId(null); setPreview(null); }
  }, [selectedId]);

  const toggleItemSelection = useCallback((id: string) => {
    setQueue((prev) => prev.map((item) =>
      item.id === id ? { ...item, selected: !item.selected } : item,
    ));
  }, []);

  const selectAll = useCallback(() => {
    setQueue((prev) => prev.map((item) => ({ ...item, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setQueue((prev) => prev.map((item) => ({ ...item, selected: false })));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => {
      const remaining = prev.filter((item) => item.status !== "done");
      if (selectedId && !remaining.some((item) => item.id === selectedId)) {
        setSelectedId(null); setPreview(null);
      }
      return remaining;
    });
  }, [selectedId]);

  const selectItem = useCallback(async (id: string) => {
    setSelectedId(id);
    const item = queue.find((i) => i.id === id);
    if (!item) return;
    setPreviewLoading(true);
    try {
      const result = await generatePreview(
        item.info.path, settings.mode, settings.quality,
        settings.stripMetadata, settings.resize,
      );
      setPreview(result);
    } catch (err) {
      console.error("Preview generation failed:", err);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [queue, settings]);

  const refreshPreview = useCallback(async () => {
    if (!selectedItem) return;
    setPreviewLoading(true);
    try {
      const result = await generatePreview(
        selectedItem.info.path, settings.mode, settings.quality,
        settings.stripMetadata, settings.resize,
      );
      setPreview(result);
    } catch (err) {
      console.error("Preview generation failed:", err);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedItem, settings]);

  // Event-driven batch conversion
  const convertSelected = useCallback(async (doSelectAll = false) => {
    if (!settings.outputDir) { alert(t("actions.noOutputDir")); return; }

    let currentQueue = queue;
    if (doSelectAll) {
      currentQueue = queue.map((item) => ({ ...item, selected: true }));
      setQueue(currentQueue);
    }

    const targets = currentQueue.filter((item) => item.selected && item.status !== "done");
    if (targets.length === 0) return;

    const targetPaths = targets.map((item) => item.info.path);
    setQueue((prev) => prev.map((q) =>
      targetPaths.includes(q.info.path) ? { ...q, status: "processing" as const } : q,
    ));
    setConverting(true);
    setCurrentFile(null);

    if (unlistenRef.current) unlistenRef.current();

    const unlistenProgress = await listen<BatchProgressPayload>("batch-progress", (event) => {
      const p = event.payload;
      setCurrentFile(p.inputPath.split(/[\\/]/).pop() ?? null);
      setQueue((prev) => prev.map((q) => {
        if (q.info.path !== p.inputPath) return q;
        if (p.status === "skipped" && p.result) return { ...q, status: "skipped" as const, result: p.result };
        if (p.status === "done" && p.result) return { ...q, status: "done" as const, result: p.result };
        return { ...q, status: "error" as const, error: p.error ?? "Unknown error" };
      }));
    });

    const unlistenComplete = await listen("batch-complete", () => {
      setConverting(false);
      setCurrentFile(null);
      unlistenProgress();
      unlistenComplete();
      unlistenRef.current = null;
    });

    unlistenRef.current = () => { unlistenProgress(); unlistenComplete(); };

    try {
      await optimizeBatch(
        targetPaths, settings.outputDir, settings.mode, settings.quality,
        settings.stripMetadata, settings.skipIfLarger, settings.trashOriginal,
        settings.outputFormat, settings.outputTemplate, settings.resize,
      );
    } catch (err) {
      console.error("Batch optimization failed:", err);
      setConverting(false);
      setCurrentFile(null);
    }
  }, [queue, settings, t]);

  const convertAll = useCallback(async () => { convertSelected(true); }, [convertSelected]);

  // Watch folder
  const handleStartWatch = useCallback(async () => {
    if (!watchDir || !settings.outputDir) {
      alert(t("actions.noOutputDir"));
      return;
    }

    // Listen for watch events
    if (watchUnlistenRef.current) watchUnlistenRef.current();
    const unlisten = await listen<WatchEvent>("watch-file-processed", async (event) => {
      const w = event.payload;
      if (w.result) {
        try {
          const info = await loadImageInfo(w.inputPath);
          setQueue((prev) => {
            if (prev.some((item) => item.info.path === w.inputPath)) return prev;
            return [...prev, {
              id: generateId(),
              info,
              status: w.result?.skipped ? "skipped" as const : "done" as const,
              result: w.result,
              selected: false,
            }];
          });
        } catch {
          // File might have been trashed, just add with minimal info
        }
      }
    });
    watchUnlistenRef.current = unlisten;

    try {
      await startWatch(
        watchDir, settings.outputDir, settings.mode, settings.quality,
        settings.stripMetadata, settings.skipIfLarger,
        settings.outputFormat, settings.outputTemplate,
      );
      setWatching(true);
    } catch (err) {
      console.error("Failed to start watch:", err);
      unlisten();
    }
  }, [watchDir, settings, t]);

  const handleStopWatch = useCallback(async () => {
    try {
      await stopWatch();
    } catch (err) {
      console.error("Failed to stop watch:", err);
    }
    if (watchUnlistenRef.current) {
      watchUnlistenRef.current();
      watchUnlistenRef.current = null;
    }
    setWatching(false);
  }, []);

  const toggleLanguage = useCallback(() => {
    const next = i18n.language === "ja" ? "en" : "ja";
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
  }, [i18n]);

  const doneCount = queue.filter((item) => item.status === "done").length;
  const selectedCount = queue.filter((i) => i.selected).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Title bar */}
      <div
        style={{
          height: 36, background: "var(--bg-secondary)",
          display: "flex", alignItems: "center", padding: "0 12px",
          borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}
        data-tauri-drag-region
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>PNG Optimizer</span>
        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>v0.4.0</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={toggleLanguage}
          style={{
            padding: "2px 8px", background: "var(--bg-tertiary)",
            color: "var(--text-secondary)", borderRadius: 4, fontSize: 11, fontWeight: 600,
          }}
        >
          {i18n.language === "ja" ? "EN" : "JA"}
        </button>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <QueuePanel
          queue={queue} selectedId={selectedId}
          onSelect={selectItem} onRemove={removeItem} onToggleSelection={toggleItemSelection}
          onAddFiles={addFiles} onAddFolder={addFolder}
          onSelectAll={selectAll} onDeselectAll={deselectAll}
          onClearCompleted={clearCompleted}
          doneCount={doneCount} selectedCount={selectedCount}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {queue.length === 0 ? (
            <DropZone onFilesDropped={addFiles} onBrowseFolder={addFolder} />
          ) : (
            <PreviewPanel
              preview={preview} loading={previewLoading}
              selectedItem={selectedItem ?? null} onRefresh={refreshPreview}
            />
          )}
        </div>
      </div>

      <SettingsBar
        settings={settings} onSettingsChange={setSettings}
        watching={watching} onStartWatch={handleStartWatch} onStopWatch={handleStopWatch}
        watchDir={watchDir} onSetWatchDir={setWatchDir}
      />

      <ActionBar
        onConvertSelected={convertSelected} onConvertAll={convertAll}
        converting={converting} totalCount={queue.length}
        doneCount={doneCount} selectedCount={selectedCount}
        currentFile={currentFile} onClearCompleted={clearCompleted}
      />
    </div>
  );
}

export default App;
