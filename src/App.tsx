import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DropZone } from "./components/queue/DropZone";
import { PreviewPanel } from "./components/preview/PreviewPanel";
import { SettingsBar } from "./components/layout/SettingsBar";
import { ActionBar } from "./components/layout/ActionBar";
import { QueuePanel } from "./components/queue/QueuePanel";
import {
  loadImageInfosBatch,
  generatePreview,
  resolvePaths,
  optimizeBatch,
  startWatch,
  stopWatch,
} from "./lib/tauri";
import { generateId, formatFileSize } from "./lib/constants";
import {
  loadSettings,
  saveSettings,
  loadPresets,
  savePresets,
  loadRecentOutputDirs,
  pushRecentOutputDir,
  loadRecentWatchDirs,
  pushRecentWatchDir,
  loadLastOutputDir,
  saveLastOutputDir,
  loadLastWatchDir,
  saveLastWatchDir,
} from "./lib/storage";
import type {
  QueueItem,
  OptimizationSettings,
  PreviewResult,
  BatchProgressPayload,
  WatchEvent,
  SettingsPreset,
} from "./lib/types";

const DEFAULT_SETTINGS: OptimizationSettings = {
  mode: "lossy",
  quality: 75,
  outputDir: "",
  outputFormat: "png",
  outputTemplate: "{name}_optimized.{ext}",
  stripMetadata: true,
  skipIfLarger: true,
  trashOriginal: false,
  targetFileSize: 0,
  resize: { mode: "none", scale: 50, width: 0, height: 0 },
};

function App() {
  const { t, i18n } = useTranslation();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);

  // Initialize settings from localStorage
  const [settings, setSettings] = useState<OptimizationSettings>(() => {
    const saved = loadSettings();
    const base = saved ? { ...DEFAULT_SETTINGS, ...saved } : DEFAULT_SETTINGS;
    return { ...base, outputDir: loadLastOutputDir() };
  });
  const [watchDir, setWatchDir] = useState<string>(() => loadLastWatchDir());
  const [presets, setPresets] = useState<SettingsPreset[]>(() => loadPresets());
  const [recentOutputDirs, setRecentOutputDirs] = useState<string[]>(() => loadRecentOutputDirs());
  const [recentWatchDirs, setRecentWatchDirs] = useState<string[]>(() => loadRecentWatchDirs());

  const selectedItem = queue.find((item) => item.id === selectedId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const watchUnlistenRef = useRef<UnlistenFn | null>(null);

  // Persist settings whenever they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveLastOutputDir(settings.outputDir);
  }, [settings.outputDir]);

  useEffect(() => {
    saveLastWatchDir(watchDir);
  }, [watchDir]);

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

  // Wrapped setter to track recent output dirs
  const updateSettings = useCallback((next: OptimizationSettings) => {
    if (next.outputDir && next.outputDir !== settings.outputDir) {
      setRecentOutputDirs(pushRecentOutputDir(next.outputDir));
    }
    setSettings(next);
  }, [settings.outputDir]);

  const updateWatchDir = useCallback((dir: string) => {
    if (dir && dir !== watchDir) {
      setRecentWatchDirs(pushRecentWatchDir(dir));
    }
    setWatchDir(dir);
  }, [watchDir]);

  // ---- Preset management ----

  const applyPreset = useCallback((preset: SettingsPreset) => {
    setSettings((prev) => ({ ...preset.settings, outputDir: prev.outputDir }));
  }, []);

  const savePreset = useCallback((name: string) => {
    const { outputDir: _, ...rest } = settings;
    const newPreset: SettingsPreset = { name, settings: rest };
    setPresets((prev) => {
      const filtered = prev.filter((p) => p.name !== name);
      const next = [...filtered, newPreset];
      savePresets(next);
      return next;
    });
  }, [settings]);

  const deletePreset = useCallback((name: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.name !== name);
      savePresets(next);
      return next;
    });
  }, []);

  // ---- Report export ----

  const exportReport = useCallback(async () => {
    const completed = queue.filter((item) => item.status === "done" || item.status === "skipped" || item.status === "error");
    if (completed.length === 0) return;

    let totalOriginal = 0;
    let totalOptimized = 0;
    let doneC = 0;
    let skipC = 0;
    let errC = 0;
    for (const item of completed) {
      if (item.status === "done" && item.result) {
        totalOriginal += item.info.fileSize;
        totalOptimized += item.result.optimizedSize;
        doneC++;
      } else if (item.status === "skipped") {
        skipC++;
      } else if (item.status === "error") {
        errC++;
      }
    }
    const savedBytes = totalOriginal - totalOptimized;
    const savedPercent = totalOriginal > 0 ? (savedBytes / totalOriginal) * 100 : 0;

    // Build CSV
    const lines: string[] = [];
    lines.push(`# PNG Optimizer Report - ${new Date().toISOString()}`);
    lines.push(`# Total: ${completed.length} files, Done: ${doneC}, Skipped: ${skipC}, Error: ${errC}`);
    lines.push(`# Total saved: ${formatFileSize(savedBytes)} (-${savedPercent.toFixed(1)}%)`);
    lines.push("filename,original_bytes,optimized_bytes,reduction_percent,width,height,status,output_path,error");
    for (const item of completed) {
      const fn = item.info.fileName.replace(/"/g, '""');
      const orig = item.info.fileSize;
      const opt = item.result?.optimizedSize ?? 0;
      const pct = orig > 0 && item.result ? ((1 - opt / orig) * 100).toFixed(1) : "";
      const w = item.result?.width ?? item.info.width;
      const h = item.result?.height ?? item.info.height;
      const out = (item.result?.outputPath ?? "").replace(/"/g, '""');
      const err = (item.error ?? "").replace(/"/g, '""');
      lines.push(`"${fn}",${orig},${opt},${pct},${w},${h},${item.status},"${out}","${err}"`);
    }
    const csv = lines.join("\n");

    const { save } = await import("@tauri-apps/plugin-dialog");
    const savePath = await save({
      defaultPath: `png-optimizer-report-${Date.now()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!savePath) return;

    try {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(savePath, csv);
    } catch (err) {
      console.error("Failed to write report:", err);
      alert(`Failed to write report: ${err}`);
    }
  }, [queue]);

  const addFiles = useCallback(async (paths: string[]) => {
    let resolved: string[];
    try {
      resolved = await resolvePaths(paths, true);
    } catch {
      resolved = paths;
    }
    if (resolved.length === 0) return;

    let infos: import("./lib/types").ImageInfo[];
    try {
      infos = await loadImageInfosBatch(resolved);
    } catch (err) {
      console.error("Failed to load images:", err);
      return;
    }

    const newItems: QueueItem[] = infos.map((info) => ({
      id: generateId(),
      info,
      status: "pending" as const,
      selected: true,
    }));

    setQueue((prev) => {
      const existingPaths = new Set(prev.map((item) => item.info.path));
      const unique = newItems.filter((item) => !existingPaths.has(item.info.path));
      return [...prev, ...unique];
    });

    if (newItems.length > 0) {
      setSelectedId((prev) => prev ?? newItems[0].id);
    }
  }, []);

  const addFolder = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true });
    if (dir) addFiles([dir as string]);
  }, [addFiles]);

  const clearAll = useCallback(() => {
    setQueue([]);
    setSelectedId(null);
    setPreview(null);
  }, []);

  const replaceFolder = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true });
    if (!dir) return;
    setQueue([]);
    setSelectedId(null);
    setPreview(null);
    addFiles([dir as string]);
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
        settings.outputFormat, settings.outputTemplate, settings.targetFileSize,
        settings.resize,
      );
    } catch (err) {
      console.error("Batch optimization failed:", err);
      setConverting(false);
      setCurrentFile(null);
    }
  }, [queue, settings, t]);

  const convertAll = useCallback(async () => { convertSelected(true); }, [convertSelected]);

  const handleStartWatch = useCallback(async () => {
    if (!watchDir || !settings.outputDir) {
      alert(t("actions.noOutputDir"));
      return;
    }

    if (watchUnlistenRef.current) watchUnlistenRef.current();
    const unlisten = await listen<WatchEvent>("watch-file-processed", async (event) => {
      const w = event.payload;
      if (w.result) {
        try {
          const [info] = await loadImageInfosBatch([w.inputPath]);
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
          // File might have been trashed
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
        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>v0.5.0</span>
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
          onReplaceFolder={replaceFolder}
          onClearAll={clearAll}
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
        settings={settings} onSettingsChange={updateSettings}
        watching={watching} onStartWatch={handleStartWatch} onStopWatch={handleStopWatch}
        watchDir={watchDir} onSetWatchDir={updateWatchDir}
        presets={presets} onApplyPreset={applyPreset}
        onSavePreset={savePreset} onDeletePreset={deletePreset}
        recentOutputDirs={recentOutputDirs} recentWatchDirs={recentWatchDirs}
      />

      <ActionBar
        onConvertSelected={convertSelected} onConvertAll={convertAll}
        converting={converting} totalCount={queue.length}
        doneCount={doneCount} selectedCount={selectedCount}
        currentFile={currentFile} onClearCompleted={clearCompleted}
        onExportReport={exportReport}
      />
    </div>
  );
}

export default App;
