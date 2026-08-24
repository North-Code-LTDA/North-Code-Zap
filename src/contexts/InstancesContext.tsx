import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { WhatsAppInstanceSummary } from '../types';
import { socket } from '../lib/socket';

interface InstancesContextData {
  instances: WhatsAppInstanceSummary[];
  selectedInstanceId: string | null;
  selectInstance: (id: string | null) => void;
  createInstance: (name: string) => Promise<void>;
  renameInstance: (id: string, name: string) => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
  loading: boolean;
}

const InstancesContext = createContext<InstancesContextData>({} as InstancesContextData);

export function InstancesProvider({ children }: { children: React.ReactNode }) {
  const [instances, setInstances] = useState<WhatsAppInstanceSummary[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(() => {
    return localStorage.getItem('north-code-zap:selected-instance') || null;
  });
  const [loading, setLoading] = useState(true);

  const refreshInstances = useCallback(async () => {
    try {
      const res = await fetch('/api/instances');
      const data = await res.json();
      setInstances(data);
      if (data.length > 0) {
        if (!selectedInstanceId || !data.some((i: any) => i.id === selectedInstanceId)) {
          selectInstance(data[0].id);
        }
      } else {
        selectInstance(null);
      }
    } catch (err) {
      console.error('Failed to fetch instances', err);
    } finally {
      setLoading(false);
    }
  }, [selectedInstanceId]);

  useEffect(() => {
    refreshInstances();
  }, [refreshInstances]);

  useEffect(() => {
    if (selectedInstanceId) {
      socket.emit('instance:subscribe', selectedInstanceId);
    }
    
    const handleConnect = () => {
      if (selectedInstanceId) {
        socket.emit('instance:subscribe', selectedInstanceId);
      }
    };
    
    socket.on('connect', handleConnect);
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [selectedInstanceId]);

  const selectInstance = (id: string | null) => {
    setSelectedInstanceId(id);
    if (id) {
      localStorage.setItem('north-code-zap:selected-instance', id);
    } else {
      localStorage.removeItem('north-code-zap:selected-instance');
    }
  };

  const createInstance = async (name: string) => {
    const res = await fetch('/api/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      const data = await res.json();
      await refreshInstances();
      selectInstance(data.id);
    }
  };

  const renameInstance = async (id: string, name: string) => {
    await fetch(`/api/instances/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    await refreshInstances();
  };

  const deleteInstance = async (id: string) => {
    await fetch(`/api/instances/${id}`, {
      method: 'DELETE'
    });
    if (selectedInstanceId === id) {
      setSelectedInstanceId(null);
    }
    await refreshInstances();
  };

  return (
    <InstancesContext.Provider value={{
      instances,
      selectedInstanceId,
      selectInstance,
      createInstance,
      renameInstance,
      deleteInstance,
      refreshInstances,
      loading
    }}>
      {children}
    </InstancesContext.Provider>
  );
}

export function useInstances() {
  return useContext(InstancesContext);
}
