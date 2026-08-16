import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  ScheduledMessage,
  ScheduledTarget,
  ScheduleType,
  WhatsAppGroup,
  KnownContact,
  GroupParticipantsResponse,
  SchedulerProgressEvent,
  ScheduleLastResult,
  DeliveryOptions,
  ScheduledMedia,
  WeeklyTimeSlot,
} from '../types';

export function useSchedules() {
  const [schedules, setSchedules] = useState<ScheduledMessage[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [contacts, setContacts] = useState<KnownContact[]>([]);
  const [loadingGroups, setLoadingGroups] = useState<boolean>(false);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [loadingSchedules, setLoadingSchedules] = useState<boolean>(true);
  const [currentProgress, setCurrentProgress] = useState<SchedulerProgressEvent | null>(null);
  const [executingScheduleId, setExecutingScheduleId] = useState<string | null>(null);

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    try {
      setLoadingSchedules(true);
      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSchedules(data);
        }
      }
    } catch (err) {
      console.error('Error fetching schedules:', err);
    } finally {
      setLoadingSchedules(false);
    }
  }, []);

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    try {
      setLoadingGroups(true);
      const res = await fetch('/api/whatsapp/groups');
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
  }, []);

  // Fetch contacts directory
  const fetchContacts = useCallback(async () => {
    try {
      setLoadingContacts(true);
      const res = await fetch('/api/whatsapp/contacts');
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
  }, []);

  // Fetch group participants
  const fetchGroupParticipants = useCallback(async (groupJid: string): Promise<GroupParticipantsResponse | null> => {
    try {
      const res = await fetch(`/api/whatsapp/groups/${encodeURIComponent(groupJid)}/participants`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error('Error fetching group participants:', err);
    }
    return null;
  }, []);

  // Upload Media
  const uploadMedia = useCallback(
    async (file: File): Promise<{ success: boolean; media?: ScheduledMedia; error?: string }> => {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/media/upload', {
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
    []
  );

  // Socket.IO realtime integration
  useEffect(() => {
    fetchSchedules();
    fetchGroups();
    fetchContacts();

    const socket: Socket = io({
      transports: ['websocket', 'polling'],
    });

    socket.on('scheduler:schedules_list', (list: ScheduledMessage[]) => {
      if (Array.isArray(list)) {
        setSchedules(list);
      }
    });

    socket.on('scheduler:updated', (list: ScheduledMessage[]) => {
      if (Array.isArray(list)) {
        setSchedules(list);
      }
    });

    socket.on(
      'scheduler:started',
      ({ scheduleId }: { scheduleId: string; name: string; targetsCount: number }) => {
        setExecutingScheduleId(scheduleId);
      }
    );

    socket.on('scheduler:progress', (progress: SchedulerProgressEvent) => {
      setCurrentProgress(progress);
      setExecutingScheduleId(progress.scheduleId);
    });

    socket.on(
      'scheduler:completed',
      ({ scheduleId }: { scheduleId: string; name: string; result: ScheduleLastResult }) => {
        setExecutingScheduleId((prev) => (prev === scheduleId ? null : prev));
        setTimeout(() => {
          setCurrentProgress((prev) => (prev?.scheduleId === scheduleId ? null : prev));
        }, 8000);
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [fetchSchedules, fetchGroups, fetchContacts]);

  // Actions
  const createSchedule = useCallback(
    async (data: {
      name: string;
      message?: string;
      targets: ScheduledTarget[];
      scheduleType: ScheduleType;
      scheduledAt: string;
      dailyTimes?: string[];
      weeklyTimeSlots?: WeeklyTimeSlot[];
      media?: ScheduledMedia | null;
      weeklyDays?: number[];
      timeOfDay?: string;
      fallbackName?: string;
      deliveryOptions?: DeliveryOptions;
    }): Promise<{ success: boolean; schedule?: ScheduledMessage; error?: string }> => {
      try {
        const res = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          return { success: false, error: result.error || 'Falha ao criar agendamento' };
        }
        await fetchSchedules();
        return { success: true, schedule: result.schedule };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao conectar ao servidor' };
      }
    },
    [fetchSchedules]
  );

  const updateSchedule = useCallback(
    async (
      id: string,
      data: Partial<ScheduledMessage>
    ): Promise<{ success: boolean; schedule?: ScheduledMessage; error?: string }> => {
      try {
        const res = await fetch(`/api/schedules/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          return { success: false, error: result.error || 'Falha ao atualizar agendamento' };
        }
        await fetchSchedules();
        return { success: true, schedule: result.schedule };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao conectar ao servidor' };
      }
    },
    [fetchSchedules]
  );

  const deleteSchedule = useCallback(
    async (id: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/schedules/${id}`, {
          method: 'DELETE',
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          return { success: false, error: result.error || 'Falha ao excluir agendamento' };
        }
        await fetchSchedules();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao conectar ao servidor' };
      }
    },
    [fetchSchedules]
  );

  const pauseSchedule = useCallback(
    async (id: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/schedules/${id}/pause`, {
          method: 'POST',
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          return { success: false, error: result.error || 'Falha ao pausar agendamento' };
        }
        await fetchSchedules();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao conectar ao servidor' };
      }
    },
    [fetchSchedules]
  );

  const resumeSchedule = useCallback(
    async (id: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/schedules/${id}/resume`, {
          method: 'POST',
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          return { success: false, error: result.error || 'Falha ao retomar agendamento' };
        }
        await fetchSchedules();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao conectar ao servidor' };
      }
    },
    [fetchSchedules]
  );

  const runNow = useCallback(
    async (
      id: string
    ): Promise<{ success: boolean; result?: ScheduleLastResult; error?: string }> => {
      try {
        setExecutingScheduleId(id);
        const res = await fetch(`/api/schedules/${id}/run-now`, {
          method: 'POST',
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          setExecutingScheduleId((prev) => (prev === id ? null : prev));
          return { success: false, error: result.error || 'Falha ao disparar agendamento' };
        }
        await fetchSchedules();
        return { success: true, result: result.result };
      } catch (err: any) {
        setExecutingScheduleId((prev) => (prev === id ? null : prev));
        return { success: false, error: err?.message || 'Erro ao conectar ao servidor' };
      }
    },
    [fetchSchedules]
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
