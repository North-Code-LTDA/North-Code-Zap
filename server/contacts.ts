import fs from 'fs';
import path from 'path';
import type { KnownContact } from '../src/types';

const RECIPIENTS_DIR =
  process.env.RECIPIENTS_DATA_DIR || path.join(process.cwd(), 'data', 'recipients');
const CONTACTS_FILE = path.join(RECIPIENTS_DIR, 'contacts.json');
const CONTACTS_TMP_FILE = path.join(RECIPIENTS_DIR, 'contacts.json.tmp');

export class ContactsService {
  private contactsMap: Map<string, KnownContact> = new Map();
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDirectory();
    this.loadContacts();
  }

  private ensureDirectory() {
    try {
      if (!fs.existsSync(RECIPIENTS_DIR)) {
        fs.mkdirSync(RECIPIENTS_DIR, { recursive: true });
      }
    } catch (err: any) {
      console.error('[Contacts] error creating recipients directory:', err?.message || err);
    }
  }

  private loadContacts() {
    try {
      if (fs.existsSync(CONTACTS_FILE)) {
        const raw = fs.readFileSync(CONTACTS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.jid) {
              const normalizedJid = this.normalizeJid(item.jid);
              if (normalizedJid) {
                this.contactsMap.set(normalizedJid, {
                  ...item,
                  jid: normalizedJid,
                });
              }
            }
          }
          console.log(`[Contacts] loaded known contacts=${this.contactsMap.size}`);
        }
      }
    } catch (err: any) {
      console.error('[Contacts] error loading contacts file:', err?.message || err);
    }
  }

  private scheduleSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveContacts();
    }, 1500);
  }

  private saveContacts() {
    this.ensureDirectory();
    try {
      const list = Array.from(this.contactsMap.values());
      const data = JSON.stringify(list, null, 2);
      fs.writeFileSync(CONTACTS_TMP_FILE, data, 'utf-8');
      fs.renameSync(CONTACTS_TMP_FILE, CONTACTS_FILE);
    } catch (err: any) {
      console.error('[Contacts] error saving contacts file:', err?.message || err);
    }
  }

  public normalizeJid(rawJid: string): string | null {
    if (!rawJid || typeof rawJid !== 'string') return null;
    const clean = rawJid.trim().toLowerCase();

    // Ignore groups, broadcasts, status
    if (
      clean.endsWith('@g.us') ||
      clean.includes('@broadcast') ||
      clean.startsWith('status@') ||
      clean.includes('newsletter')
    ) {
      return null;
    }

    if (clean.includes('@s.whatsapp.net')) {
      const num = clean.split('@')[0].split(':')[0];
      return `${num}@s.whatsapp.net`;
    }

    // If pure digits without @
    const digitsOnly = clean.replace(/\D/g, '');
    if (digitsOnly.length >= 10) {
      return `${digitsOnly}@s.whatsapp.net`;
    }

    return null;
  }

  public upsertContact(contact: {
    jid: string;
    number?: string | null;
    name?: string | null;
    notifyName?: string | null;
    source: 'message' | 'history' | 'contact' | 'chat' | 'import';
    lastSeenAt?: string | null;
  }): KnownContact | null {
    const normalizedJid = this.normalizeJid(contact.jid);
    if (!normalizedJid) return null;

    const rawNumber =
      contact.number || normalizedJid.split('@')[0].split(':')[0];
    const existing = this.contactsMap.get(normalizedJid);

    // Resolve best name: explicit name -> pushName/notifyName -> existing name -> number
    let chosenName = contact.name || contact.notifyName || null;
    if (!chosenName && existing?.name) {
      chosenName = existing.name;
    }
    if (chosenName && (chosenName.startsWith('+') || /^\d+$/.test(chosenName))) {
      // If the name is just a phone number and we had an older non-phone name, preserve the old one
      if (existing?.name && !/^\+?\d+$/.test(existing.name)) {
        chosenName = existing.name;
      }
    }

    const updated: KnownContact = {
      jid: normalizedJid,
      number: rawNumber,
      name: chosenName,
      notifyName: contact.notifyName || existing?.notifyName || null,
      source: existing ? existing.source : contact.source,
      lastSeenAt: contact.lastSeenAt || existing?.lastSeenAt || new Date().toISOString(),
    };

    this.contactsMap.set(normalizedJid, updated);
    this.scheduleSave();
    return updated;
  }

  public upsertBatch(contacts: Array<{
    jid: string;
    number?: string | null;
    name?: string | null;
    notifyName?: string | null;
    source: 'message' | 'history' | 'contact' | 'chat' | 'import';
    lastSeenAt?: string | null;
  }>): number {
    let count = 0;
    for (const c of contacts) {
      if (this.upsertContact(c)) {
        count++;
      }
    }
    return count;
  }

  public getContact(jid: string): KnownContact | undefined {
    const normalized = this.normalizeJid(jid);
    if (!normalized) return undefined;
    return this.contactsMap.get(normalized);
  }

  public getAll(): KnownContact[] {
    const list = Array.from(this.contactsMap.values());
    // Sort: contacts with names first (alphabetical), then by lastSeenAt desc
    return list.sort((a, b) => {
      const nameA = (a.name || '').trim();
      const nameB = (b.name || '').trim();
      if (nameA && !nameB) return -1;
      if (!nameA && nameB) return 1;
      if (nameA && nameB) return nameA.localeCompare(nameB);
      return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '');
    });
  }
}

export const contactsService = new ContactsService();
