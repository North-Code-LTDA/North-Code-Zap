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

  private getLatestTimestamp(d1: string | null | undefined, d2: string | null | undefined): string | null {
    if (!d1 && !d2) return null;
    if (d1 && !d2) return d1;
    if (!d1 && d2) return d2;
    const t1 = new Date(d1!).getTime();
    const t2 = new Date(d2!).getTime();
    if (isNaN(t1) && isNaN(t2)) return null;
    if (isNaN(t1)) return d2!;
    if (isNaN(t2)) return d1!;
    return t1 > t2 ? d1! : d2!;
  }

  public upsert(chatData: Partial<KnownChat> & { id: string, addressJid: string, type: 'private' | 'group' }): KnownChat {
    // 1. Deduplication Check
    // If the new chat has phoneJid and we have an existing chat with the same lidJid,
    // we must merge them into the phoneJid record and remove the lidJid record.
    let existing: KnownChat | undefined = this.chatsMap.get(chatData.id);

    if (chatData.type === 'private') {
      const knownKeys = [chatData.id, chatData.addressJid, chatData.phoneJid, chatData.lidJid].filter(Boolean) as string[];
      for (const k of knownKeys) {
        if (this.chatsMap.has(k)) {
          const match = this.chatsMap.get(k)!;
          if (!existing || existing.id === chatData.id) {
             existing = match;
          }
        }
      }

      // If existing ID is different and is LID, and new ID is PN, we're migrating
      if (existing && existing.id !== chatData.id && existing.id.includes('@lid') && chatData.id.includes('@s.whatsapp.net')) {
        this.chatsMap.delete(existing.id);
        existing = { ...existing, id: chatData.id };
      }
      
      // If existing ID is PN and new ID is LID, we should use the existing PN as canonical
      if (existing && existing.id.includes('@s.whatsapp.net') && chatData.id.includes('@lid')) {
         chatData.id = existing.id;
         chatData.phoneJid = existing.phoneJid;
      }
    }

    const mergedName = (chatData.name && chatData.name.trim() !== '') ? chatData.name : (existing?.name || null);
    
    // We only update lastMessagePreview if we also have a new lastMessageAt that is greater/equal, 
    // or if we didn't have one before.
    let newPreview = existing?.lastMessagePreview || null;
    if (chatData.lastMessageAt && chatData.lastMessagePreview !== undefined) {
      if (!existing?.lastMessageAt || new Date(chatData.lastMessageAt).getTime() >= new Date(existing.lastMessageAt).getTime()) {
        newPreview = chatData.lastMessagePreview;
      }
    }

    const updated: KnownChat = {
      id: chatData.id,
      addressJid: chatData.addressJid || existing?.addressJid || chatData.id,
      type: chatData.type,
      phoneJid: chatData.phoneJid || existing?.phoneJid || null,
      lidJid: chatData.lidJid || existing?.lidJid || null,
      number: chatData.number || existing?.number || null,
      name: mergedName,
      archived: chatData.archived !== undefined ? chatData.archived : (existing?.archived || false),
      unreadCount: chatData.unreadCount !== undefined ? chatData.unreadCount : (existing?.unreadCount || 0),
      participantsCount: chatData.participantsCount !== undefined ? chatData.participantsCount : (existing?.participantsCount || null),
      lastMessageAt: this.getLatestTimestamp(chatData.lastMessageAt, existing?.lastMessageAt),
      lastMessagePreview: newPreview,
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
    
    // Also try to find by aliases
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
    let existing: KnownChat | undefined;
    for (const [key, chat] of this.chatsMap.entries()) {
      if (key === jidOrLid || chat.addressJid === jidOrLid || chat.phoneJid === jidOrLid || chat.lidJid === jidOrLid) {
        existing = chat;
        break;
      }
    }
    
    if (existing && existing.type === 'private') {
      const chatData: any = { ...existing };
      if (updates.name) chatData.name = updates.name;
      if (updates.phoneJid) {
        chatData.phoneJid = updates.phoneJid;
        if (chatData.id.includes('@lid')) {
          this.chatsMap.delete(chatData.id);
          chatData.id = updates.phoneJid;
        }
      }
      if (updates.lidJid) chatData.lidJid = updates.lidJid;
      
      this.chatsMap.set(chatData.id, chatData);
      this.scheduleSave();
    }
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
