import { useState, useEffect, useRef, useCallback } from 'react';
import type { Campaign, CampaignScheduleConfig } from '../types';

export function useCampaigns(instanceId: string | null) {
  const [state, setState] = useState<Campaign[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const requestSeqRef = useRef(0);
  const currentInstanceIdRef = useRef<string | null>(instanceId);

  const fetchCampaigns = useCallback(async () => {
    if (!instanceId) return;
    const seq = ++requestSeqRef.current;
    const fetchInstanceId = instanceId;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns?instanceId=${instanceId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao buscar campanhas');
      }
      const data = await res.json();
      if (seq === requestSeqRef.current && currentInstanceIdRef.current === fetchInstanceId) {
        setState(data.campaigns);
      }
    } catch (e: any) {
      if (seq === requestSeqRef.current && currentInstanceIdRef.current === fetchInstanceId) {
        setError(e.message);
      }
    } finally {
      if (seq === requestSeqRef.current && currentInstanceIdRef.current === fetchInstanceId) {
        setLoading(false);
      }
    }
  }, [instanceId]);

  useEffect(() => {
    currentInstanceIdRef.current = instanceId;
    requestSeqRef.current += 1;
    setState(null);
    setError(null);
    setLoading(!!instanceId);
    
    if (instanceId) {
      fetchCampaigns();
    }
  }, [instanceId, fetchCampaigns]);

  const wrapMutation = <T extends any[], R>(fn: (...args: T) => Promise<R>) => {
    return async (...args: T) => {
      const operationInstanceId = currentInstanceIdRef.current;
      const res = await fn(...args);
      if (operationInstanceId && currentInstanceIdRef.current === operationInstanceId) {
        await fetchCampaigns();
      }
      return res;
    };
  };

  const createCampaign = wrapMutation(async (payload: Partial<Campaign>) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao criar campanha');
    return data.campaign;
  });

  const updateCampaign = wrapMutation(async (id: string, updates: Partial<Campaign>) => {
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao atualizar campanha');
    return data.campaign;
  });

  const scheduleCampaign = wrapMutation(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/schedule`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao agendar campanha');
    return data.campaign;
  });

  const pauseCampaign = wrapMutation(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/pause`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao pausar campanha');
  });

  const resumeCampaign = wrapMutation(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/resume`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao retomar campanha');
  });

  const unscheduleCampaign = wrapMutation(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/unschedule`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao voltar para rascunho');
    return data.campaign;
  });

  const deleteCampaign = wrapMutation(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao excluir campanha');
  });

  return {
    state,
    loading,
    error,
    fetchCampaigns,
    createCampaign,
    updateCampaign,
    scheduleCampaign,
    pauseCampaign,
    resumeCampaign,
    unscheduleCampaign,
    deleteCampaign
  };
}
