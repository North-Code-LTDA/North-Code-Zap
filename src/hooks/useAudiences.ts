import { useState, useEffect, useCallback, useRef } from 'react';
import { AudiencesState, AudienceTag, AudienceList } from '../types';

export function useAudiences(instanceId: string | null) {
  const [state, setState] = useState<AudiencesState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const requestSeqRef = useRef(0);

  useEffect(() => {
    requestSeqRef.current += 1;
    // Clear immediately on instance change
    setState(null);
    setError(null);
    setLoading(!!instanceId);
  }, [instanceId]);

  const fetchAudiences = useCallback(async () => {
    if (!instanceId) {
      return;
    }
    
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/instances/${instanceId}/audiences`);
      if (!res.ok) throw new Error('Failed to fetch audiences');
      const data = await res.json();
      
      if (seq === requestSeqRef.current) {
        setState(data);
        setError(null);
      }
    } catch (e: any) {
      if (seq === requestSeqRef.current) {
        setError(e.message);
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [instanceId]);

  useEffect(() => {
    fetchAudiences();
  }, [fetchAudiences]);

  const createTag = async (name: string): Promise<AudienceTag> => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to create tag');
    }
    const tag = await res.json();
    await fetchAudiences();
    return tag;
  };

  const renameTag = async (tagId: string, name: string): Promise<AudienceTag> => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/tags/${tagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to rename tag');
    }
    const tag = await res.json();
    await fetchAudiences();
    return tag;
  };

  const deleteTag = async (tagId: string) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/tags/${tagId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to delete tag');
    }
    await fetchAudiences();
  };

  const addTagToContacts = async (tagId: string, jids: string[]) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/tags/${tagId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jids })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to add tag to contacts');
    }
    await fetchAudiences();
  };

  const removeTagFromContacts = async (tagId: string, jids: string[]) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/tags/${tagId}/contacts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jids })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to remove tag from contacts');
    }
    await fetchAudiences();
  };

  const createList = async (name: string, contactJids: string[]): Promise<AudienceList> => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contactJids })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to create list');
    }
    const list = await res.json();
    await fetchAudiences();
    return list;
  };

  const renameList = async (listId: string, name: string): Promise<AudienceList> => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to rename list');
    }
    const list = await res.json();
    await fetchAudiences();
    return list;
  };

  const updateListContacts = async (listId: string, contactJids: string[]): Promise<AudienceList> => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/lists/${listId}/contacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactJids })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update list contacts');
    }
    const list = await res.json();
    await fetchAudiences();
    return list;
  };

  const deleteList = async (listId: string) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/audiences/lists/${listId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to delete list');
    }
    await fetchAudiences();
  };

  return {
    state,
    loading,
    error,
    fetchAudiences,
    createTag,
    renameTag,
    deleteTag,
    addTagToContacts,
    removeTagFromContacts,
    createList,
    renameList,
    updateListContacts,
    deleteList
  };
}
