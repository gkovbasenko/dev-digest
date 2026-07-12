import React from "react";
import { Icon, type IconName } from "../icons";

export function IconBtn({
  icon,
  label,
  size = 30,
  active,
  onClick,
  danger,
  loading,
  disabled,
}: {
  icon: IconName;
  label: string;
  size?: number;
  active?: boolean;
  onClick?: () => void;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  // While loading, show a spinning RefreshCw regardless of the configured icon.
  const I = loading ? Icon.RefreshCw : Icon[icon];
  const off = disabled || loading;
  const [h, setH] = React.useState(false);
  return (
    <button
      title={label}
      aria-label={label}
      aria-busy={loading || undefined}
      onClick={onClick}
      disabled={off}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: size,
        height: size,
        display: "inline-grid",
        placeItems: "center",
        borderRadius: 6,
        border: "1px solid transparent",
        background: !off && (h || active) ? "var(--bg-hover)" : "transparent",
        color:
          danger && h ? "var(--crit)" : active || (h && !off) ? "var(--text-primary)" : "var(--text-secondary)",
        opacity: off ? 0.6 : 1,
        cursor: off ? "not-allowed" : "pointer",
        transition: "background .12s, color .12s",
      }}
    >
      <I
        size={Math.round(size * 0.52)}
        style={loading ? { animation: "ddspin 1s linear infinite" } : undefined}
      />
    </button>
  );
}
