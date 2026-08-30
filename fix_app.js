const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.replace(/currentTab !== 'fluxos' && \(/g, "currentTab !== 'fluxos' &&\n            currentTab !== 'configuracoes' && (");
fs.writeFileSync('src/App.tsx', code);
