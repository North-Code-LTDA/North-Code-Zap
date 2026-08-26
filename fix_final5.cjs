const fs = require('fs');

function fix(file) {
  let c = fs.readFileSync(file, 'utf8');

  // 1. imports
  if (!c.includes("import { useTemplates }")) {
    c = c.replace("import React", "import { useTemplates } from '../hooks/useTemplates';\nimport React");
    if (!c.includes("useTemplates")) c = c.replace("import { useState", "import { useTemplates } from '../hooks/useTemplates';\nimport { useState");
  }

  // 2. hook
  if (!c.includes("const { templates } = useTemplates();")) {
    if (file.includes("Campanhas")) {
      c = c.replace("const { campaigns, loading,", "const { templates } = useTemplates();\n  const { campaigns, loading,");
    } else {
      c = c.replace("const { schedules, loading,", "const { templates } = useTemplates();\n  const { schedules, loading,");
    }
  }

  // 3. handleApplyTemplate
  if (!c.includes("const handleApplyTemplate")) {
    if (file.includes("Campanhas")) {
      c = c.replace("const [message, setMessage] = useState('');", "const [message, setMessage] = useState('');\n  const [templateToConfirm, setTemplateToConfirm] = useState<string | null>(null);\n  const handleApplyTemplate = (e: any) => {\n    const templateId = e.target.value;\n    e.target.value = '';\n    if (!templateId) return;\n    const t = templates?.find((x: any) => x.id === templateId);\n    if (!t) return;\n    if (message.trim()) {\n      setTemplateToConfirm(t.id);\n      return;\n    }\n    setMessage(t.message);\n    setFallbackName(t.fallbackName);\n  };");
    } else {
      c = c.replace("const [formMessage, setFormMessage] = useState('');", "const [formMessage, setFormMessage] = useState('');\n  const [templateToConfirm, setTemplateToConfirm] = useState<string | null>(null);\n  const handleApplyTemplate = (e: any) => {\n    const templateId = e.target.value;\n    e.target.value = '';\n    if (!templateId) return;\n    const t = templates?.find((x: any) => x.id === templateId);\n    if (!t) return;\n    if (formMessage.trim()) {\n      setTemplateToConfirm(t.id);\n      return;\n    }\n    setFormMessage(t.message);\n    setFormFallbackName(t.fallbackName);\n  };");
    }
  }

  // 4. select UI and Confirm UI
  if (!c.includes("<select onChange={handleApplyTemplate}")) {
    if (file.includes("Campanhas")) {
      c = c.replace(
        "Mensagem & Personalização {formMedia && '(Opcional)'}\n                  </label>\n                  <div className=\"flex items-center gap-2\">",
        `Mensagem & Personalização {formMedia && '(Opcional)'}
                  </label>
                  <div className="flex items-center gap-2">
                    {templates && templates.length > 0 && (
                      <select onChange={handleApplyTemplate} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-300 text-[11px] font-medium focus:outline-none transition-colors max-w-[120px] truncate" defaultValue="">
                        <option value="" disabled>Usar Template</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}`
      );
      c = c.replace(
        "</textarea>\n                </div>",
        `</textarea>
                  {templateToConfirm && (
                    <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
                      <span className="text-amber-400 text-[11px]">Substituir mensagem atual pelo template?</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setTemplateToConfirm(null)} className="px-3 py-1 text-[11px] text-neutral-400 hover:text-white transition-colors">Cancelar</button>
                        <button type="button" onClick={() => { const t = templates?.find((x: any) => x.id === templateToConfirm); if (t) { setMessage(t.message); setFallbackName(t.fallbackName); } setTemplateToConfirm(null); }} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-[11px] rounded transition-colors">Confirmar</button>
                      </div>
                    </div>
                  )}
                </div>`
      );
    } else {
      c = c.replace(
        "3. Mensagem & Personalização {formMedia && '(Opcional se houver imagem)'}\n                  </label>\n                  <div className=\"flex items-center gap-2\">",
        `3. Mensagem & Personalização {formMedia && '(Opcional se houver imagem)'}
                  </label>
                  <div className="flex items-center gap-2">
                    {templates && templates.length > 0 && (
                      <select onChange={handleApplyTemplate} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-300 text-[11px] font-medium focus:outline-none transition-colors max-w-[120px] truncate" defaultValue="">
                        <option value="" disabled>Usar Template</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}`
      );
      c = c.replace(
        "</textarea>\n                </div>",
        `</textarea>
                  {templateToConfirm && (
                    <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
                      <span className="text-amber-400 text-[11px]">Substituir mensagem atual pelo template?</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setTemplateToConfirm(null)} className="px-3 py-1 text-[11px] text-neutral-400 hover:text-white transition-colors">Cancelar</button>
                        <button type="button" onClick={() => { const t = templates?.find((x: any) => x.id === templateToConfirm); if (t) { setFormMessage(t.message); setFormFallbackName(t.fallbackName); } setTemplateToConfirm(null); }} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-[11px] rounded transition-colors">Confirmar</button>
                      </div>
                    </div>
                  )}
                </div>`
      );
    }
  }

  fs.writeFileSync(file, c);
}

fix('src/components/CampanhasView.tsx');
fix('src/components/AgendamentosView.tsx');

