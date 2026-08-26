const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');
if (!app.includes("import { FileText")) {
  app = app.replace(
    "import { LogOut } from 'lucide-react';",
    "import { LogOut } from 'lucide-react';\nimport { FileText } from 'lucide-react';"
  );
  fs.writeFileSync('src/App.tsx', app);
}

let camp = fs.readFileSync('src/components/CampanhasView.tsx', 'utf8');
if (!camp.includes("const { templates } = useTemplates();")) {
  camp = camp.replace(
    "const { campaigns, loading, error, createCampaign, updateCampaign, deleteCampaign, updateCampaignStatus } = useCampaigns(selectedInstanceId);",
    "const { campaigns, loading, error, createCampaign, updateCampaign, deleteCampaign, updateCampaignStatus } = useCampaigns(selectedInstanceId);\n  const { templates } = useTemplates();"
  );
  fs.writeFileSync('src/components/CampanhasView.tsx', camp);
}

let agend = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');
if (!agend.includes("const { templates } = useTemplates();")) {
  agend = agend.replace(
    "const { schedules, loading, error, createSchedule, updateSchedule, deleteSchedule, refresh } = useScheduler();",
    "const { schedules, loading, error, createSchedule, updateSchedule, deleteSchedule, refresh } = useScheduler();\n  const { templates } = useTemplates();"
  );
  fs.writeFileSync('src/components/AgendamentosView.tsx', agend);
}
