import * as fs from 'fs';
import * as path from 'path';
import { KnownChat } from '../src/types';

export class ChatService {
  private chatsFile: string;
  private chatsTmpFile: string;
  private chatsDir: string;
  private chatsMap = new Map<string, KnownChat>();
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor(chatsFile: string) {
    this.chatsFile = chatsFile;
    this.chatsTmpFile = `${chatsFile}.tmp`;
    this.chatsDir = path.dirname(chatsFile);
    this.ensureDirectory();
    this.loadChats();
  }

  private ensureDirectory() {
    try {
      if (!fs.existsSync(this.chatsDir)) {
        fs.mkdirSync(this.chatsDir, { recursive: true });
      }
    } catch (err: any) {
      console.error('[Chats] error creating directory:', err?.message || err);
    }
  }

  private loadChats() {
    try {
      if (fs.existsSync(this.chatsFile)) {
        const raw = fs.readFileSync(this.chatsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.id === 'string') {
              this.chatsMap.set(item.id, item);
            }
          }
          console.log(`[Chats] loaded known chats=${this.chatsMap.size}`);
        }
      }
    } catch (err: any) {
      console.error('[Chats] error loading chats file:', err?.message || err);
    }
  }

  private scheduleSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveChats();
    }, 1500);
  }

  private saveChats() {
    this.ensureDirectory();
    try {
      const list = Array.from(this.chatsMap.values());
      const data = JSON.stringify(list, null, 2);
      fs.writeFileSync(this.chatsTmpFile, data, 'utf-8');
      fs.renameSync(this.chatsTmpFile, this.chatsFile);
    } catch (err: any) {
      console.error('[Chats] error saving chats file:', err?.message || err);
    }
  }

  public flushPendingSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
      this.saveChats();
    }
  }

  private findPrivateMatches(aliases: Array<string | null | undefined>): KnownChat[] {
    const knownKeys = aliases.filter(Boolean) as string[];
    const matches: KnownChat[] = [];
    for (const [, chat] of this.chatsMap.entries()) {
      if (
        knownKeys.includes(chat.id) ||
        (chat.addressJid && knownKeys.includes(chat.addressJid)) ||
        (chat.phoneJid && knownKeys.includes(chat.phoneJid)) ||
        (chat.lidJid && knownKeys.includes(chat.lidJid))
      ) {
        if (!matches.find(e => e.id === chat.id)) {
          matches.push(chat);
        }
      }
    }
    return matches;
  }


  private toComparableTimestamp(value: string | null | undefined): number {
    if (!value) return Number.NEGATIVE_INFINITY;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
  }

  private isPreferredRecord(candidate: KnownChat, current: KnownChat): boolean {
    const timeCandidate = this.toComparableTimestamp(candidate.updatedAt);
    const timeCurrent = this.toComparableTimestamp(current.updatedAt);

    if (timeCandidate !== timeCurrent) {
      return timeCandidate > timeCurrent;
    }

    const msgCandidate = this.toComparableTimestamp(candidate.lastMessageAt);
    const msgCurrent = this.toComparableTimestamp(current.lastMessageAt);

    if (msgCandidate !== msgCurrent) {
      return msgCandidate > msgCurrent;
    }

    const candidateIsPN = candidate.id.includes('@s.whatsapp.net');
    const currentIsPN = current.id.includes('@s.whatsapp.net');
    if (candidateIsPN && !currentIsPN) return true;
    if (!candidateIsPN && currentIsPN) return false;

    return candidate.id > current.id;
  }

  public upsert(chatData: Partial<KnownChat> & { id: string, addressJid?: string, type?: 'private' | 'group' }): KnownChat {
    const isGroup = chatData.type === 'group' || chatData.id.endsWith('@g.us');
    const type = isGroup ? 'group' : 'private';

    let baseRecord: KnownChat | null = null;
    let existingMatches: KnownChat[] = [];

    if (type === 'private') {
      existingMatches = this.findPrivateMatches([chatData.id, chatData.addressJid, chatData.phoneJid, chatData.lidJid]);
    } else {
      const existing = this.chatsMap.get(chatData.id);
      if (existing) existingMatches.push(existing);
    }

    if (existingMatches.length > 0) {
      // Find deterministic base record for general metadata
      let bestBase = existingMatches[0];
      for (let i = 1; i < existingMatches.length; i++) {
        const candidate = existingMatches[i];
        if (this.isPreferredRecord(candidate, bestBase)) {
          bestBase = candidate;
        }
      }
      baseRecord = bestBase;
    }

    // Canonical ID
    let finalId = chatData.id;
    if (type === 'private') {
      const allPhones = [chatData.phoneJid, ...existingMatches.map(m => m.phoneJid), ...existingMatches.map(m => m.id)];
      const pn = allPhones.find(p => p && p.includes('@s.whatsapp.net'));
      if (pn) {
        finalId = pn;
      }
    }

    // AddressJid
    let finalAddressJid = finalId;
    if (chatData.addressJid !== undefined) {
      finalAddressJid = chatData.addressJid;
    } else if (existingMatches.length > 0) {
      const lidMatches = existingMatches.filter(m => m.addressJid?.includes('@lid'));
      if (lidMatches.length > 0) {
        let bestLid = lidMatches[0];
        for (let i = 1; i < lidMatches.length; i++) {
          if (this.isPreferredRecord(lidMatches[i], bestLid)) {
            bestLid = lidMatches[i];
          }
        }
        finalAddressJid = bestLid.addressJid!;
      } else if (baseRecord?.addressJid) {
         finalAddressJid = baseRecord.addressJid;
      }
    }

    // Time and preview
    let finalLastMessageAt: string | null = null;
    let finalPreview: string | null = null;

    if (existingMatches.length > 0) {
      let bestMsgRecord: KnownChat | null = null;
      for (const m of existingMatches) {
        if (!m.lastMessageAt) continue;
        const msgTime = this.toComparableTimestamp(m.lastMessageAt);
        if (msgTime === Number.NEGATIVE_INFINITY) continue;

        if (!bestMsgRecord) {
          bestMsgRecord = m;
        } else {
          const bestTime = this.toComparableTimestamp(bestMsgRecord.lastMessageAt);
          if (msgTime > bestTime) {
            bestMsgRecord = m;
          } else if (msgTime === bestTime) {
            if (this.isPreferredRecord(m, bestMsgRecord)) {
              bestMsgRecord = m;
            }
          }
        }
      }
      if (bestMsgRecord) {
        finalLastMessageAt = bestMsgRecord.lastMessageAt;
        finalPreview = bestMsgRecord.lastMessagePreview ?? null;
      }
    }

    if (chatData.lastMessageAt) {
      const timeNew = this.toComparableTimestamp(chatData.lastMessageAt);
      if (timeNew !== Number.NEGATIVE_INFINITY) {
        const timeOld = this.toComparableTimestamp(finalLastMessageAt);
        if (timeNew >= timeOld) {
          finalLastMessageAt = chatData.lastMessageAt;
          if (chatData.lastMessagePreview !== undefined) {
            finalPreview = chatData.lastMessagePreview;
          }
        }
      }
    }

    // Name merge
    let finalName: string | null = null;
    if (chatData.name && chatData.name.trim() !== '') {
      finalName = chatData.name.trim();
    } else if (baseRecord?.name && baseRecord.name.trim() !== '') {
      finalName = baseRecord.name.trim();
    } else {
      const alternate = existingMatches.find(m => m.name && m.name.trim() !== '');
      if (alternate && alternate.name) finalName = alternate.name.trim();
    }

    // Derived aliases
    let finalPhoneJid = chatData.phoneJid || null;
    let finalLidJid = chatData.lidJid || null;
    for (const m of existingMatches) {
      if (!finalPhoneJid && m.phoneJid) finalPhoneJid = m.phoneJid;
      if (!finalLidJid && m.lidJid) finalLidJid = m.lidJid;
    }

    // Number derived
    let finalNumber = chatData.number || null;
    if (!finalNumber) {
      for (const m of existingMatches) {
         if (m.number) {
            finalNumber = m.number;
            break;
         }
      }
    }
    if (!finalNumber && finalPhoneJid && finalPhoneJid.includes('@s.whatsapp.net')) {
      const extracted = finalPhoneJid.split('@')[0].split(':')[0];
      if (extracted && /^\d+$/.test(extracted)) {
         finalNumber = extracted;
      }
    } else if (!finalNumber && finalId.includes('@s.whatsapp.net')) {
      const extracted = finalId.split('@')[0].split(':')[0];
      if (extracted && /^\d+$/.test(extracted)) {
         finalNumber = extracted;
      }
    }

    // archived
    const finalArchived = chatData.archived !== undefined ? chatData.archived : (baseRecord?.archived ?? false);

    // unreadCount
    const finalUnreadCount = chatData.unreadCount !== undefined ? chatData.unreadCount : (baseRecord?.unreadCount ?? null);

    // participantsCount
    const finalParticipantsCount = chatData.participantsCount !== undefined ? chatData.participantsCount : (baseRecord?.participantsCount ?? null);

    // Delete old IDs from map before setting the new one
    for (const match of existingMatches) {
      this.chatsMap.delete(match.id);
    }

    const updated: KnownChat = {
      id: finalId,
      addressJid: finalAddressJid,
      type,
      phoneJid: finalPhoneJid,
      lidJid: finalLidJid,
      number: finalNumber,
      name: finalName,
      archived: finalArchived,
      unreadCount: finalUnreadCount,
      participantsCount: finalParticipantsCount,
      lastMessageAt: finalLastMessageAt,
      lastMessagePreview: finalPreview,
      updatedAt: new Date().toISOString()
    };

    this.chatsMap.set(updated.id, updated);
    this.scheduleSave();
    return updated;
  }

  public remove(id: string) {
    if (this.chatsMap.has(id)) {
      this.chatsMap.delete(id);
      this.scheduleSave();
      return true;
    }
    
    for (const [key, chat] of this.chatsMap.entries()) {
       if (chat.addressJid === id || chat.phoneJid === id || chat.lidJid === id) {
          this.chatsMap.delete(key);
          this.scheduleSave();
          return true;
       }
    }
    return false;
  }

  public enrichIdentity(jidOrLid: string, updates: { name?: string | null; phoneJid?: string; lidJid?: string }) {
    const matches = this.findPrivateMatches([jidOrLid, updates.phoneJid, updates.lidJid]);
    if (matches.length === 0) return;

    this.upsert({
       id: jidOrLid,
       type: 'private',
       name: updates.name,
       phoneJid: updates.phoneJid,
       lidJid: updates.lidJid
    });
  }

  public getAll(): KnownChat[] {
    const list = Array.from(this.chatsMap.values());
    return list.sort((a, b) => {
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return timeB - timeA;
    });
  }
}
