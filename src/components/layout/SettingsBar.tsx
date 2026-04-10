import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OptimizationSettings, SettingsPreset } from "../../lib/types";

interface SettingsBarProps {
  settings: OptimizationSettings;
  onSettingsChange: (settings: OptimizationSettings) => void;
  watching: boolean;
  onStartWatch: () => void;
  onStopWatch: () => void;
  watchDir: string;
  onSetWatchDir: (dir: string) => void;
  presets: SettingsPreset[];
  onApplyPreset: (preset: SettingsPreset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
  recentOutputDirs: string[];
  recentWatchDirs: string[];
}

const selectStyle: React.CSSProperties = {
  padding: "2px 4px",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  fontSize: 11,
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  width: 50,
};

export function SettingsBar({
  settings,
  onSettingsChange,
  watching,
  onStartWatch,
  onStopWatch,
  watchDir,
  onSetWatchDir,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  recentOutputDirs,
  recentWatchDirs,
}: SettingsBarProps) {
  const { t } = useTranslation();
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  const update = useCallback(
    (partial: Partial<OptimizationSettings>) => {
      onSettingsChange({ ...settings, ...partial });
    },
    [settings, onSettingsChange],
  );

  const handleBrowseOutput = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true });
    if (dir) update({ outputDir: dir as string });
  }, [update]);

  const handleBrowseWatchDir = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true });
    if (dir) onSetWatchDir(dir as string);
  }, [onSetWatchDir]);

  const handlePresetChange = useCallback((name: string) => {
    setSelectedPreset(name);
    if (!name) return;
    const preset = presets.find((p) => p.name === name);
    if (preset) onApplyPreset(preset);
  }, [presets, onApplyPreset]);

  const handleSavePreset = useCallback(() => {
    const name = window.prompt(t("settings.presetNamePrompt"));
    if (name && name.trim()) {
      onSavePreset(name.trim());
      setSelectedPreset(name.trim());
    }
  }, [onSavePreset, t]);

  const handleDeletePreset = useCallback(() => {
    if (!selectedPreset) return;
    if (window.confirm(t("settings.presetDeleteConfirm", { name: selectedPreset }))) {
      onDeletePreset(selectedPreset);
      setSelectedPreset("");
    }
  }, [selectedPreset, onDeletePreset, t]);

  const targetKB = Math.round(settings.targetFileSize / 1024);
  const targetEnabled = settings.targetFileSize > 0;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        flexShrink: 0,
      }}
    >
      {/* Row 1: Preset, Mode, Quality, Format, Resize, Toggles */}
      <div
        style={{
          padding: "6px 16px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        {/* Preset */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
            {t("settings.preset")}
          </span>
          <select
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            style={{ ...selectStyle, minWidth: 80 }}
          >
            <option value="">{t("settings.presetNone")}</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <button onClick={handleSavePreset} className="btn-secondary"
            style={{ fontSize: 10, padding: "2px 6px" }}>
            {t("settings.presetSave")}
          </button>
          {selectedPreset && (
            <button onClick={handleDeletePreset}
              style={{
                padding: "2px 6px", background: "transparent",
                color: "var(--text-muted)", fontSize: 10, borderRadius: 3,
                border: "1px solid var(--border)",
              }}>
              ×
            </button>
          )}
        </div>

        {/* Mode */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
            {t("settings.mode")}
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 12 }}>
            <input type="radio" name="mode" checked={settings.mode === "lossless"}
              onChange={() => update({ mode: "lossless" })} style={{ accentColor: "var(--accent)" }} />
            {t("settings.lossless")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 12 }}>
            <input type="radio" name="mode" checked={settings.mode === "lossy"}
              onChange={() => update({ mode: "lossy" })} style={{ accentColor: "var(--accent)" }} />
            {t("settings.lossy")}
          </label>
        </div>

        {/* Quality (disabled when target size is enabled) */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          opacity: settings.mode === "lossless" || targetEnabled ? 0.4 : 1,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{t("settings.quality")}</span>
          <input type="range" min={1} max={100} value={settings.quality}
            onChange={(e) => update({ quality: Number(e.target.value) })}
            disabled={settings.mode === "lossless" || targetEnabled}
            style={{ width: 70, accentColor: "var(--accent)" }} />
          <span style={{ fontSize: 12, width: 22, textAlign: "right" }}>{settings.quality}</span>
        </div>

        {/* Target file size */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          opacity: settings.mode === "lossless" ? 0.4 : 1,
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={targetEnabled}
              onChange={(e) => update({
                targetFileSize: e.target.checked ? (targetKB > 0 ? targetKB : 200) * 1024 : 0,
              })}
              disabled={settings.mode === "lossless"}
              style={{ accentColor: "var(--accent)" }} />
            {t("settings.targetSize")}
          </label>
          {targetEnabled && (
            <>
              <input type="number" min={1} value={targetKB}
                onChange={(e) => update({ targetFileSize: Math.max(1, Number(e.target.value)) * 1024 })}
                style={{ ...inputStyle, width: 55 }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>KB</span>
            </>
          )}
        </div>

        {/* Output format */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{t("settings.format")}</span>
          <select value={settings.outputFormat}
            onChange={(e) => update({ outputFormat: e.target.value as "png" | "webp" })}
            style={selectStyle}>
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
          </select>
        </div>

        {/* Resize */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{t("settings.resize")}</span>
          <select
            value={settings.resize.mode === "scale" ? String(settings.resize.scale) : settings.resize.mode}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "none") update({ resize: { ...settings.resize, mode: "none" } });
              else if (val === "custom") update({ resize: { ...settings.resize, mode: "custom" } });
              else update({ resize: { ...settings.resize, mode: "scale", scale: Number(val) } });
            }}
            style={selectStyle}>
            <option value="none">{t("settings.resizeNone")}</option>
            <option value="75">75%</option>
            <option value="50">50%</option>
            <option value="25">25%</option>
            <option value="custom">{t("settings.resizeCustom")}</option>
          </select>
          {settings.resize.mode === "custom" && (
            <>
              <input type="number" placeholder="W" value={settings.resize.width || ""}
                onChange={(e) => update({ resize: { ...settings.resize, width: Number(e.target.value) } })}
                style={inputStyle} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>x</span>
              <input type="number" placeholder="H" value={settings.resize.height || ""}
                onChange={(e) => update({ resize: { ...settings.resize, height: Number(e.target.value) } })}
                style={inputStyle} />
            </>
          )}
        </div>

        {/* Toggles */}
        <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={settings.stripMetadata}
            onChange={(e) => update({ stripMetadata: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
          {t("settings.stripMetadata")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={settings.skipIfLarger}
            onChange={(e) => update({ skipIfLarger: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
          {t("settings.skipIfLarger")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={settings.trashOriginal}
            onChange={(e) => update({ trashOriginal: e.target.checked })} style={{ accentColor: "var(--warning)" }} />
          {t("settings.trashOriginal")}
        </label>
      </div>

      {/* Row 2: Template, Output dir, Watch folder */}
      <div
        style={{
          padding: "4px 16px 6px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          borderTop: "1px solid var(--border)",
        }}
      >
        {/* Filename template */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{t("settings.template")}</span>
          <input
            type="text"
            value={settings.outputTemplate}
            onChange={(e) => update({ outputTemplate: e.target.value })}
            placeholder="{name}_optimized.{ext}"
            title={t("settings.templateHelp")}
            style={{ ...selectStyle, width: 180 }}
          />
        </div>

        {/* Output dir with recent dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{t("settings.output")}</span>
          <div
            style={{
              padding: "3px 8px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: 11,
              maxWidth: 150,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: settings.outputDir ? "var(--text-primary)" : "var(--text-muted)",
            }}
            title={settings.outputDir}
          >
            {settings.outputDir || t("settings.notSelected")}
          </div>
          {recentOutputDirs.length > 0 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) update({ outputDir: e.target.value }); }}
              style={{ ...selectStyle, width: 24, padding: "2px 0" }}
              title={t("settings.recent")}
            >
              <option value="">▾</option>
              {recentOutputDirs.map((dir) => (
                <option key={dir} value={dir}>{dir}</option>
              ))}
            </select>
          )}
          <button onClick={handleBrowseOutput} className="btn-secondary" style={{ fontSize: 10, padding: "2px 6px" }}>
            {t("settings.browse")}
          </button>
        </div>

        {/* Watch folder with recent dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: watching ? "var(--success)" : "var(--text-secondary)",
          }}>
            {watching ? t("settings.watching") : t("settings.watchDir")}
          </span>
          <div
            style={{
              padding: "3px 8px",
              background: "var(--bg-surface)",
              border: `1px solid ${watching ? "var(--success)" : "var(--border)"}`,
              borderRadius: 4,
              fontSize: 11,
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: watchDir ? "var(--text-primary)" : "var(--text-muted)",
            }}
            title={watchDir}
          >
            {watchDir ? watchDir.split(/[\\/]/).pop() : t("settings.notSelected")}
          </div>
          {recentWatchDirs.length > 0 && !watching && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) onSetWatchDir(e.target.value); }}
              style={{ ...selectStyle, width: 24, padding: "2px 0" }}
              title={t("settings.recent")}
            >
              <option value="">▾</option>
              {recentWatchDirs.map((dir) => (
                <option key={dir} value={dir}>{dir}</option>
              ))}
            </select>
          )}
          <button onClick={handleBrowseWatchDir} className="btn-secondary" style={{ fontSize: 10, padding: "2px 6px" }}>
            {t("settings.browse")}
          </button>
          {watchDir && (
            <button
              onClick={watching ? onStopWatch : onStartWatch}
              style={{
                padding: "2px 8px",
                background: watching ? "var(--error)" : "var(--success)",
                color: "white",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {watching ? t("settings.watchStop") : t("settings.watchStart")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
