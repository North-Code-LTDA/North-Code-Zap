import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
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

export function useWhatsApp() {
  const [state, setState] = useState<WhatsAppAccountInfo>(INITIAL_STATE);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }>>([]);
  const socketRef = useRef<Socket | null>(null);

  const addLog = useCallback((text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    const id = Math.random().toString(36).substring(2, 9);
    setLogs((prev) => [{ id, time, text, type }, ...prev.slice(0, 49)]);
  }, []);

  useEffect(() => {
    // Connect to Socket.IO on current host
    const socketInstance: Socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      setSocketConnected(true);
      addLog('Socket.IO conectado ao servidor', 'info');
      socketInstance.emit('whatsapp:get_state');
      socketInstance.emit('whatsapp:get_messages');
    });

    socketInstance.on('disconnect', () => {
      setSocketConnected(false);
      addLog('Socket.IO desconectado do servidor', 'warn');
    });

    socketInstance.on('whatsapp:state', (newState: WhatsAppAccountInfo) => {
      setState(newState);
      setLoading(false);

      if (newState.status === 'connecting') {
        if (newState.qrCode === null && newState.jid === null) {
          addLog('Iniciando conexão Baileys...', 'info');
        } else {
          addLog('Finalizando autenticação Baileys...', 'info');
        }
      } else if (newState.status === 'qr') {
        addLog('QR Code gerado e pronto para leitura', 'info');
      } else if (newState.status === 'connected') {
        addLog(`WhatsApp conectado com sucesso (${newState.name || newState.number})`, 'success');
      } else if (newState.status === 'disconnected') {
        if (newState.error) {
          addLog(`Desconectado: ${newState.error}`, 'warn');
        } else {
          addLog('WhatsApp desconectado', 'info');
        }
      } else if (newState.status === 'error') {
        addLog(`Erro: ${newState.error || 'Falha na conexão'}`, 'error');
      }
    });

    // Real-time incoming message
    socketInstance.on('whatsapp:message', (newMsg: ReceivedMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev;
        }
        return [newMsg, ...prev].slice(0, 100);
      });
      const senderDisplay = newMsg.pushName ? `${newMsg.pushName} (${newMsg.number || 'desconhecido'})` : (newMsg.number || 'desconhecido');
      addLog(`Nova mensagem de ${senderDisplay}`, 'success');
    });

    socketInstance.on('whatsapp:messages_list', (list: ReceivedMessage[]) => {
      if (Array.isArray(list)) {
        setMessages(list);
      }
    });

    // Initial state fetch via REST
    fetch('/api/whatsapp/status')
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
    fetch('/api/whatsapp/messages')
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
      socketInstance.disconnect();
    };
  }, [addLog]);

  const connect = useCallback(async () => {
    if (loading || state.status === 'connected') return;

    setLoading(true);
    addLog('Solicitando conexão ao WhatsApp...', 'info');

    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        addLog(`Erro ao conectar: ${data.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`Falha na requisição: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, state.status, addLog]);

  const disconnect = useCallback(async () => {
    setLoading(true);
    addLog('Desconectando WhatsApp...', 'info');

    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        addLog(`Erro ao desconectar: ${data.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`Falha na requisição: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  return {
    state,
    messages,
    messagesCount: messages.length,
    socketConnected,
    loading,
    logs,
    connect,
    disconnect,
  };
}
