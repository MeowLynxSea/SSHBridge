import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';

// Define RequestInit interface since it's not available in this context
type RequestInit = globalThis.RequestInit;

interface User {
  id: number;
  username: string;
  otp_enabled: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  login: (
    username: string,
    password: string,
    otpToken?: string
  ) => Promise<{ requiresOtp: boolean }>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (userUpdates: Partial<User>) => void;
  isLoading: boolean;
  validateToken: () => Promise<boolean>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter() as unknown as {
    push: (url: string) => Promise<boolean>;
    pathname: string;
  };
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const legacyToken = localStorage.getItem('token');
        const response = await fetch('/api/auth/validate', {
          method: 'GET',
          credentials: 'same-origin',
          headers: legacyToken ? { Authorization: `Bearer ${legacyToken}` } : undefined,
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { user?: User };
        if (!cancelled && data.user) {
          setUser(data.user);
          setToken(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error('Session restore error:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnauthorized = useCallback(() => {
    // Clear auth state
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // Redirect to login page if not already there
    if (router.pathname !== '/') {
      router.push('/');
    }
  }, [router]);

  const login = async (username: string, password: string, otpToken?: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
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
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    return { requiresOtp: false };
  };

  const register = async (username: string, password: string) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'same-origin',
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
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (error) {
      console.error('Logout error:', error);
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
  };

  const validateToken = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        credentials: 'same-origin',
      });

      if (response.status === 401) {
        // Clear auth state manually
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // Redirect to login page if not already there
        if (router.pathname !== '/') {
          router.push('/');
        }
        return false;
      }

      if (response.ok) {
        const data = (await response.json()) as { user?: User };
        if (data.user) {
          setUser(data.user);
        }
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Token validation error:', error);
      // Clear auth state manually
      setUser(null);
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return false;
    }
  }, [router]); // Include router but not handleUnauthorized

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const defaultOptions: RequestInit = {
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options.headers,
        },
        ...options,
      };

      const response = await fetch(url, defaultOptions);

      // Handle 401 Unauthorized globally for non-validation requests
      if (response.status === 401 && !url.includes('/api/auth/validate')) {
        handleUnauthorized();
        throw new Error('Authentication failed - please login again');
      }

      return response;
    },
    [token, handleUnauthorized]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        setUser,
        setToken,
        login,
        register,
        logout,
        updateUser,
        isLoading,
        validateToken,
        apiFetch,
      }}
    >
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
