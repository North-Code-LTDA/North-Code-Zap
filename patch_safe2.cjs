const fs = require('fs');

function applyToCampanhas() {
  let c = fs.readFileSync('src/components/CampanhasView.tsx', 'utf8');
  if (!c.includes("const { templates } = useTemplates();")) {
    c = c.replace("export function CampanhasView({ selectedInstanceId }: CampanhasViewProps) {", 
      "export function CampanhasView({ selectedInstanceId }: CampanhasViewProps) {\n  const { templates } = useTemplates();"
    );
    fs.writeFileSync('src/components/CampanhasView.tsx', c);
  }
}

function applyToAgendamentos() {
  let c = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');
  if (!c.includes("const { templates } = useTemplates();")) {
    c = c.replace("export function AgendamentosView({ whatsappState }: AgendamentosViewProps) {", 
      "export function AgendamentosView({ whatsappState }: AgendamentosViewProps) {\n  const { templates } = useTemplates();"
    );
    fs.writeFileSync('src/components/AgendamentosView.tsx', c);
  }
}

applyToCampanhas();
applyToAgendamentos();

