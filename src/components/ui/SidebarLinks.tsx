import type { ReactNode } from "react";

export function SidebarLink({ active, href, label, icon, suffix, disabled }: {
  active: boolean;
  href: string;
  label: string;
  icon?: ReactNode;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <a
      href={disabled ? undefined : href}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 4, fontWeight: active ? 600 : 400, fontSize: 14, color: active ? "var(--text-heading)" : "var(--text-soft)", background: active ? "rgba(76,158,63,0.18)" : "transparent", borderLeft: active ? "3px solid var(--green)" : "3px solid transparent", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, transition: "background 0.15s, color 0.15s", textDecoration: "none", userSelect: "none" }}
      onMouseEnter={(e) => { if (!active && !disabled) (e.currentTarget as HTMLAnchorElement).style.background = "var(--hover-subtle)"; }}
      onMouseLeave={(e) => { if (!active && !disabled) (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
    >
      {icon && <span style={{ opacity: 0.7, display: "inline-flex", alignItems: "center" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {suffix && <span style={{ fontSize: 10, background: "var(--pill-bg)", padding: "2px 6px", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600 }}>{suffix}</span>}
    </a>
  );
}

export function ServerNavLink({ active, label, suffix, onClick }: { active: boolean; label: string; suffix?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: active ? "rgba(76,158,63,0.15)" : "transparent", border: "none", borderLeft: active ? "3px solid var(--green)" : "3px solid transparent", color: active ? "var(--text-heading)" : "var(--text-soft)", fontWeight: active ? 600 : 400, fontSize: 14, cursor: "pointer", borderRadius: 4, textAlign: "left", transition: "background 0.12s" }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "var(--hover-subtle)"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {suffix && <span style={{ fontSize: 10, background: "var(--pill-bg)", padding: "2px 6px", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600 }}>{suffix}</span>}
    </button>
  );
}
