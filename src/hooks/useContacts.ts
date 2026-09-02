import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import type { KnownContact } from '../types';

export function useContacts(instanceId: string | null) {
  const [contacts, setContacts] = useState<KnownContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeInstanceRef = useRef<string | null>(instanceId);
  const requestSeqRef = useRef(0);

  useLayoutEffect(() => {
    activeInstanceRef.current = instanceId;
    requestSeqRef.current += 1;
  }, [instanceId]);

  const fetchContacts = useCallback(async () => {
    if (!instanceId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/instances/${instanceId}/contacts`);
      if (!res.ok) {
        throw new Error('Falha ao carregar contatos');
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Formato de resposta inválido');
      }
      setContacts(data);
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    setContacts([]);
    setError(null);
    if (!instanceId) {
      setLoading(false);
      return;
    }
    fetchContacts();
  }, [fetchContacts, instanceId]);

  return { contacts, loading, error, fetchContacts };
}
