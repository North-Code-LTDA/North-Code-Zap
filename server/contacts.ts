import fs from 'fs';
import path from 'path';
import type { KnownContact } from '../src/types';

export class ContactsService {
  private contactsMap: Map<string, KnownContact> = new Map();
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private contactsFile: string;
  private contactsTmpFile: string;
  private recipientsDir: string;

  constructor(contactsFile: string) {
    this.contactsFile = contactsFile;
    this.contactsTmpFile = contactsFile + '.tmp';
    this.recipientsDir = path.dirname(contactsFile);
    this.ensureDirectory();
    this.loadContacts();
  }

  private ensureDirectory() {
    try {
      if (!fs.existsSync(this.recipientsDir)) {
        fs.mkdirSync(this.recipientsDir, { recursive: true });
      }
    } catch (err: any) {
      console.error('[Contacts] error creating recipients directory:', err?.message || err);
    }
  }

  private loadContacts() {
    try {
      if (fs.existsSync(this.contactsFile)) {
        const raw = fs.readFileSync(this.contactsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const validSources = ['message', 'contact', 'chat'];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.jid === 'string') {
              if (!validSources.includes(item.source)) {
                continue;
              }
              const normalizedJid = this.normalizeJid(item.jid);
              if (normalizedJid) {
                this.contactsMap.set(normalizedJid, {
                  jid: normalizedJid,
                  number: item.number || normalizedJid.split('@')[0].split(':')[0],
                  name: item.name || null,
                  source: item.source,
                  lastSeenAt: item.lastSeenAt || null,
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
      fs.writeFileSync(this.contactsTmpFile, data, 'utf-8');
      fs.renameSync(this.contactsTmpFile, this.contactsFile);
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
    source: 'message' | 'contact' | 'chat';
    lastSeenAt?: string | null;
  }): KnownContact | null {
    const normalizedJid = this.normalizeJid(contact.jid);
    if (!normalizedJid) return null;

    const rawNumber =
      contact.number || normalizedJid.split('@')[0].split(':')[0];
    const existing = this.contactsMap.get(normalizedJid);

    // Resolve best name: explicit name -> existing name -> number
    let chosenName = contact.name || null;
    if (!chosenName && existing?.name) {
      chosenName = existing.name;
    }
    if (chosenName && (chosenName.startsWith('+') || /^\d+$/.test(chosenName))) {
      // If the name is just a phone number and we had an older non-phone name, preserve the old one
      if (existing?.name && !/^\+?\d+$/.test(existing.name)) {
        chosenName = existing.name;
      }
    }

    let resolvedSource = contact.source;
    if (existing) {
      if (existing.source === 'contact') {
        resolvedSource = 'contact';
      } else if (existing.source === 'chat' && contact.source === 'message') {
        resolvedSource = 'chat';
      }
    }

    const updated: KnownContact = {
      jid: normalizedJid,
      number: rawNumber,
      name: chosenName,
      source: resolvedSource,
      lastSeenAt: contact.lastSeenAt ?? existing?.lastSeenAt ?? null,
    };

    this.contactsMap.set(normalizedJid, updated);
    this.scheduleSave();

    return updated;
  }

  public upsertBatch(contacts: Array<{
    jid: string;
    number?: string | null;
    name?: string | null;
    source: 'message' | 'contact' | 'chat';
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
