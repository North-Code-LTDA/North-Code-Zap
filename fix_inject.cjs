const fs = require('fs');

function inject(file, marker, codeToInject) {
   const content = fs.readFileSync(file, 'utf8');
   if (!content.includes('const handleApplyTemplate')) {
      const idx = content.indexOf(marker);
      if (idx !== -1) {
         const insertPos = content.indexOf('};', idx) + 2;
         const newContent = content.substring(0, insertPos) + '\n' + codeToInject + '\n' + content.substring(insertPos);
         fs.writeFileSync(file, newContent);
      }
   }
}

inject('src/components/CampanhasView.tsx', 'const resetForm = () => {', `
  const handleApplyTemplate = (e: any) => {
    const templateId = e.target.value;
    e.target.value = '';
    if (!templateId) return;
    const t = templates?.find((x: any) => x.id === templateId);
    if (!t) return;
    
    if (message.trim()) {
      setTemplateToConfirm(t.id);
      return;
    }
    setMessage(t.message);
    setFallbackName(t.fallbackName);
  };
`);

inject('src/components/AgendamentosView.tsx', 'const resetForm = () => {', `
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
  };
`);
