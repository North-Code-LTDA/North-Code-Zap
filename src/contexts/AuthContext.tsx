import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthIdentity } from '../types';
import { socket } from '../lib/socket';

interface AuthContextType {
  identity: AuthIdentity | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json();
        return null;
      })
      .then(data => {
        setIdentity(data);
        setLoading(false);
      })
      .catch(() => {
        setIdentity(null);
        setLoading(false);
      });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao entrar');
    setIdentity(data);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao registrar');
    setIdentity(data);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
    setIdentity(null);
    localStorage.removeItem('north-code-zap:selected-instance');
  };

  useEffect(() => {
    if (identity && !loading) {
      socket.connect();
    } else if (!identity && !loading) {
      socket.disconnect();
    }
    return () => {
      socket.disconnect();
    };
  }, [identity, loading]);

  return (
    <AuthContext.Provider value={{ identity, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
