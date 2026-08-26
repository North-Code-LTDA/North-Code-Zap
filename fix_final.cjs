const fs = require('fs');

let cv = fs.readFileSync('src/components/CampanhasView.tsx', 'utf8');
if (!cv.includes("const { templates } = useTemplates();")) {
  cv = cv.replace(
    "export function CampanhasView({ selectedInstanceId }: CampanhasViewProps) {",
    "export function CampanhasView({ selectedInstanceId }: CampanhasViewProps) {\n  const { templates } = useTemplates();"
  );
  fs.writeFileSync('src/components/CampanhasView.tsx', cv);
}

let av = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');
if (!av.includes("const { templates } = useTemplates();")) {
  av = av.replace(
    "export function AgendamentosView({ whatsappState }: AgendamentosViewProps) {",
    "export function AgendamentosView({ whatsappState }: AgendamentosViewProps) {\n  const { templates } = useTemplates();"
  );
  fs.writeFileSync('src/components/AgendamentosView.tsx', av);
}
