const fs = require('fs');

function removeDupeSelects(file) {
  let content = fs.readFileSync(file, 'utf8');
  
  const selectBlock = `{templates && templates.length > 0 && (
                        <select
                          onChange={handleApplyTemplate}`;
                          
  const count = content.split(selectBlock).length - 1;
  
  if (count > 1) {
    const firstIdx = content.indexOf(selectBlock);
    const endFirstIdx = content.indexOf(')}', firstIdx) + 2;
    
    // Now replace ALL subsequent occurrences of the selectBlock
    const startRest = content.substring(endFirstIdx);
    
    // Using a regex to remove the rest
    // A bit tricky, let's just use string replace loop
    let newRest = startRest;
    while (newRest.includes(selectBlock)) {
      const idx = newRest.indexOf(selectBlock);
      const endIdx = newRest.indexOf(')}', idx) + 2;
      newRest = newRest.substring(0, idx) + newRest.substring(endIdx);
    }
    
    content = content.substring(0, endFirstIdx) + newRest;
    fs.writeFileSync(file, content);
  }
}

removeDupeSelects('src/components/AgendamentosView.tsx');
removeDupeSelects('src/components/CampanhasView.tsx');

