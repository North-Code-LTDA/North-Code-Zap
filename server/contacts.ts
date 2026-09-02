import fs from 'fs';
import path from 'path';
import type { KnownContact } from '../src/types';

export class ContactsService {
  public flushPendingSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
      this.saveContacts();
    }
  }

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
                const isLid = normalizedJid.includes('@lid');
                this.contactsMap.set(normalizedJid, {
                  jid: normalizedJid,
                  number: isLid ? null : normalizedJid.split('@')[0].split(':')[0],
                  name: item.name || null,
                  source: item.source,
                  lastSeenAt: item.lastSeenAt || null,
                  lid: item.lid || null,
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

    if (clean.includes('@lid')) {
      const num = clean.split('@')[0];
      return `${num}@lid`;
    }

    // If pure digits without @
    if (!clean.includes('@')) {
      const digitsOnly = clean.replace(/\D/g, '');
      if (digitsOnly.length >= 10) {
        return `${digitsOnly}@s.whatsapp.net`;
      }
    }

    return null;
  }

  public upsertContact(contact: {
    jid: string;
    number?: string | null;
    name?: string | null;
    source: 'message' | 'contact' | 'chat';
    lastSeenAt?: string | null;
    lid?: string | null;
  }): KnownContact | null {
    const normalizedJid = this.normalizeJid(contact.jid);
    if (!normalizedJid) return null;

    const existing = this.contactsMap.get(normalizedJid);
    const isLid = normalizedJid.includes('@lid');

    let rawNumber = null;
    if (isLid) {
      rawNumber = null;
    } else if (normalizedJid.includes('@s.whatsapp.net')) {
      rawNumber = normalizedJid.split('@')[0].split(':')[0];
    }

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
      lid: contact.lid || existing?.lid || null,
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
    lid?: string | null;
  }>): number {
    let count = 0;
    for (const c of contacts) {
      if (this.upsertContact(c)) {
        count++;
      }
    }
    return count;
  }

  private getLatestTimestamp(...dates: (string | null | undefined)[]): string | null {
    let latest: Date | null = null;
    let latestStr: string | null = null;

    for (const d of dates) {
      if (d) {
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) {
          if (!latest || parsed > latest) {
            latest = parsed;
            latestStr = d;
          }
        }
      }
    }
    return latestStr;
  }

  private getBestName(...names: (string | null | undefined)[]): string | null {
    for (const n of names) {
      if (n && n.trim().length > 0 && !n.includes('@') && !/^\+?\d+$/.test(n)) {
        return n;
      }
    }
    return null;
  }

  public reconcileLidMapping(lidJid: string, pnJid: string, metadata?: { name?: string | null; lastSeenAt?: string | null; source?: 'message' | 'chat' | 'contact' }): KnownContact | null {
    if (!lidJid.includes('@lid')) return null;
    if (!pnJid.includes('@s.whatsapp.net')) return null;
    
    const normalizedLid = this.normalizeJid(lidJid);
    const normalizedPn = this.normalizeJid(pnJid);
    if (!normalizedLid || !normalizedPn) return null;
        
    // Check if a false JID was created via the legacy bug
    const lidDigits = normalizedLid.split('@')[0].split(':')[0];
    const legacyFakePn = `${lidDigits}@s.whatsapp.net`;
    const existingLegacy = this.contactsMap.get(legacyFakePn);
    const existingPn = this.contactsMap.get(normalizedPn);
    const existingLid = this.contactsMap.get(normalizedLid);

    // Find any contact whose .lid property matches normalizedLid
    const existingAliases = Array.from(this.contactsMap.values()).filter(c => {
      const normalizedAliasLid = c.lid ? this.normalizeJid(c.lid) : null;
      return normalizedAliasLid === normalizedLid && c.jid !== normalizedPn;
    });

    const sortedAliases = [...existingAliases].sort((a, b) => a.jid.localeCompare(b.jid));

    // Merge names, picking the best
    const bestName = this.getBestName(
      metadata?.name,
      existingPn?.name,
      existingLegacy?.name,
      existingLid?.name,
      ...sortedAliases.map(a => a.name)
    );
        
    // Pick the most recent timestamp
    const bestLastSeenAt = this.getLatestTimestamp(
      metadata?.lastSeenAt,
      existingPn?.lastSeenAt,
      existingLegacy?.lastSeenAt,
      existingLid?.lastSeenAt,
      ...sortedAliases.map(a => a.lastSeenAt)
    );
        
    // Merge source
    const sources = [
      existingPn?.source,
      existingLegacy?.source,
      existingLid?.source,
      ...sortedAliases.map(a => a.source),
      metadata?.source
    ].filter(Boolean) as string[];
    
    let bestSource: 'contact' | 'chat' | 'message' = 'message';
    if (sources.includes('contact')) bestSource = 'contact';
    else if (sources.includes('chat')) bestSource = 'chat';

    // Remove the bad legacy records and the original LID record
    const keysToDelete = new Set<string>();
    if (existingLid) {
      keysToDelete.add(existingLid.jid);
    }
    if (existingLegacy && existingLegacy.jid !== normalizedPn) {
      keysToDelete.add(existingLegacy.jid);
    }
    for (const alias of existingAliases) {
      if (alias.jid !== normalizedPn) {
        keysToDelete.add(alias.jid);
      }
    }
    keysToDelete.delete(normalizedPn);
    
    for (const jid of keysToDelete) {
      this.contactsMap.delete(jid);
    }
    
    // Upsert to the correct PN
    const updatedPn = this.upsertContact({
      jid: normalizedPn,
      number: normalizedPn.split('@')[0].split(':')[0],
      name: bestName,
      source: bestSource,
      lastSeenAt: bestLastSeenAt,
      lid: normalizedLid
    });

    return updatedPn;
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
