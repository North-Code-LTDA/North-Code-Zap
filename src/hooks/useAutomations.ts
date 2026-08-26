import { useState, useEffect, useRef, useCallback } from 'react';
import type { Automation, AutomationTrigger } from '../types';

export function useAutomations(instanceId: string | null) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const fetchAutomations = useCallback(async () => {
    const seq = ++reqSeq.current;
    if (!instanceId) {
      setAutomations([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/instances/${instanceId}/automations`);
      if (!res.ok) throw new Error('Failed to fetch automations');
      const data = await res.json();
      if (seq === reqSeq.current) {
        setAutomations(data);
      }
    } catch (err: any) {
      console.error(err);
      if (seq === reqSeq.current) {
        setError(err.message || 'Failed to fetch automations');
      }
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const createAutomation = async (data: {
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    message: string;
    fallbackName: string;
  }) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || 'Failed to create automation');
    }
    const created = await res.json();
    setAutomations(prev => [created, ...prev]);
    return created;
  };

  const updateAutomation = async (id: string, data: Partial<Automation>) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/automations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || 'Failed to update automation');
    }
    const updated = await res.json();
    setAutomations(prev => prev.map(a => a.id === id ? updated : a));
    return updated;
  };

  const deleteAutomation = async (id: string) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/automations/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete automation');
    setAutomations(prev => prev.filter(a => a.id !== id));
  };

  return {
    automations,
    loading,
    error,
    fetchAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation
  };
}
