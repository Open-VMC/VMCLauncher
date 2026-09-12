import { useState, useEffect, useRef, useCallback } from "react";
import { useI18n } from "../../i18n";
import type { ConsoleLine, ServerDetails } from "../../types";
import { api } from "../../lib/api";

const MAX_LINES = 500;

export function ConsoleView({ details, onCommand }: { details: ServerDetails; onCommand: (cmd: string) => Promise<void> }) {
  const { t } = useI18n();
  const [cmd, setCmd] = useState("");
  const [lines, setLines] = useState<ConsoleLine[]>(() => [...details.consoleLines]);
  const outputRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const serverUuid = details.server.serverUuid;

  const handleScroll = () => {
    const el = outputRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  useEffect(() => {
    const unsub = api.onEvent((event) => {
      if (event.type === "console-line" && event.serverUuid === serverUuid && event.consoleLine) {
        setLines((prev) => {
          const next = [...prev, event.consoleLine!];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      }
    });
    return () => unsub();
  }, [serverUuid]);

  useEffect(() => {
    stickToBottom.current = true;
    setLines([...details.consoleLines]);
  }, [serverUuid]);

  // Merge polled lines with event-driven lines; deduplicate by ID so both paths coexist.
  useEffect(() => {
    if (!details.consoleLines.length) return;
    setLines((prev) => {
      const known = new Set(prev.map((l) => l.id));
      const fresh = details.consoleLines.filter((l) => !known.has(l.id));
      if (!fresh.length) return prev;
      const merged = [...prev, ...fresh];
      return merged.length > MAX_LINES ? merged.slice(-MAX_LINES) : merged;
    });
  }, [details.consoleLines]);

  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
      e.preventDefault();
      const el = outputRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const levelColor: Record<string, string> = {
    info: "var(--text-soft)",
    warn: "var(--yellow)",
    error: "#ff6b6b",
    command: "var(--text-soft)",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "16px" }}>
      <div
        ref={outputRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{ flex: 1, background: "var(--bg-console)", border: "1px solid var(--border)", borderRadius: 6, padding: "12px 14px", overflow: "auto", fontFamily: "JetBrains Mono, monospace", fontSize: 12, lineHeight: 1.7, outline: "none", userSelect: "text" }}
      >
        {lines.map((line) => (
          <div key={line.id} style={{ color: levelColor[line.level] ?? "var(--text-soft)" }}>
            {line.text}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); void onCommand(cmd); setCmd(""); }}
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}
      >
        <span style={{ color: "var(--green-light)", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 14 }}>&gt;</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder={t.console.commandPlaceholder}
          disabled={details.server.status === "stopped" || details.server.status === "error"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{ flex: 1, background: "var(--bg-console)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", padding: "8px 10px", outline: "none", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}
        />
      </form>
    </div>
  );
}
