import { useState, useEffect } from "react";
import { storageLoadTemplates } from "../storage";
import type { Template } from "../types";
import { t, getLang } from "../i18n";
import PanelLayout from "./PanelLayout";

interface TemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: Template) => void;
}

function TemplateModal({ open, onClose, onSelect }: TemplateModalProps) {
  const lang = getLang();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      setLoading(true);
      storageLoadTemplates().then((list) => { setTemplates(list); setLoading(false); });
    }
  }, [open]);

  if (!open) return null;

  return (
    <PanelLayout onClose={onClose} width="600px" height="500px">
      <div>
        <h1 className="stg-section-title">{t("createFromTemplate", lang)}</h1>
        <p className="stg-section-desc">{t("selectTemplateHint", lang)}</p>
      </div>

      {loading ? (
        <p className="text-center py-12 text-sm" style={{ color: "var(--text-tertiary)" }}>{t("loading", lang)}</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("noTemplatesModal", lang)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{t("noTemplatesModalHint", lang)}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl)}
              className="stg-card"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", border: "1px solid var(--border-subtle)",
                background: "transparent", cursor: "pointer", width: "100%", textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-subtle)"; e.currentTarget.style.background = "transparent"; }}
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
            </button>
          ))}
        </div>
      )}
    </PanelLayout>
  );
}

export default TemplateModal;
