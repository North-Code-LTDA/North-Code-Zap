import { useState, useEffect, useRef } from 'react';
import type { MessageTemplate } from '../types';

export function useTemplates() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const reqSeq = useRef(0);

  const fetchTemplates = async () => {
    const seq = ++reqSeq.current;
    try {
      setLoading(true);
      setError(null);
      
      const res = await fetch('/api/templates');
      if (seq !== reqSeq.current) return;
      
      if (!res.ok) {
        throw new Error('Falha ao carregar templates');
      }
      const data = await res.json();
      setTemplates(data);
    } catch (err: any) {
      if (seq !== reqSeq.current) return;
      setError(err.message);
    } finally {
      if (seq === reqSeq.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const createTemplate = async (data: { name: string; message: string; fallbackName: string }) => {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao criar template');
    
    setTemplates(prev => {
      if (!prev) return [result.template];
      return [result.template, ...prev].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
    return result.template;
  };

  const updateTemplate = async (id: string, data: { name?: string; message?: string; fallbackName?: string }) => {
    const res = await fetch(`/api/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao atualizar template');
    
    setTemplates(prev => {
      if (!prev) return null;
      const next = prev.map(t => t.id === id ? result.template : t);
      next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return next;
    });
    return result.template;
  };

  const deleteTemplate = async (id: string) => {
    const res = await fetch(`/api/templates/${id}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao deletar template');
    
    setTemplates(prev => {
      if (!prev) return null;
      return prev.filter(t => t.id !== id);
    });
  };

  return {
    templates,
    loading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    refresh: fetchTemplates
  };
}
