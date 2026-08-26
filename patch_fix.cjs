const fs = require('fs');

let av = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');

if (!av.includes('const handleApplyTemplate2')) {
  av = av.replace('const [formFallbackName, setFormFallbackName] = useState(\'amigo(a)\');',
  `const [formFallbackName, setFormFallbackName] = useState('amigo(a)');
  
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
  const handleApplyTemplate2 = true;
  `
  );
  fs.writeFileSync('src/components/AgendamentosView.tsx', av);
}
