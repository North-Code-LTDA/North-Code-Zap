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

  public upsert(chatData: Partial<KnownChat> & { id: string, addressJid?: string, type?: 'private' | 'group' }): KnownChat {
    // Determine type
    const isGroup = chatData.type === 'group' || chatData.id.endsWith('@g.us');
    const type = isGroup ? 'group' : 'private';

    let mergedExisting: KnownChat | null = null;
    let existingMatches: KnownChat[] = [];

    // Find existing records
    if (type === 'private') {
      const knownKeys = [chatData.id, chatData.addressJid, chatData.phoneJid, chatData.lidJid].filter(Boolean) as string[];
      for (const [, chat] of this.chatsMap.entries()) {
        if (
          knownKeys.includes(chat.id) ||
          (chat.addressJid && knownKeys.includes(chat.addressJid)) ||
          (chat.phoneJid && knownKeys.includes(chat.phoneJid)) ||
          (chat.lidJid && knownKeys.includes(chat.lidJid))
        ) {
          if (!existingMatches.find(e => e.id === chat.id)) {
            existingMatches.push(chat);
          }
        }
      }
    } else {
      const existing = this.chatsMap.get(chatData.id);
      if (existing) existingMatches.push(existing);
    }

    // Merge existing records if multiple are found
    if (existingMatches.length > 0) {
      mergedExisting = existingMatches[0];
      for (let i = 1; i < existingMatches.length; i++) {
        const next = existingMatches[i];
        
        const timeMerged = mergedExisting.lastMessageAt ? new Date(mergedExisting.lastMessageAt).getTime() : 0;
        const timeNext = next.lastMessageAt ? new Date(next.lastMessageAt).getTime() : 0;
        
        const keepMergedPreview = timeMerged >= timeNext;

        mergedExisting = {
          ...mergedExisting,
          id: mergedExisting.id.includes('@s.whatsapp.net') ? mergedExisting.id : (next.id.includes('@s.whatsapp.net') ? next.id : mergedExisting.id),
          phoneJid: mergedExisting.phoneJid || next.phoneJid,
          lidJid: mergedExisting.lidJid || next.lidJid,
          number: mergedExisting.number || next.number,
          name: (mergedExisting.name && mergedExisting.name.trim() !== '') ? mergedExisting.name : next.name,
          archived: next.archived !== undefined ? next.archived : mergedExisting.archived, // Just taking the most recent or merged one's
          unreadCount: next.unreadCount !== undefined ? next.unreadCount : mergedExisting.unreadCount,
          participantsCount: next.participantsCount !== undefined ? next.participantsCount : mergedExisting.participantsCount,
          lastMessageAt: timeMerged >= timeNext ? mergedExisting.lastMessageAt : next.lastMessageAt,
          lastMessagePreview: keepMergedPreview ? mergedExisting.lastMessagePreview : next.lastMessagePreview,
        };
      }
    }

    // Determine final ID for private
    let finalId = chatData.id;
    if (type === 'private') {
      const mergedPhoneJid = chatData.phoneJid || mergedExisting?.phoneJid;
      if (mergedPhoneJid && mergedPhoneJid.includes('@s.whatsapp.net')) {
        finalId = mergedPhoneJid;
      }
    }

    // Delete old IDs from map before setting the new one
    for (const match of existingMatches) {
      this.chatsMap.delete(match.id);
    }

    // Name merge
    const mergedName = (chatData.name && chatData.name.trim() !== '') ? chatData.name : (mergedExisting?.name || null);
    
    // Time and preview
    let finalLastMessageAt = mergedExisting?.lastMessageAt || null;
    let finalPreview = mergedExisting?.lastMessagePreview || null;

    if (chatData.lastMessageAt) {
      const timeNew = new Date(chatData.lastMessageAt).getTime();
      const timeOld = mergedExisting?.lastMessageAt ? new Date(mergedExisting.lastMessageAt).getTime() : 0;
      if (timeNew >= timeOld) {
        finalLastMessageAt = chatData.lastMessageAt;
        if (chatData.lastMessagePreview !== undefined) {
          finalPreview = chatData.lastMessagePreview;
        }
      } else {
        if (!finalLastMessageAt) {
           finalLastMessageAt = chatData.lastMessageAt;
           if (chatData.lastMessagePreview !== undefined) {
              finalPreview = chatData.lastMessagePreview;
           }
        }
      }
    }

    // Unread count
    let finalUnreadCount = mergedExisting?.unreadCount !== undefined ? mergedExisting.unreadCount : null;
    if (chatData.unreadCount !== undefined) {
       finalUnreadCount = chatData.unreadCount;
    }

    // Participants count
    let finalParticipantsCount = mergedExisting?.participantsCount !== undefined ? mergedExisting.participantsCount : null;
    if (chatData.participantsCount !== undefined) {
       finalParticipantsCount = chatData.participantsCount;
    }

    // Number
    let finalPhoneJid = chatData.phoneJid || mergedExisting?.phoneJid || null;
    let finalNumber = chatData.number || mergedExisting?.number || null;
    if (!finalNumber && finalPhoneJid && finalPhoneJid.includes('@s.whatsapp.net')) {
      const extracted = finalPhoneJid.split('@')[0].split(':')[0];
      if (extracted) {
         finalNumber = extracted;
      }
    }

    const updated: KnownChat = {
      id: finalId,
      addressJid: chatData.addressJid || mergedExisting?.addressJid || finalId,
      type,
      phoneJid: finalPhoneJid,
      lidJid: chatData.lidJid || mergedExisting?.lidJid || null,
      number: finalNumber,
      name: mergedName,
      archived: chatData.archived !== undefined ? chatData.archived : (mergedExisting?.archived || false),
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
