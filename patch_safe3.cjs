const fs = require('fs');

let c = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');
if (!c.includes("import { useTemplates }")) {
  c = c.replace("import React", "import { useTemplates } from '../hooks/useTemplates';\nimport React");
  if (!c.includes("useTemplates")) {
    c = c.replace("import { useState", "import { useTemplates } from '../hooks/useTemplates';\nimport { useState");
  }
  fs.writeFileSync('src/components/AgendamentosView.tsx', c);
}
