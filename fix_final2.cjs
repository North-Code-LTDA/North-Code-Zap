const fs = require('fs');

let cv = fs.readFileSync('src/components/CampanhasView.tsx', 'utf8');
if (!cv.includes("const handleApplyTemplate")) {
  cv = cv.replace(
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
  fs.writeFileSync('src/components/CampanhasView.tsx', cv);
}

let av = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');
if (!av.includes("import { useTemplates }")) {
  av = av.replace(
    "import { useScheduler } from '../hooks/useScheduler';",
    "import { useScheduler } from '../hooks/useScheduler';\nimport { useTemplates } from '../hooks/useTemplates';"
  );
}

if (!av.includes("const handleApplyTemplate")) {
  av = av.replace(
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
}
fs.writeFileSync('src/components/AgendamentosView.tsx', av);

