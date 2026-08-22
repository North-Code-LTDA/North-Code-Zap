import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { WhatsAppInstanceSummary } from '../types';
import { socket } from '../lib/socket';

interface InstancesContextData {
  instances: WhatsAppInstanceSummary[];
  selectedInstanceId: string | null;
  selectInstance: (id: string) => void;
  createInstance: (name: string) => Promise<void>;
  renameInstance: (id: string, name: string) => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
  loading: boolean;
}

const InstancesContext = createContext<InstancesContextData>({} as InstancesContextData);

export function InstancesProvider({ children }: { children: React.ReactNode }) {
  const [instances, setInstances] = useState<WhatsAppInstanceSummary[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshInstances = useCallback(async () => {
    try {
      const res = await fetch('/api/instances');
      const data = await res.json();
      setInstances(data);
      if (!selectedInstanceId && data.length > 0) {
        setSelectedInstanceId(data[0].id);
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
  }, [selectedInstanceId]);

  const selectInstance = (id: string) => {
    setSelectedInstanceId(id);
  };

  const createInstance = async (name: string) => {
    await fetch('/api/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    await refreshInstances();
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
