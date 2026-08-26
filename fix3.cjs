const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');
if (!app.includes("FileText")) {
  app = app.replace(
    "import { LogOut } from 'lucide-react';",
    "import { LogOut, FileText } from 'lucide-react';"
  );
  fs.writeFileSync('src/App.tsx', app);
}

