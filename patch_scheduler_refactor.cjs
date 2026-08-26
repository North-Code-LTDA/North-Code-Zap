const fs = require('fs');
let content = fs.readFileSync('server/scheduler.ts', 'utf8');

// I need to refactor it so that the single target logic is an extracted helper.
// The code inside executeSchedule uses:
/*
      // Personalize message with template renderer
      const renderedMessage = renderMessageTemplate(...)
      ...
*/

// It's probably easier to just replace the whole class using string replacement
// Let's first read it completely to know where things are
