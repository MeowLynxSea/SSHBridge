import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from '../components/AuthContext.js';
import { LanguageProvider, useLanguage } from '../components/LanguageContext.js';
import { ThemeProvider, useTheme } from '../components/ThemeContext.js';
import '../lib/i18n.js';
import AuthForm from '../components/AuthForm.js';
import TunnelManager from '../components/TunnelManager.js';
import ResponsiveLayout from '../components/ResponsiveLayout.js';

// Custom hook to sync user settings
function useUserSettingsSync(
  token: string | null,
  user: { id: number; username: string; created_at: string } | null
) {
  const { changeLanguage } = useLanguage();
  const { setTheme } = useTheme();
  const { apiFetch, setUser, setToken } = useAuth();
  const [settingsSynced, setSettingsSynced] = useState(false);

  useEffect(() => {
    if (user && token && !settingsSynced) {
      const syncSettings = async () => {
        try {
          const response = await apiFetch('/api/settings');

          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              // Apply user's saved language
              if (data.language) {
                changeLanguage(data.language);
              }

              // Apply user's saved theme
              if (data.theme) {
                setTheme(data.theme);
              }

              setSettingsSynced(true);
            }
          }
        } catch (error) {
          console.error('Failed to sync user settings:', error);
          // If we get an error (likely auth-related), clear the session
          setUser(null);
          setToken(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      };

      syncSettings();
    } else if (!user) {
      // Reset synced state when user logs out
      requestAnimationFrame(() => setSettingsSynced(false));
    }
  }, [user, token, settingsSynced, changeLanguage, setTheme, apiFetch, setUser, setToken]);

  return settingsSynced;
}

function AppContent() {
  const { user, token, isLoading, setUser, setToken } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [isValidating, setIsValidating] = useState(false);
  const validationRef = useRef(false); // Track if we've already validated

  // Validate token on mount if user exists
  useEffect(() => {
    const checkToken = async () => {
      // Only validate once per session
      if (token && user && !validationRef.current) {
        validationRef.current = true;
        setIsValidating(true);
        try {
          const response = await fetch('/api/auth/validate', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            // Clear auth state manually to avoid dependency issues
            setUser(null);
            setToken(null);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            return;
          }
        } catch (error) {
          console.error('Token validation failed:', error);
          // Clear auth state manually to avoid dependency issues
          setUser(null);
          setToken(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        } finally {
          setIsValidating(false);
        }
      }
    };

    checkToken();
  }, [token, user, setUser, setToken]);

  // Sync user settings when user logs in
  useUserSettingsSync(token, user);

  if (isLoading || isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="nb-loader"></div>
          <h2 className="text-2xl font-black uppercase" style={{ fontFamily: 'var(--font-sans)' }}>
            {isValidating ? 'Validating Session...' : 'Loading...'}
          </h2>
          <div
            className="nb-box"
            style={{
              padding: '10px',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              transform: 'rotate(1deg)',
            }}
          >
            {isValidating ? 'CHECKING AUTHENTICATION...' : 'SYSTEM INITIALIZING...'}
          </div>
        </div>
      </div>
    );
  }

  if (user) {
    return <TunnelManager />;
  }

  return (
    <AuthForm mode={mode} onToggleMode={() => setMode(mode === 'login' ? 'register' : 'login')} />
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <ResponsiveLayout>
            <AppContent />
          </ResponsiveLayout>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
