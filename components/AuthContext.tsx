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

  const validateToken = useCallback(async (): Promise<boolean> => {
    if (!token) return false;

    try {
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

      return response.ok;
    } catch (error) {
      console.error('Token validation error:', error);
      // Clear auth state manually
      setUser(null);
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return false;
    }
  }, [token, router]); // Include router but not handleUnauthorized

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const defaultOptions: RequestInit = {
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
