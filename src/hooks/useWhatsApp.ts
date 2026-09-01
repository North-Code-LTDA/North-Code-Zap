import { useEffect, useState, useCallback, useMemo } from 'react';
import { socket } from '../lib/socket';
import type { WhatsAppAccountInfo, ReceivedMessage } from '../types';

const INITIAL_STATE: WhatsAppAccountInfo = {
  status: 'disconnected',
  name: null,
  number: null,
  jid: null,
  qrCode: null,
  error: null,
  connectedAt: null,
};

export function useWhatsApp(instanceId: string | null) {
  const [state, setState] = useState<WhatsAppAccountInfo>(INITIAL_STATE);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }>>([]);
  

  const addLog = useCallback((text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    const id = Math.random().toString(36).substring(2, 9);
    setLogs((prev) => [{ id, time, text, type }, ...prev.slice(0, 49)]);
  }, []);

  useEffect(() => {
    setState(INITIAL_STATE);
    setMessages([]);
    setLogs([]);
    setLoading(false);
    
    if (!instanceId) return;
    

    

    const onConnect = () => {
      setSocketConnected(true);
    };
    socket.on('connect', onConnect);
    
    const onDisconnect = () => {
      setSocketConnected(false);
    };
    socket.on('disconnect', onDisconnect);

    

    const onState = (newState: WhatsAppAccountInfo) => {
      setState(newState);
      setLoading(false);
    };
    socket.on('whatsapp:state', onState);

    // Real-time incoming or outgoing message
    const onMessage = (newMsg: ReceivedMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [newMsg, ...prev].slice(0, 100);
      });
      if (newMsg.direction === 'outgoing') {
        const destDisplay = newMsg.pushName ? `${newMsg.pushName} (${newMsg.number || 'contato'})` : (newMsg.number ? `+${newMsg.number}` : 'destinatário');
        addLog(`Mensagem enviada para ${destDisplay}`, 'success');
      } else {
        const senderDisplay = newMsg.pushName ? `${newMsg.pushName} (${newMsg.number || 'desconhecido'})` : (newMsg.number ? `+${newMsg.number}` : 'desconhecido');
        addLog(`Nova mensagem de ${senderDisplay}`, 'success');
      }
    };
    socket.on('whatsapp:message', onMessage);



    const onMessagesList = (list: ReceivedMessage[]) => {
      if (Array.isArray(list)) setMessages(list);
    };
    socket.on('whatsapp:messages_list', onMessagesList);

    // Initial state fetch via REST
    fetch(`/api/instances/${instanceId}/whatsapp/status`)
      .then((res) => res.json())
      .then((data: WhatsAppAccountInfo) => {
        if (data && data.status) {
          setState(data);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch initial status:', err);
      });

    // Initial messages fetch via REST
    fetch(`/api/instances/${instanceId}/whatsapp/messages`)
      .then((res) => res.json())
      .then((data: ReceivedMessage[]) => {
        if (Array.isArray(data)) {
          setMessages(data);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch initial messages:', err);
      });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('whatsapp:state', onState);
      socket.off('whatsapp:message', onMessage);
      socket.off('whatsapp:messages_list', onMessagesList);
    };
  }, [addLog, instanceId]);

  const connect = useCallback(async () => {
    if (!instanceId) return;
    if (loading || state.status === 'connected') return;

    setLoading(true);
    addLog('Solicitando conexão ao WhatsApp...', 'info');

    try {
      const res = await fetch(`/api/instances/${instanceId}/whatsapp/connect`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        addLog(`Erro ao conectar: ${data.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`Falha na requisição: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [instanceId, loading, state.status, addLog]);

  const disconnect = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    addLog('Desconectando WhatsApp...', 'info');

    try {
      const res = await fetch(`/api/instances/${instanceId}/whatsapp/disconnect`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        addLog(`Erro ao desconectar: ${data.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`Falha na requisição: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [instanceId, addLog]);

  const sendMessage = useCallback(
    async (remoteJid: string, text: string): Promise<{ success: boolean; error?: string }> => {
      if (!instanceId) return { success: false, error: 'Sem instância selecionada' };
      if (!remoteJid || !text.trim()) {
        return { success: false, error: 'Dados inválidos para envio' };
      }

      try {
        const res = await fetch(`/api/instances/${instanceId}/whatsapp/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ remoteJid, text: text.trim() }),
        });

        const data = await res.json();
        if (!data.success) {
          addLog(`Erro no envio: ${data.error}`, 'error');
          return { success: false, error: data.error };
        }

        return { success: true };
      } catch (err: any) {
        const errMsg = err?.message || 'Falha na requisição de envio';
        addLog(`Falha na requisição de envio: ${errMsg}`, 'error');
        return { success: false, error: errMsg };
      }
    },
    [instanceId, addLog]
  );

  const incomingChatsCount = useMemo(() => {
    const chats = new Set<string>();

    for (const message of messages) {
      if (message.direction === 'outgoing') continue;
      
      if (!message.remoteJid) continue;
      if (message.remoteJid.endsWith('@g.us')) continue;
      if (message.remoteJid.includes('@broadcast')) continue;

      chats.add(message.remoteJid);
    }

    return chats.size;
  }, [messages]);

  return {
    state,
    messages,
    messagesCount: messages.length,
    incomingChatsCount,
    socketConnected,
    loading,
    logs,
    connect,
    disconnect,
    sendMessage,
  };
}
