import { useState, useEffect, useCallback } from 'react';
import { socket } from '../lib/socket';
import type { 
  ScheduledMessage, 
  WhatsAppGroup, 
  KnownContact, 
  GroupParticipantsResponse, 
  ScheduledMedia,
  SchedulerProgressEvent,
  ScheduleLastResult,
  SchedulePayload
} from '../types';

export function useSchedules(instanceId: string | null) {
  const [schedules, setSchedules] = useState<ScheduledMessage[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [contacts, setContacts] = useState<KnownContact[]>([]);
  
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [currentProgress, setCurrentProgress] = useState<SchedulerProgressEvent | null>(null);
  const [executingScheduleId, setExecutingScheduleId] = useState<string | null>(null);
  const schedulerTimezone = 'America/Belem'; // Ou fetch caso precise futuramente

  const fetchSchedules = useCallback(async () => {
    if (!instanceId) {
      setLoadingSchedules(false);
      setLoadingGroups(false);
      setLoadingContacts(false);
      return;
    }
    try {
      setLoadingSchedules(true);
      const res = await fetch(`/api/instances/${instanceId}/schedules`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.schedules)) {
          setSchedules(data.schedules);
        }
      }
    } catch (err) {
      console.error('Error fetching schedules:', err);
    } finally {
      setLoadingSchedules(false);
    }
  }, [instanceId]);

  const fetchGroups = useCallback(async () => {
    if (!instanceId) return;
    setLoadingGroups(true);
    try {
      const res = await fetch(`/api/instances/${instanceId}/whatsapp/groups`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setGroups(data);
        }
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
    } finally {
      setLoadingGroups(false);
    }
  }, [instanceId]);

  const fetchContacts = useCallback(async () => {
    if (!instanceId) return;
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/instances/${instanceId}/contacts`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setContacts(data);
        }
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoadingContacts(false);
    }
  }, [instanceId]);

  const fetchGroupParticipants = useCallback(async (groupJid: string): Promise<GroupParticipantsResponse | null> => {
    if (!instanceId) return null;
    try {
      const res = await fetch(`/api/instances/${instanceId}/whatsapp/groups/${encodeURIComponent(groupJid)}/participants`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error('Error fetching group participants:', err);
    }
    return null;
  }, [instanceId]);

  const uploadMedia = useCallback(
    async (file: File): Promise<{ success: boolean; media?: ScheduledMedia; error?: string }> => {
      if (!instanceId) return { success: false, error: 'No instance selected' };
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/instances/${instanceId}/media/upload`, {
          method: 'POST',
          body: formData,
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          return { success: false, error: result.error || 'Falha no upload da imagem.' };
        }
        return { success: true, media: result.media };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao enviar imagem.' };
      }
    },
    [instanceId]
  );

  useEffect(() => {
    setSchedules([]);
    setGroups([]);
    setContacts([]);
    setCurrentProgress(null);
    setExecutingScheduleId(null);
    
    if (!instanceId) return;
    
    // Initial fetch
    fetchSchedules();
    fetchGroups();
    fetchContacts();

    

    const onSchedulesList = (list: ScheduledMessage[]) => {
      if (Array.isArray(list)) setSchedules(list);
    };
    socket.on('scheduler:schedules_list', onSchedulesList);

    const onUpdated = (list: ScheduledMessage[]) => {
      if (Array.isArray(list)) setSchedules(list);
    };
    socket.on('scheduler:updated', onUpdated);

    const onStarted = ({ scheduleId }: { scheduleId: string; name: string; targetsCount: number }) => {
      setExecutingScheduleId(scheduleId);
    };
    socket.on('scheduler:started', onStarted);

    const onProgress = (progress: SchedulerProgressEvent) => {
      setCurrentProgress(progress);
      setExecutingScheduleId(progress.scheduleId);
    };
    socket.on('scheduler:progress', onProgress);

    const onCompleted = ({ scheduleId }: { scheduleId: string; name: string; result: ScheduleLastResult }) => {
      setExecutingScheduleId((prev) => (prev === scheduleId ? null : prev));
      setTimeout(() => {
        setCurrentProgress((prev) => (prev?.scheduleId === scheduleId ? null : prev));
      }, 8000);
    };
    socket.on('scheduler:completed', onCompleted);

    return () => {
      socket.off('scheduler:schedules_list', onSchedulesList);
      socket.off('scheduler:updated', onUpdated);
      socket.off('scheduler:started', onStarted);
      socket.off('scheduler:progress', onProgress);
      socket.off('scheduler:completed', onCompleted);
    };
  }, [instanceId, fetchSchedules, fetchGroups, fetchContacts]);

  const createSchedule = useCallback(
    async (data: SchedulePayload): Promise<{ success: boolean; schedule?: ScheduledMessage; error?: string }> => {
      if (!instanceId) return { success: false, error: 'No instance' };
      try {
        const res = await fetch(`/api/instances/${instanceId}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok || !result.success) return { success: false, error: result.error || 'Falha ao criar' };
        await fetchSchedules();
        return { success: true, schedule: result.schedule };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro' };
      }
    },
    [instanceId, fetchSchedules]
  );

  const updateSchedule = useCallback(
    async (id: string, data: SchedulePayload): Promise<{ success: boolean; schedule?: ScheduledMessage; error?: string }> => {
      if (!instanceId) return { success: false, error: 'No instance' };
      try {
        const res = await fetch(`/api/instances/${instanceId}/schedules/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok || !result.success) return { success: false, error: result.error || 'Falha' };
        await fetchSchedules();
        return { success: true, schedule: result.schedule };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro' };
      }
    },
    [instanceId, fetchSchedules]
  );

  const deleteSchedule = useCallback(
    async (id: string): Promise<{ success: boolean; error?: string }> => {
      if (!instanceId) return { success: false, error: 'No instance' };
      try {
        const res = await fetch(`/api/instances/${instanceId}/schedules/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok || !result.success) return { success: false, error: result.error || 'Falha' };
        await fetchSchedules();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro' };
      }
    },
    [instanceId, fetchSchedules]
  );

  const pauseSchedule = useCallback(
    async (id: string): Promise<{ success: boolean; error?: string }> => {
      if (!instanceId) return { success: false, error: 'No instance' };
      try {
        const res = await fetch(`/api/instances/${instanceId}/schedules/${id}/pause`, { method: 'POST' });
        const result = await res.json();
        if (!res.ok || !result.success) return { success: false, error: result.error || 'Falha' };
        await fetchSchedules();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro' };
      }
    },
    [instanceId, fetchSchedules]
  );

  const resumeSchedule = useCallback(
    async (id: string): Promise<{ success: boolean; error?: string }> => {
      if (!instanceId) return { success: false, error: 'No instance' };
      try {
        const res = await fetch(`/api/instances/${instanceId}/schedules/${id}/resume`, { method: 'POST' });
        const result = await res.json();
        if (!res.ok || !result.success) return { success: false, error: result.error || 'Falha' };
        await fetchSchedules();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro' };
      }
    },
    [instanceId, fetchSchedules]
  );

  const runNow = useCallback(
    async (id: string): Promise<{ success: boolean; result?: ScheduleLastResult; error?: string }> => {
      if (!instanceId) return { success: false, error: 'No instance' };
      try {
        setExecutingScheduleId(id);
        const res = await fetch(`/api/instances/${instanceId}/schedules/${id}/run-now`, { method: 'POST' });
        const result = await res.json();
        if (!res.ok || !result.success) {
          setExecutingScheduleId((prev) => (prev === id ? null : prev));
          return { success: false, error: result.error || 'Falha' };
        }
        await fetchSchedules();
        return { success: true, result: result.result };
      } catch (err: any) {
        setExecutingScheduleId((prev) => (prev === id ? null : prev));
        return { success: false, error: err?.message || 'Erro' };
      }
    },
    [instanceId, fetchSchedules]
  );

  return {
    schedules,
    groups,
    contacts,
    loadingSchedules,
    loadingGroups,
    loadingContacts,
    currentProgress,
    executingScheduleId,
    schedulerTimezone,
    fetchSchedules,
    fetchGroups,
    fetchContacts,
    fetchGroupParticipants,
    uploadMedia,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    pauseSchedule,
    resumeSchedule,
    runNow,
  };
}
