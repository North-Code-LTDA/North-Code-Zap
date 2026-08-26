const fs = require('fs');
let content = fs.readFileSync('src/components/AgendamentosView.tsx', 'utf8');

// The issue was I removed `)}` which broke the JSX.
// Let's manually replace the broken tags.
