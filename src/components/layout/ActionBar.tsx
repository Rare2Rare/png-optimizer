import { useTranslation } from "react-i18next";

interface ActionBarProps {
  onConvertSelected: () => void;
  onConvertAll: () => void;
  converting: boolean;
  totalCount: number;
  doneCount: number;
  selectedCount: number;
}

export function ActionBar({
  onConvertSelected,
  onConvertAll,
  converting,
  totalCount,
  doneCount,
  selectedCount,
}: ActionBarProps) {
  const { t } = useTranslation();
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  return (
    <div
      style={{
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderTop: "1px solid var(--border)",
        background: "var(--bg-primary)",
        flexShrink: 0,
      }}
    >
      <button
        onClick={onConvertSelected}
        disabled={converting || selectedCount === 0}
        style={{
          padding: "6px 16px",
          background: converting || selectedCount === 0 ? "var(--border)" : "var(--accent)",
          color: "white",
          borderRadius: 5,
          fontSize: 13,
          fontWeight: 500,
          opacity: converting || selectedCount === 0 ? 0.6 : 1,
          cursor: converting || selectedCount === 0 ? "not-allowed" : "pointer",
        }}
      >
        {converting
          ? t("actions.converting")
          : `${t("actions.convertSelected")} (${selectedCount})`}
      </button>

      <button
        onClick={onConvertAll}
        disabled={converting || totalCount === 0}
        style={{
          padding: "6px 16px",
          background: converting || totalCount === 0 ? "var(--border)" : "var(--bg-tertiary)",
          color: "var(--text-primary)",
          borderRadius: 5,
          fontSize: 13,
          fontWeight: 500,
          opacity: converting || totalCount === 0 ? 0.6 : 1,
          cursor: converting || totalCount === 0 ? "not-allowed" : "pointer",
        }}
      >
        {t("actions.convertAll")}
      </button>

      <div style={{ flex: 1 }} />
      {totalCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 120,
              height: 6,
              background: "var(--border)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: progress === 100 ? "var(--success)" : "var(--accent)",
                borderRadius: 3,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 50 }}>
            {doneCount}/{totalCount}
          </span>
        </div>
      )}
    </div>
  );
}
