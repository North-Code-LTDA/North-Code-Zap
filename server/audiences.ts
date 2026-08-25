import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { AudienceTag, AudienceList, AudiencesState } from '../src/types';

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

function isValidIndividualJid(jid: any): boolean {
  return typeof jid === 'string' && jid.trim().length > 0 && jid.endsWith('@s.whatsapp.net');
}

export class AudienceService {
  private state: AudiencesState = {
    tags: [],
    lists: [],
    contactTags: {}
  };

  constructor(private filePath: string) {
    this.ensureDirectory();
    this.load();
  }

  private ensureDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load() {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    const content = fs.readFileSync(this.filePath, 'utf-8');
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse audiences.json, starting empty');
      return;
    }

    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid audiences file format');

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
        if (!isValidIndividualJid(jid)) throw new Error(`Invalid jid in list ${l.name}: ${jid}`);
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
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid jid in contactTags: ${jid}`);
      
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

  private persist(nextState: AudiencesState) {
    this.ensureDirectory();
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(nextState, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    this.state = nextState;
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

    const nextState = structuredClone(this.state);
    nextState.tags.push(tag);
    this.persist(nextState);

    return tag;
  }

  public renameTag(id: string, name: string): AudienceTag {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) throw new Error('Invalid tag name');
    const lower = trimmed.toLowerCase();

    const tagIdx = this.state.tags.findIndex(t => t.id === id);
    if (tagIdx === -1) throw new Error('Tag not found');

    if (this.state.tags.some(t => t.id !== id && t.name.toLowerCase() === lower)) {
      throw new Error('Duplicate tag name');
    }

    const nextState = structuredClone(this.state);
    nextState.tags[tagIdx].name = trimmed;
    nextState.tags[tagIdx].updatedAt = new Date().toISOString();
    
    this.persist(nextState);
    return nextState.tags[tagIdx];
  }

  public deleteTag(id: string) {
    const idx = this.state.tags.findIndex(t => t.id === id);
    if (idx === -1) throw new Error('Tag not found');

    const nextState = structuredClone(this.state);
    nextState.tags.splice(idx, 1);
    
    // Remove from contactTags
    for (const jid of Object.keys(nextState.contactTags)) {
      nextState.contactTags[jid] = nextState.contactTags[jid].filter(tId => tId !== id);
      if (nextState.contactTags[jid].length === 0) {
        delete nextState.contactTags[jid];
      }
    }
    
    this.persist(nextState);
  }

  // Tags <-> Contacts
  public addTagToContacts(tagId: string, jids: string[]) {
    if (!this.state.tags.some(t => t.id === tagId)) throw new Error('Tag not found');
    
    for (const jid of jids) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid JID: ${jid}`);
    }

    const nextState = structuredClone(this.state);
    let changed = false;

    for (const jid of jids) {
      if (!nextState.contactTags[jid]) {
        nextState.contactTags[jid] = [];
      }
      if (!nextState.contactTags[jid].includes(tagId)) {
        nextState.contactTags[jid].push(tagId);
        changed = true;
      }
    }

    if (changed) this.persist(nextState);
  }

  public removeTagFromContacts(tagId: string, jids: string[]) {
    if (!this.state.tags.some(t => t.id === tagId)) throw new Error('Tag not found');

    for (const jid of jids) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid JID: ${jid}`);
    }

    const nextState = structuredClone(this.state);
    let changed = false;

    for (const jid of jids) {
      if (nextState.contactTags[jid]) {
        const initialLen = nextState.contactTags[jid].length;
        nextState.contactTags[jid] = nextState.contactTags[jid].filter(tId => tId !== tagId);
        if (nextState.contactTags[jid].length < initialLen) changed = true;
        
        if (nextState.contactTags[jid].length === 0) {
          delete nextState.contactTags[jid];
        }
      }
    }

    if (changed) this.persist(nextState);
  }

  // Lists
  public createList(name: string, contactJids: string[]): AudienceList {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error('Invalid list name');
    const lower = trimmed.toLowerCase();
    
    if (this.state.lists.some(l => l.name.toLowerCase() === lower)) {
      throw new Error('Duplicate list name');
    }

    for (const jid of contactJids) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid JID: ${jid}`);
    }

    const uniqueJids = Array.from(new Set(contactJids));
    const now = new Date().toISOString();
    
    const list: AudienceList = {
      id: crypto.randomUUID(),
      name: trimmed,
      contactJids: uniqueJids,
      createdAt: now,
      updatedAt: now
    };

    const nextState = structuredClone(this.state);
    nextState.lists.push(list);
    this.persist(nextState);

    return list;
  }

  public renameList(id: string, name: string): AudienceList {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error('Invalid list name');
    const lower = trimmed.toLowerCase();

    const listIdx = this.state.lists.findIndex(l => l.id === id);
    if (listIdx === -1) throw new Error('List not found');

    if (this.state.lists.some(l => l.id !== id && l.name.toLowerCase() === lower)) {
      throw new Error('Duplicate list name');
    }

    const nextState = structuredClone(this.state);
    nextState.lists[listIdx].name = trimmed;
    nextState.lists[listIdx].updatedAt = new Date().toISOString();
    this.persist(nextState);

    return nextState.lists[listIdx];
  }

  public updateListContacts(id: string, contactJids: string[]): AudienceList {
    const listIdx = this.state.lists.findIndex(l => l.id === id);
    if (listIdx === -1) throw new Error('List not found');

    for (const jid of contactJids) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid JID: ${jid}`);
    }

    const uniqueJids = Array.from(new Set(contactJids));
    
    const nextState = structuredClone(this.state);
    nextState.lists[listIdx].contactJids = uniqueJids;
    nextState.lists[listIdx].updatedAt = new Date().toISOString();
    this.persist(nextState);

    return nextState.lists[listIdx];
  }

  public deleteList(id: string) {
    const idx = this.state.lists.findIndex(l => l.id === id);
    if (idx === -1) throw new Error('List not found');

    const nextState = structuredClone(this.state);
    nextState.lists.splice(idx, 1);
    this.persist(nextState);
  }
}
