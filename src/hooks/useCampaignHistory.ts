import { useState, useRef, useCallback } from 'react';
import type { CampaignExecutionHistory, CampaignExecutionSummary } from '../types';

export function useCampaignHistory() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [summaries, setSummaries] = useState<CampaignExecutionSummary[]>([]);
  const [detail, setDetail] = useState<CampaignExecutionHistory | null>(null);

  const reqSeq = useRef(0);

  const fetchSummaries = useCallback(async (campaignId: string) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    setSummaries([]);
    setDetail(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/history`);
      if (seq !== reqSeq.current) return;
      
      if (!res.ok) {
        throw new Error('Falha ao carregar histórico');
      }
      
      const data = await res.json();
      if (data.success) {
        setSummaries(data.executions);
      }
    } catch (err: any) {
      if (seq === reqSeq.current) {
        setError(err.message);
      }
    } finally {
      if (seq === reqSeq.current) {
        setLoading(false);
      }
    }
  }, []);

  const fetchDetail = useCallback(async (campaignId: string, executionId: string) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    setDetail(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/history/${executionId}`);
      if (seq !== reqSeq.current) return;

      if (!res.ok) {
        throw new Error('Falha ao carregar detalhes da execução');
      }

      const data = await res.json();
      if (data.success) {
        setDetail(data.execution);
      }
    } catch (err: any) {
      if (seq === reqSeq.current) {
        setError(err.message);
      }
    } finally {
      if (seq === reqSeq.current) {
        setLoading(false);
      }
    }
  }, []);

  const clear = useCallback(() => {
    reqSeq.current++;
    setSummaries([]);
    setDetail(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    summaries,
    detail,
    loading,
    error,
    fetchSummaries,
    fetchDetail,
    clear
  };
}
