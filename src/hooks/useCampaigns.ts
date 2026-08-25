import { useState, useEffect, useRef } from 'react';
import type { Campaign, CampaignScheduleConfig } from '../types';

export function useCampaigns(instanceId: string | null) {
  const [state, setState] = useState<Campaign[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const requestSeqRef = useRef(0);

  const fetchCampaigns = async () => {
    if (!instanceId) return;
    const seq = requestSeqRef.current;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns?instanceId=${instanceId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao buscar campanhas');
      }
      const data = await res.json();
      if (seq === requestSeqRef.current) {
        setState(data.campaigns);
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
  };

  useEffect(() => {
    requestSeqRef.current += 1;
    setState(null);
    setError(null);
    setLoading(!!instanceId);
    
    if (instanceId) {
      fetchCampaigns();
    }
  }, [instanceId]);

  const createCampaign = async (payload: Partial<Campaign>) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao criar campanha');
    await fetchCampaigns();
    return data.campaign;
  };

  const updateCampaign = async (id: string, updates: Partial<Campaign>) => {
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao atualizar campanha');
    await fetchCampaigns();
    return data.campaign;
  };

  const scheduleCampaign = async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/schedule`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao agendar campanha');
    await fetchCampaigns();
    return data.campaign;
  };

  const pauseCampaign = async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/pause`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao pausar campanha');
    await fetchCampaigns();
  };

  const resumeCampaign = async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/resume`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao retomar campanha');
    await fetchCampaigns();
  };

  const unscheduleCampaign = async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/unschedule`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao voltar para rascunho');
    await fetchCampaigns();
    return data.campaign;
  };

  const deleteCampaign = async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao excluir campanha');
    await fetchCampaigns();
  };

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
