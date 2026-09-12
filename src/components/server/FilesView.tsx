import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import Editor from "react-simple-code-editor";
import Prism from "../../lib/prism";
import { useI18n } from "../../i18n";
import type { FileEntry, ServerDetails } from "../../types";
import { api } from "../../lib/api";
import { Btn, Input } from "../ui/Primitives";
import { Pencil, Folder, FileText, Trash2, ChevronUp, ChevronDown, X } from "lucide-react";

function getLanguage(filename: string | null): string {
  if (!filename) return "none";
  if (filename.endsWith(".json")) return "json";
  if (filename.endsWith(".yml") || filename.endsWith(".yaml")) return "yaml";
  if (filename.endsWith(".properties")) return "properties";
  if (filename.endsWith(".sh")) return "bash";
  if (filename.endsWith(".md")) return "markdown";
  if (filename.endsWith(".toml")) return "toml";
  if (filename.endsWith(".lua")) return "lua";
  if (filename.endsWith(".sql")) return "sql";
  if (filename.endsWith(".py")) return "python";
  if (filename.endsWith(".rs")) return "rust";
  if (filename.endsWith(".js")) return "javascript";
  if (filename.endsWith(".ts") || filename.endsWith(".tsx")) return "typescript";
  if (filename.endsWith(".css") || filename.endsWith(".scss")) return "css";
  if (filename.endsWith(".html") || filename.endsWith(".xml")) return "markup";
  if (filename.endsWith(".conf") || filename.endsWith(".nginx")) return "nginx";
  if (filename.toLowerCase() === "dockerfile") return "docker";
  return "none";
}

function highlightCode(code: string, language: string, search?: string): string {
  let html: string;
  if (language === "none" || !code) {
    html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  } else {
    try {
      const grammar = Prism.languages[language];
      html = grammar ? Prism.highlight(code, grammar, language) : code;
    } catch {
      html = code;
    }
  }
  if (!search) return html;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const htmlEscaped = escaped.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const re = new RegExp(`(${htmlEscaped})`, "gi");
  return html.replace(/(<[^>]*>)|([^<]+)/g, (_, tag: string, text: string) => {
    if (tag) return tag;
    return text.replace(re, '<mark style="background:rgba(255,200,0,0.3);color:inherit;border-radius:2px;padding:0 1px">$1</mark>');
  });
}

function parentDir(dir: string): string {
  if (dir === "." || dir === "") return ".";
  const idx = dir.lastIndexOf("/");
  return idx === -1 ? "." : dir.substring(0, idx);
}

function breadcrumbParts(dir: string): string[] {
  if (dir === "." || dir === "") return [];
  return dir.split("/");
}

export function FilesView({
  details,
  withFeedback,
  setFeedback,
}: {
  details: ServerDetails;
  onReloadDetails: () => Promise<void>;
  withFeedback: (work: () => Promise<void>) => Promise<void>;
  setFeedback: (m: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const serverUuid = details.server.serverUuid;

  const [currentDir, setCurrentDir] = useState(".");
  const [items, setItems] = useState<FileEntry[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [creationModal, setCreationModal] = useState<{ kind: "file" | "directory" | "rename"; target?: FileEntry } | null>(null);
  const [creationName, setCreationName] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);

  const searchMatches = useMemo(() => {
    if (!searchQuery || !content) return [] as number[];
    const positions: number[] = [];
    const q = searchQuery.toLowerCase();
    const lower = content.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(q, idx)) !== -1) {
      positions.push(idx);
      idx += 1;
    }
    return positions;
  }, [content, searchQuery]);

  useEffect(() => {
    if (!selectedFile) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setMatchIdx(0);
        setTimeout(() => searchRef.current?.select(), 0);
      }
      if (e.key === "Escape" && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedFile, searchOpen]);

  useEffect(() => {
    if (searchMatches.length === 0 || !editorAreaRef.current) return;
    const pos = searchMatches[matchIdx % searchMatches.length];
    const lineNum = content.substring(0, pos).split("\n").length - 1;
    const lineHeight = 20;
    const container = editorAreaRef.current;
    container.scrollTop = Math.max(0, lineNum * lineHeight - container.clientHeight / 2);
  }, [searchMatches, matchIdx, content]);

  const searchNext = () => setMatchIdx((i) => (searchMatches.length > 0 ? (i + 1) % searchMatches.length : 0));
  const searchPrev = () => setMatchIdx((i) => (searchMatches.length > 0 ? (i - 1 + searchMatches.length) % searchMatches.length : 0));
  const closeSearch = () => { setSearchOpen(false); setSearchQuery(""); };

  const loadDir = useCallback(async (dir: string) => {
    setLoadingDir(true);
    try {
      const entries = await api.listServerFiles(serverUuid, dir);
      setItems(entries);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t.error);
    } finally {
      setLoadingDir(false);
    }
  }, [serverUuid, setFeedback, t.error]);

  useEffect(() => {
    void loadDir(currentDir);
  }, [currentDir, serverUuid, loadDir]);

  useEffect(() => {
    setCurrentDir(".");
    setSelectedFile(null);
  }, [serverUuid]);

  useEffect(() => {
    if (!selectedFile) { setContent(""); setDirty(false); setFileError(null); return; }
    let mounted = true;
    setLoadingFile(true); setFileError(null);
    api.readServerFile(serverUuid, selectedFile)
      .then((file) => { if (mounted) { setContent(file.content); setDirty(false); } })
      .catch((err) => { if (mounted) setFileError(err instanceof Error ? err.message : t.error); })
      .finally(() => { if (mounted) setLoadingFile(false); });
    return () => { mounted = false; };
  }, [selectedFile, serverUuid, t.error]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true); setFileError(null);
    try {
      await api.writeServerFile(serverUuid, selectedFile, content);
      setDirty(false);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : t.error);
    } finally { setSaving(false); }
  };

  const handleGoBack = () => {
    if (dirty && !window.confirm(t.files.unsavedChanges)) return;
    setSelectedFile(null);
    setDirty(false);
    closeSearch();
  };

  const performCreation = async () => {
    if (!creationModal || !creationName.trim()) return;
    const name = creationName.trim();
    const modal = creationModal;
    setCreationModal(null); setCreationName("");
    await withFeedback(async () => {
      if (modal.kind === "directory") {
        const path = currentDir === "." ? name : `${currentDir}/${name}`;
        await api.createServerDirectory(serverUuid, path);
      } else if (modal.kind === "file") {
        const path = currentDir === "." ? name : `${currentDir}/${name}`;
        await api.writeServerFile(serverUuid, path, "");
        setSelectedFile(path);
      } else if (modal.kind === "rename" && modal.target) {
        const item = modal.target;
        const parent = parentDir(item.path);
        const dest = parent === "." ? name : `${parent}/${name}`;
        await api.moveServerFiles(serverUuid, [item.path], dest);
      }
      await loadDir(currentDir);
    });
  };

  const handleDelete = async (item: FileEntry) => {
    if (!window.confirm(t.files.deleteConfirm)) return;
    await withFeedback(async () => {
      await api.deleteServerFiles(serverUuid, [item.path]);
      await loadDir(currentDir);
    });
  };

  const navigateTo = (dir: string) => {
    if (dirty && !window.confirm(t.files.unsavedChanges)) return;
    setSelectedFile(null);
    setDirty(false);
    setCurrentDir(dir);
  };

  const crumbs = breadcrumbParts(currentDir);
  const fileName = selectedFile ? selectedFile.split("/").pop() : null;
  const fileCrumbs = selectedFile ? selectedFile.split("/").slice(0, -1) : [];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "24px 32px", overflow: "hidden", background: "var(--bg)", position: "relative" }}>
      {creationModal && (
        <div onMouseDown={(e: React.MouseEvent) => { if (e.target === e.currentTarget) setCreationModal(null); }} style={{ position: "absolute", inset: 0, background: "var(--overlay-bg)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 100 }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: "var(--bg-card)", border: "1px solid var(--border-hover)", borderRadius: 8, width: 400, padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>
              {creationModal.kind === "directory" ? t.files.createDirectory : creationModal.kind === "file" ? t.files.newFile : t.files.rename}
            </h3>
            <Input value={creationName} onChange={setCreationName} placeholder={t.files.namePlaceholder} autoFocus onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") void performCreation(); if (e.key === "Escape") setCreationModal(null); }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <Btn variant="ghost" onClick={() => setCreationModal(null)}>{t.cancel}</Btn>
              <Btn variant="primary" onClick={() => void performCreation()} disabled={!creationName.trim()}>{t.create}</Btn>
            </div>
          </motion.div>
        </div>
      )}

      {/* Breadcrumb + actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-soft)" }}>
          <span style={{ cursor: "pointer", color: "var(--text)", fontWeight: 600 }} onClick={() => navigateTo(".")}>{t.files.root}</span>
          {!selectedFile ? (
            crumbs.map((part, idx) => {
              const path = crumbs.slice(0, idx + 1).join("/");
              const isLast = idx === crumbs.length - 1;
              return (
                <span key={path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--text-muted)" }}>/</span>
                  <span style={{ cursor: isLast ? "default" : "pointer", color: isLast ? "var(--text-heading)" : "var(--text)", fontWeight: isLast ? 600 : 400 }} onClick={() => !isLast && navigateTo(path)}>{part}</span>
                </span>
              );
            })
          ) : (
            <>
              {fileCrumbs.map((part, idx) => {
                const path = fileCrumbs.slice(0, idx + 1).join("/");
                return (
                  <span key={path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text-muted)" }}>/</span>
                    <span style={{ cursor: "pointer", color: "var(--text)" }} onClick={() => navigateTo(path)}>{part}</span>
                  </span>
                );
              })}
              <span style={{ color: "var(--text-muted)" }}>/</span>
              <span style={{ color: "var(--text-heading)", fontWeight: 600 }}>{fileName}</span>
            </>
          )}
        </div>

        {!selectedFile ? (
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="outline" onClick={() => { setCreationName(""); setCreationModal({ kind: "directory" }); }} style={{ padding: "8px 14px" }}>{t.files.createDirectory}</Btn>
            <Btn variant="primary" onClick={() => void withFeedback(async () => { await api.uploadServerFiles(serverUuid, currentDir); await loadDir(currentDir); })} style={{ padding: "8px 14px", background: "#3b82f6", boxShadow: "0 2px 0 #2563eb", color: "#fff" }}>{t.files.upload}</Btn>
            <Btn variant="primary" onClick={() => { setCreationName(""); setCreationModal({ kind: "file" }); }} style={{ padding: "8px 14px", background: "#3b82f6", boxShadow: "0 2px 0 #2563eb", color: "#fff" }}>{t.files.newFile}</Btn>
          </div>
        ) : (
          <Btn variant="outline" onClick={handleGoBack} style={{ padding: "6px 12px", fontSize: 12 }}>{t.files.back}</Btn>
        )}
      </div>

      {/* Content area */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void withFeedback(async () => { await api.uploadServerFiles(serverUuid, currentDir); await loadDir(currentDir); }); }}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}
      >
        {!selectedFile ? (
          <div style={{ flex: 1, overflow: "auto" }}>
            {loadingDir ? (
              <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>{t.loading}</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                <tbody>
                  {currentDir !== "." && (
                    <tr onClick={() => navigateTo(parentDir(currentDir))} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-subtle)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "14px 16px", width: 40, color: "var(--text-muted)" }}><input type="checkbox" disabled style={{ width: 16, height: 16 }} /></td>
                      <td style={{ padding: "14px 0", color: "var(--text-muted)" }}>←</td>
                      <td style={{ padding: "14px 16px", color: "var(--text-soft)" }}>{t.files.back}</td>
                      <td colSpan={3} />
                    </tr>
                  )}
                  {items.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>{t.files.emptyFolder}</td></tr>
                  )}
                  {items.map((item) => (
                    <tr
                      key={item.path}
                      onClick={() => { if (item.kind === "directory") navigateTo(item.path); else setSelectedFile(item.path); }}
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-subtle)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td onClick={(e) => e.stopPropagation()} style={{ padding: "14px 16px", width: 40 }}><input type="checkbox" style={{ width: 16, height: 16, accentColor: "#3b82f6" }} /></td>
                      <td style={{ padding: "14px 0", width: 30, color: "var(--text-soft)" }}>{item.kind === "directory" ? <Folder size={16} /> : <FileText size={16} />}</td>
                      <td style={{ padding: "14px 16px", color: "var(--text-heading)", fontWeight: 500 }}>{item.name}</td>
                      <td style={{ padding: "14px 16px", color: "var(--text-muted)", width: 120 }}>{item.kind === "file" ? `${Math.max(1, Math.round(item.size / 1024))} ${t.files.sizeUnit}` : ""}</td>
                      <td style={{ padding: "14px 16px", color: "var(--text-muted)", width: 200 }}>
                        {(() => { try { return new Date(item.modifiedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }); } catch { return "•"; } })()}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ padding: "14px 16px", width: 120, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => { setCreationName(item.name); setCreationModal({ kind: "rename", target: item }); }} style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--text-muted)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-heading)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")} title={t.files.rename}><Pencil size={14} /></button>
                          <button onClick={() => void handleDelete(item)} style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--text-muted)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")} title={t.files.delete}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div ref={editorAreaRef} style={{ flex: 1, overflow: "auto", position: "relative", background: "var(--bg-editor)" }}>
              {searchOpen && (
                <div style={{
                  position: "sticky", top: 0, right: 0, zIndex: 10, display: "flex", justifyContent: "flex-end",
                  padding: "8px 12px", background: "var(--bg-card)", borderBottom: "1px solid var(--border)",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, background: "var(--bg-input)",
                    border: "1px solid var(--border-hover)", borderRadius: 6, padding: "4px 8px",
                  }}>
                    <input
                      ref={searchRef}
                      value={searchQuery}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearchQuery(e.target.value); setMatchIdx(0); }}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? searchPrev() : searchNext(); }
                        if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
                      }}
                      placeholder={t.files.searchPlaceholder}
                      style={{
                        background: "transparent", border: "none", outline: "none", color: "var(--text)",
                        fontFamily: "JetBrains Mono, monospace", fontSize: 12, width: 180, padding: "4px 0",
                      }}
                    />
                    <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", minWidth: 36, textAlign: "center" }}>
                      {searchQuery ? `${searchMatches.length > 0 ? (matchIdx % searchMatches.length) + 1 : 0}/${searchMatches.length}` : ""}
                    </span>
                    <button onClick={searchPrev} style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--text-muted)", display: "flex" }} title={t.files.searchPrevious}><ChevronUp size={14} /></button>
                    <button onClick={searchNext} style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--text-muted)", display: "flex" }} title={t.files.searchNext}><ChevronDown size={14} /></button>
                    <button onClick={closeSearch} style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--text-muted)", display: "flex" }} title={t.close}><X size={14} /></button>
                  </div>
                </div>
              )}
              {loadingFile ? (
                <div style={{ padding: 20, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{t.files.loadingFile}</div>
              ) : (
                <div style={{ padding: "12px 16px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", minHeight: "100%" }}>
                  <Editor value={content} onValueChange={(code) => { setContent(code); setDirty(true); }} highlight={(code) => highlightCode(code, getLanguage(fileName ?? null), searchOpen ? searchQuery : undefined)} padding={0} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, minHeight: "100%", outline: "none" }} textareaClassName="editor-textarea" />
                </div>
              )}
            </div>
            {fileError && <div style={{ background: "rgba(231,76,60,0.15)", borderTop: "1px solid rgba(231,76,60,0.3)", color: "#ff8f87", padding: "8px 16px", fontSize: 12 }}>{fileError}</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "12px 16px", background: "var(--bg-card)", borderTop: "1px solid var(--border)" }}>
              <Btn variant="primary" disabled={!dirty || saving || loadingFile} onClick={() => void handleSave()} style={{ background: "#3b82f6", boxShadow: "0 2px 0 #2563eb", color: "#fff", opacity: (!dirty || saving) ? 0.6 : 1 }}>
                {saving ? t.files.savingContent : t.files.saveContent}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
