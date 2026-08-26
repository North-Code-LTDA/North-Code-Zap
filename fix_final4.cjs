const fs = require('fs');
let av = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');

if (!av.includes("const handleApplyTemplate = ")) {
   const insertPos = av.indexOf("const handleFormSubmit = async");
   if (insertPos !== -1) {
      av = av.substring(0, insertPos) + `
  const [templateToConfirm, setTemplateToConfirm] = useState<string | null>(null);

  const handleApplyTemplate = (e: any) => {
    const templateId = e.target.value;
    e.target.value = '';
    if (!templateId) return;
    const t = templates?.find((x: any) => x.id === templateId);
    if (!t) return;
    
    if (formMessage.trim()) {
      setTemplateToConfirm(t.id);
      return;
    }
    setFormMessage(t.message);
    setFormFallbackName(t.fallbackName);
  };\n\n` + av.substring(insertPos);
      fs.writeFileSync('src/components/AgendamentosView.tsx', av);
   }
}
