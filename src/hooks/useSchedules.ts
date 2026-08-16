import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  ScheduledMessage,
  ScheduledTarget,
  ScheduleType,
  WhatsAppGroup,
  SchedulerProgressEvent,
  ScheduleLastResult,
} from '../types';

export function useSchedules() {
  const [schedules, setSchedules] = useState<ScheduledMessage[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState<boolean>(false);
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

  // Socket.IO realtime integration
  useEffect(() => {
    fetchSchedules();
    fetchGroups();

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
        }, 5000);
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [fetchSchedules, fetchGroups]);

  // Actions
  const createSchedule = useCallback(
    async (data: {
      name: string;
      message: string;
      targets: ScheduledTarget[];
      scheduleType: ScheduleType;
      scheduledAt: string;
      weeklyDays?: number[];
      timeOfDay?: string;
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
    loadingSchedules,
    loadingGroups,
    currentProgress,
    executingScheduleId,
    fetchSchedules,
    fetchGroups,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    pauseSchedule,
    resumeSchedule,
    runNow,
  };
}
