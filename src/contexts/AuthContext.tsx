import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthIdentity } from '../types';

interface AuthContextType {
  identity: AuthIdentity | null;
  loading: boolean;
  setIdentity: (identity: AuthIdentity | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) {
          return res.json();
        }
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

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
    setIdentity(null);
  };

  return (
    <AuthContext.Provider value={{ identity, loading, setIdentity, logout }}>
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
