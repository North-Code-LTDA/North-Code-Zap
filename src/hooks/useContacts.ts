import { useState, useCallback, useEffect } from 'react';
import type { KnownContact } from '../types';

export function useContacts() {
  const [contacts, setContacts] = useState<KnownContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/whatsapp/contacts');
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
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return { contacts, loading, error, fetchContacts };
}
