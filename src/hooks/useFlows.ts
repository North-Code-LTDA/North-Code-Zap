import { useState, useCallback, useRef, useEffect } from 'react';
import type { Flow } from '../types';

export function useFlows(instanceId: string | null) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const fetchFlows = useCallback(async () => {
    const seq = ++reqSeq.current;
    if (!instanceId) {
      setFlows([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/instances/${instanceId}/flows`);
      if (!res.ok) throw new Error('Failed to fetch flows');
      const data = await res.json();
      if (seq === reqSeq.current) {
        setFlows(data);
      }
    } catch (err: any) {
      console.error(err);
      if (seq === reqSeq.current) {
        setError(err.message || 'Failed to fetch flows');
      }
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const createFlow = async (data: Partial<Flow>) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao criar fluxo');
    }
    const newFlow = await res.json();
    setFlows(prev => [newFlow, ...prev]);
    return newFlow;
  };

  const updateFlow = async (id: string, data: Partial<Flow>) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/flows/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao atualizar fluxo');
    }
    const updated = await res.json();
    setFlows(prev => prev.map(f => f.id === id ? updated : f));
    return updated;
  };

  const deleteFlow = async (id: string) => {
    if (!instanceId) throw new Error('No instance selected');
    const res = await fetch(`/api/instances/${instanceId}/flows/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao excluir fluxo');
    }
    setFlows(prev => prev.filter(f => f.id !== id));
  };

  return {
    flows,
    loading,
    error,
    fetchFlows,
    createFlow,
    updateFlow,
    deleteFlow
  };
}
