const fs = require('fs');

function injectImport(file, importStr) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes(importStr)) {
    content = content.replace("import React", `${importStr}\nimport React`);
    if (!content.includes(importStr)) {
       content = content.replace("import { useState", `${importStr}\nimport { useState`);
    }
    fs.writeFileSync(file, content);
  }
}

injectImport('src/components/AgendamentosView.tsx', "import { useTemplates } from '../hooks/useTemplates';");
injectImport('src/components/CampanhasView.tsx', "import { useTemplates } from '../hooks/useTemplates';");

function injectHook(file, hookStr) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes(hookStr)) {
     if (file.includes('Agendamentos')) {
        content = content.replace("const { schedules, loading,", `${hookStr}\n  const { schedules, loading,`);
     } else {
        content = content.replace("const { campaigns, loading,", `${hookStr}\n  const { campaigns, loading,`);
     }
     fs.writeFileSync(file, content);
  }
}

injectHook('src/components/AgendamentosView.tsx', "const { templates } = useTemplates();");
injectHook('src/components/CampanhasView.tsx', "const { templates } = useTemplates();");

function addHandlerAgendamentos() {
   let content = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');
   if (!content.includes("const handleApplyTemplate =")) {
      content = content.replace(
         "const handleFormSubmit = async (e: React.FormEvent) => {",
         `
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
  };

  const handleFormSubmit = async (e: React.FormEvent) => {`
      );
      fs.writeFileSync('src/components/AgendamentosView.tsx', content);
   }
}
addHandlerAgendamentos();

function addHandlerCampanhas() {
   let content = fs.readFileSync('src/components/CampanhasView.tsx', 'utf8');
   if (!content.includes("const handleApplyTemplate =")) {
      content = content.replace(
         "const openNewModal = () => {",
         `
  const [templateToConfirm, setTemplateToConfirm] = useState<string | null>(null);
  
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
    
  const openNewModal = () => {`
      );
      fs.writeFileSync('src/components/CampanhasView.tsx', content);
   }
}
addHandlerCampanhas();
