import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OptimizationSettings } from "../../lib/types";

interface SettingsBarProps {
  settings: OptimizationSettings;
  onSettingsChange: (settings: OptimizationSettings) => void;
}

export function SettingsBar({ settings, onSettingsChange }: SettingsBarProps) {
  const { t } = useTranslation();

  const update = useCallback(
    (partial: Partial<OptimizationSettings>) => {
      onSettingsChange({ ...settings, ...partial });
    },
    [settings, onSettingsChange],
  );

  const handleBrowseOutput = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true });
    if (dir) {
      update({ outputDir: dir as string });
    }
  }, [update]);

  const handleResizeModeChange = useCallback(
    (mode: "none" | "scale" | "custom") => {
      update({ resize: { ...settings.resize, mode } });
    },
    [update, settings.resize],
  );

  return (
    <div
      style={{
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderTop: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        flexWrap: "wrap",
        flexShrink: 0,
      }}
    >
      {/* Mode */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
          {t("settings.mode")}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 12 }}>
          <input
            type="radio"
            name="mode"
            checked={settings.mode === "lossless"}
            onChange={() => update({ mode: "lossless" })}
            style={{ accentColor: "var(--accent)" }}
          />
          {t("settings.lossless")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 12 }}>
          <input
            type="radio"
            name="mode"
            checked={settings.mode === "lossy"}
            onChange={() => update({ mode: "lossy" })}
            style={{ accentColor: "var(--accent)" }}
          />
          {t("settings.lossy")}
        </label>
      </div>

      {/* Quality slider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          opacity: settings.mode === "lossless" ? 0.4 : 1,
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
          {t("settings.quality")}
        </span>
        <input
          type="range"
          min={1}
          max={100}
          value={settings.quality}
          onChange={(e) => update({ quality: Number(e.target.value) })}
          disabled={settings.mode === "lossless"}
          style={{ width: 80, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: 12, width: 24, textAlign: "right" }}>
          {settings.quality}
        </span>
      </div>

      {/* Resize */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
          {t("settings.resize")}
        </span>
        <select
          value={settings.resize.mode === "scale" ? String(settings.resize.scale) : settings.resize.mode}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "none") handleResizeModeChange("none");
            else if (val === "custom") handleResizeModeChange("custom");
            else update({ resize: { ...settings.resize, mode: "scale", scale: Number(val) } });
          }}
          style={{
            padding: "2px 4px",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            fontSize: 11,
          }}
        >
          <option value="none">{t("settings.resizeNone")}</option>
          <option value="75">75%</option>
          <option value="50">50%</option>
          <option value="25">25%</option>
          <option value="custom">{t("settings.resizeCustom")}</option>
        </select>
        {settings.resize.mode === "custom" && (
          <>
            <input
              type="number"
              placeholder="W"
              value={settings.resize.width || ""}
              onChange={(e) =>
                update({ resize: { ...settings.resize, width: Number(e.target.value) } })
              }
              style={{
                width: 50,
                padding: "2px 4px",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                fontSize: 11,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>x</span>
            <input
              type="number"
              placeholder="H"
              value={settings.resize.height || ""}
              onChange={(e) =>
                update({ resize: { ...settings.resize, height: Number(e.target.value) } })
              }
              style={{
                width: 50,
                padding: "2px 4px",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                fontSize: 11,
              }}
            />
          </>
        )}
      </div>

      {/* Metadata toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 12 }}>
        <input
          type="checkbox"
          checked={settings.stripMetadata}
          onChange={(e) => update({ stripMetadata: e.target.checked })}
          style={{ accentColor: "var(--accent)" }}
        />
        {t("settings.stripMetadata")}
      </label>

      {/* Output dir */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
          {t("settings.output")}
        </span>
        <div
          style={{
            padding: "3px 8px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 12,
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: settings.outputDir ? "var(--text-primary)" : "var(--text-muted)",
          }}
          title={settings.outputDir}
        >
          {settings.outputDir || t("settings.notSelected")}
        </div>
        <button
          onClick={handleBrowseOutput}
          style={{
            padding: "3px 10px",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {t("settings.browse")}
        </button>
      </div>
    </div>
  );
}
