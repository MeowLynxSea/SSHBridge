import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface User {
  id: number;
  username: string;
  otp_enabled: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (
    username: string,
    password: string,
    otpToken?: string
  ) => Promise<{ requiresOtp: boolean }>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (userUpdates: Partial<User>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      // Use requestAnimationFrame to avoid setState synchronously in effect
      requestAnimationFrame(() => {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setIsLoading(false);
      });
    } else {
      requestAnimationFrame(() => {
        setIsLoading(false);
      });
    }
  }, []);

  const login = async (username: string, password: string, otpToken?: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password, otpToken }),
    });

    const data = await response.json();

    // Special handling for OTP required (only check on 401 status)
    if (response.status === 401 && data.requiresOtp) {
      return { requiresOtp: true };
    }

    // For all other non-200 responses, throw an error
    if (!response.ok) {
      throw new Error(data.error || t('auth.loginFailed'));
    }

    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    return { requiresOtp: false };
  };

  const register = async (username: string, password: string) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || t('auth.registrationFailed'));
    }

    const data = await response.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const updateUser = (userUpdates: Partial<User>) => {
    if (!user) return;

    const updatedUser = { ...user, ...userUpdates };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
