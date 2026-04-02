import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatFileSize, formatReduction } from "../../lib/constants";
import type { PreviewResult, QueueItem } from "../../lib/types";

interface PreviewPanelProps {
  preview: PreviewResult | null;
  loading: boolean;
  selectedItem: QueueItem | null;
  onRefresh: () => void;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const ZOOM_STEP = 0.15;

export function PreviewPanel({
  preview,
  loading,
  selectedItem,
  onRefresh,
}: PreviewPanelProps) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Reset zoom/pan when switching images
  useEffect(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, [selectedItem?.id]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + delta * prev)));
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 1 && e.button !== 0) return; // left or middle click
      if (zoom <= 1 && e.button === 0) return; // only pan when zoomed in (or middle click)
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX, panY };
    },
    [zoom, panX, panY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setPanX(panStart.current.panX + (e.clientX - panStart.current.x));
      setPanY(panStart.current.panY + (e.clientY - panStart.current.y));
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(ZOOM_MAX, prev * 1.3));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(ZOOM_MIN, prev / 1.3));
  }, []);

  if (!selectedItem) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 14,
        }}
      >
        {t("queue.selectToPreview")}
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "var(--text-secondary)",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: "3px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <span style={{ fontSize: 13 }}>{t("preview.generating")}</span>
      </div>
    );
  }

  if (!preview) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: "var(--text-muted)",
        }}
      >
        <span>{t("preview.noPreview")}</span>
        <button
          onClick={onRefresh}
          style={{
            padding: "6px 14px",
            background: "var(--accent)",
            color: "white",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {t("preview.generate")}
        </button>
      </div>
    );
  }

  const imgStyle: React.CSSProperties = {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
    transformOrigin: "center center",
    transition: isPanning ? "none" : "transform 0.1s ease-out",
    cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default",
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Zoom controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "4px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        <button
          onClick={zoomOut}
          style={{
            padding: "1px 6px",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            borderRadius: 3,
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          -
        </button>
        <span
          style={{
            minWidth: 45,
            textAlign: "center",
            color: "var(--text-secondary)",
            fontWeight: 600,
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          style={{
            padding: "1px 6px",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            borderRadius: 3,
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          +
        </button>
        <button
          onClick={resetZoom}
          style={{
            padding: "1px 8px",
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            borderRadius: 3,
            fontSize: 10,
            marginLeft: 4,
          }}
        >
          {t("zoom.fit")}
        </button>
      </div>

      {/* Before / After images */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 2,
          padding: 12,
          overflow: "hidden",
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Before */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-secondary)",
              textAlign: "center",
            }}
          >
            {t("preview.before")}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-surface)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <img
              src={preview.beforeDataUrl}
              alt="Before"
              style={imgStyle}
              draggable={false}
            />
          </div>
        </div>

        {/* After */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-secondary)",
              textAlign: "center",
            }}
          >
            {t("preview.after")}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-surface)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <img
              src={preview.afterDataUrl}
              alt="After"
              style={imgStyle}
              draggable={false}
            />
          </div>
        </div>
      </div>

      {/* Size comparison bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        <span>
          {preview.width} x {preview.height}
        </span>
        <span style={{ color: "var(--text-muted)" }}>|</span>
        <span>{formatFileSize(preview.originalSize)}</span>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>→</span>
        <span style={{ color: "var(--success)", fontWeight: 600 }}>
          {formatFileSize(preview.optimizedSize)}
        </span>
        <span
          style={{
            color:
              preview.optimizedSize < preview.originalSize
                ? "var(--success)"
                : "var(--error)",
            fontWeight: 600,
          }}
        >
          ({formatReduction(preview.originalSize, preview.optimizedSize)})
        </span>
      </div>
    </div>
  );
}
