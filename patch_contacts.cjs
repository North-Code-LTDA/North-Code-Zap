const fs = require('fs');
let content = fs.readFileSync('server/contacts.ts', 'utf-8');

const insertion = `
  public flushPendingSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
      this.saveContacts();
    }
  }
`;

content = content.replace('export class ContactsService {', 'export class ContactsService {' + insertion);
fs.writeFileSync('server/contacts.ts', content);
