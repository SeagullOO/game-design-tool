/**
 * TemplateManager.tsx — 模版管理面板
 *
 * 与 Settings 使用相同的父逻辑：
 * - 由 AppContent 根级别条件渲染（templateManagerOpen && ...）
 * - 使用 PanelLayout 母版提供全屏遮罩 + 毛玻璃效果
 * - 不在 Routes 内部渲染，不通过 createPortal 脱离 React 树
 */

import { useState, useEffect } from "react";
import { storageLoadTemplates, storageDeleteTemplate } from "../storage";
import type { Template } from "../types";
import { t, getLang } from "../i18n";
import PanelLayout from "./PanelLayout";
import ConfirmModal from "./ConfirmModal";

function TemplateManager({ onClose }: { onClose?: () => void }) {
  const close = onClose || (() => {});
  const lang = getLang();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<Template | null>(null);

  const load = () => {
    setLoading(true);
    storageLoadTemplates().then((list) => { setTemplates(list); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const handleDelete = (tpl: Template) => {
    setDeleteConfirm(tpl);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await storageDeleteTemplate(deleteConfirm.id!);
    setTemplates((prev) => prev.filter((t) => t.id !== deleteConfirm.id));
    setDeleteConfirm(null);
  };

  return (
    <PanelLayout onClose={close} width="600px" height="500px">
      <div>
        <h1 className="stg-section-title">{t("templateManagement", lang)}</h1>
        <p className="stg-section-desc">{t("manageTemplatesDesc", lang)}</p>
      </div>

      {loading ? (
        <p className="text-center py-12 text-sm" style={{ color: "var(--text-tertiary)" }}>{t("loading", lang)}</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("noTemplates", lang)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{t("noTemplatesHint", lang)}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((tpl) => (
            <div key={tpl.id}
              className="stg-card"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tpl.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {tpl.files.length}{t("filesUnit", lang)} · {" "}
                  {new Date(tpl.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <button
                onClick={() => handleDelete(tpl)}
                title={t("delete", lang)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, border: "none", borderRadius: 4,
                  background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
                  flexShrink: 0, marginLeft: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--danger)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete Template Confirm */}
      <ConfirmModal
        open={deleteConfirm !== null}
        message={t("confirmDeleteTemplate", lang)}
        confirmLabel={t("delete", lang)}
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteConfirm(null)}
      />
    </PanelLayout>
  );
}

export default TemplateManager;
