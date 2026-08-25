import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AudienceTag, AudienceList, AudiencesState } from '../src/types';

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export class AudienceService {
  private filePath: string;
  private state: AudiencesState;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = {
      tags: [],
      contactTags: {},
      lists: []
    };
    this.ensureDirectory();
    this.load();
  }

  private ensureDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  private load() {
    if (!fs.existsSync(this.filePath)) {
      this.state = { tags: [], contactTags: {}, lists: [] };
      return;
    }

    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') throw new Error('Audiences file is invalid.');

    const tags: AudienceTag[] = [];
    const tagIds = new Set<string>();
    const tagNames = new Set<string>();

    if (!Array.isArray(parsed.tags)) throw new Error('tags must be an array');
    for (const t of parsed.tags) {
      if (!t || typeof t !== 'object') throw new Error('Invalid tag object');
      if (!t.id || typeof t.id !== 'string' || !isValidUuid(t.id)) throw new Error('Invalid tag id');
      if (tagIds.has(t.id)) throw new Error('Duplicate tag id');
      
      if (!t.name || typeof t.name !== 'string' || !t.name.trim()) throw new Error('Invalid tag name');
      const nameTrimmed = t.name.trim();
      if (nameTrimmed.length > 60) throw new Error('Tag name too long');
      const nameLower = nameTrimmed.toLowerCase();
      if (tagNames.has(nameLower)) throw new Error('Duplicate tag name');

      if (!t.createdAt || typeof t.createdAt !== 'string' || !isValidDate(t.createdAt)) throw new Error('Invalid tag createdAt');
      if (!t.updatedAt || typeof t.updatedAt !== 'string' || !isValidDate(t.updatedAt)) throw new Error('Invalid tag updatedAt');

      tagIds.add(t.id);
      tagNames.add(nameLower);
      tags.push({ ...t, name: nameTrimmed } as AudienceTag);
    }

    const lists: AudienceList[] = [];
    const listIds = new Set<string>();
    const listNames = new Set<string>();

    if (!Array.isArray(parsed.lists)) throw new Error('lists must be an array');
    for (const l of parsed.lists) {
      if (!l || typeof l !== 'object') throw new Error('Invalid list object');
      if (!l.id || typeof l.id !== 'string' || !isValidUuid(l.id)) throw new Error('Invalid list id');
      if (listIds.has(l.id)) throw new Error('Duplicate list id');
      
      if (!l.name || typeof l.name !== 'string' || !l.name.trim()) throw new Error('Invalid list name');
      const nameTrimmed = l.name.trim();
      if (nameTrimmed.length > 100) throw new Error('List name too long');
      const nameLower = nameTrimmed.toLowerCase();
      if (listNames.has(nameLower)) throw new Error('Duplicate list name');

      if (!Array.isArray(l.contactJids)) throw new Error('list contactJids must be an array');
      const jids = new Set<string>();
      for (const jid of l.contactJids) {
        if (typeof jid !== 'string' || !jid.trim()) throw new Error('Invalid jid in list');
        if (jids.has(jid)) throw new Error('Duplicate jid in list');
        jids.add(jid);
      }

      if (!l.createdAt || typeof l.createdAt !== 'string' || !isValidDate(l.createdAt)) throw new Error('Invalid list createdAt');
      if (!l.updatedAt || typeof l.updatedAt !== 'string' || !isValidDate(l.updatedAt)) throw new Error('Invalid list updatedAt');

      listIds.add(l.id);
      listNames.add(nameLower);
      lists.push({ ...l, name: nameTrimmed, contactJids: Array.from(jids) } as AudienceList);
    }

    if (!parsed.contactTags || typeof parsed.contactTags !== 'object' || Array.isArray(parsed.contactTags)) {
      throw new Error('contactTags must be an object');
    }

    const contactTags: Record<string, string[]> = {};
    for (const jid of Object.keys(parsed.contactTags)) {
      // Basic jid check (individual format @s.whatsapp.net)
      if (!jid.endsWith('@s.whatsapp.net')) throw new Error(`Invalid jid in contactTags: ${jid}`);
      
      const tIds = parsed.contactTags[jid];
      if (!Array.isArray(tIds)) throw new Error(`tag array for ${jid} must be an array`);
      
      const uniqueTags = new Set<string>();
      for (const tId of tIds) {
        if (typeof tId !== 'string') throw new Error('tag id must be string');
        if (!tagIds.has(tId)) throw new Error(`tag id ${tId} does not exist`);
        if (uniqueTags.has(tId)) throw new Error(`duplicate tag id ${tId} for jid ${jid}`);
        uniqueTags.add(tId);
      }
      
      if (uniqueTags.size > 0) {
        contactTags[jid] = Array.from(uniqueTags);
      }
    }

    this.state = {
      tags,
      lists,
      contactTags
    };
  }

  private save() {
    this.ensureDirectory();
    const data = JSON.stringify(this.state, null, 2);
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, data, { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  public getState(): AudiencesState {
    return this.state;
  }

  // Tags
  public createTag(name: string): AudienceTag {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) throw new Error('Invalid tag name');
    const lower = trimmed.toLowerCase();
    if (this.state.tags.some(t => t.name.toLowerCase() === lower)) {
      throw new Error('Duplicate tag name');
    }
    const now = new Date().toISOString();
    const tag: AudienceTag = {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: now,
      updatedAt: now
    };
    this.state.tags.push(tag);
    this.save();
    return tag;
  }

  public renameTag(id: string, name: string): AudienceTag {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) throw new Error('Invalid tag name');
    const lower = trimmed.toLowerCase();
    const tag = this.state.tags.find(t => t.id === id);
    if (!tag) throw new Error('Tag not found');
    if (this.state.tags.some(t => t.id !== id && t.name.toLowerCase() === lower)) {
      throw new Error('Duplicate tag name');
    }
    tag.name = trimmed;
    tag.updatedAt = new Date().toISOString();
    this.save();
    return tag;
  }

  public deleteTag(id: string) {
    const idx = this.state.tags.findIndex(t => t.id === id);
    if (idx === -1) throw new Error('Tag not found');
    this.state.tags.splice(idx, 1);
    
    // Remove from contactTags
    for (const jid of Object.keys(this.state.contactTags)) {
      this.state.contactTags[jid] = this.state.contactTags[jid].filter(tId => tId !== id);
      if (this.state.contactTags[jid].length === 0) {
        delete this.state.contactTags[jid];
      }
    }
    
    this.save();
  }

  // Tags <-> Contacts
  public addTagToContacts(tagId: string, jids: string[]) {
    if (!this.state.tags.some(t => t.id === tagId)) throw new Error('Tag not found');
    let changed = false;
    for (const jid of jids) {
      if (typeof jid !== 'string' || !jid.endsWith('@s.whatsapp.net')) continue;
      if (!this.state.contactTags[jid]) {
        this.state.contactTags[jid] = [];
      }
      if (!this.state.contactTags[jid].includes(tagId)) {
        this.state.contactTags[jid].push(tagId);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  public removeTagFromContacts(tagId: string, jids: string[]) {
    let changed = false;
    for (const jid of jids) {
      if (this.state.contactTags[jid]) {
        const initialLen = this.state.contactTags[jid].length;
        this.state.contactTags[jid] = this.state.contactTags[jid].filter(tId => tId !== tagId);
        if (this.state.contactTags[jid].length < initialLen) changed = true;
        
        if (this.state.contactTags[jid].length === 0) {
          delete this.state.contactTags[jid];
        }
      }
    }
    if (changed) this.save();
  }

  // Lists
  public createList(name: string, contactJids: string[]): AudienceList {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error('Invalid list name');
    const lower = trimmed.toLowerCase();
    if (this.state.lists.some(l => l.name.toLowerCase() === lower)) {
      throw new Error('Duplicate list name');
    }
    const uniqueJids = Array.from(new Set(contactJids.filter(j => typeof j === 'string' && j.endsWith('@s.whatsapp.net'))));
    const now = new Date().toISOString();
    const list: AudienceList = {
      id: crypto.randomUUID(),
      name: trimmed,
      contactJids: uniqueJids,
      createdAt: now,
      updatedAt: now
    };
    this.state.lists.push(list);
    this.save();
    return list;
  }

  public renameList(id: string, name: string): AudienceList {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error('Invalid list name');
    const lower = trimmed.toLowerCase();
    const list = this.state.lists.find(l => l.id === id);
    if (!list) throw new Error('List not found');
    if (this.state.lists.some(l => l.id !== id && l.name.toLowerCase() === lower)) {
      throw new Error('Duplicate list name');
    }
    list.name = trimmed;
    list.updatedAt = new Date().toISOString();
    this.save();
    return list;
  }

  public updateListContacts(id: string, contactJids: string[]): AudienceList {
    const list = this.state.lists.find(l => l.id === id);
    if (!list) throw new Error('List not found');
    const uniqueJids = Array.from(new Set(contactJids.filter(j => typeof j === 'string' && j.endsWith('@s.whatsapp.net'))));
    list.contactJids = uniqueJids;
    list.updatedAt = new Date().toISOString();
    this.save();
    return list;
  }

  public deleteList(id: string) {
    const idx = this.state.lists.findIndex(l => l.id === id);
    if (idx === -1) throw new Error('List not found');
    this.state.lists.splice(idx, 1);
    this.save();
  }
}
