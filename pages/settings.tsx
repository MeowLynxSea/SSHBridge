import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../components/AuthContext.js';
import { useMobile } from '../components/ResponsiveLayout.js';
import { useLanguage } from '../components/LanguageContext.js';
import { useTheme } from '../components/ThemeContext.js';

interface UserSettings {
  refreshInterval: number;
  language: string;
  theme: 'dark' | 'light' | 'auto';
}

type Theme = 'dark' | 'light' | 'auto';

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, apiFetch, isLoading: authLoading } = useAuth();
  const { availableLanguages, changeLanguage, currentLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings>({
    refreshInterval: 2000, // Default 2 seconds
    language: 'en',
    theme: 'auto',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { isMobile, isSmallMobile } = useMobile();

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiFetch('/api/settings');

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSettings({
            refreshInterval: data.refreshInterval,
            language: data.language || currentLanguage,
            theme: data.theme || 'auto',
          });
        } else {
          setError(data.error || t('settings.failedToFetch'));
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || t('settings.failedToFetch'));
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError(t('settings.networkError'));
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  }, [apiFetch, currentLanguage, t]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchSettings();
    }
  }, [authLoading, user, fetchSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshInterval: settings.refreshInterval,
          language: currentLanguage,
          theme: theme,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSuccess(t('settings.saved'));
          // Update local state with the response value
          setSettings({
            refreshInterval: data.refreshInterval,
            language: data.language || currentLanguage,
            theme: data.theme || theme,
          });
        } else {
          setError(data.error || t('settings.failedToSave'));
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || t('settings.failedToSave'));
      }
    } catch (err) {
      console.error(t('console.failedToFetchSettings'), err);
      setError(t('settings.networkError'));
    } finally {
      setLoading(false);
    }
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 1000) {
      setSettings({ ...settings, refreshInterval: value });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="nb-loader"></div>
          <h2 className="text-2xl font-bold">{t('general.loading')}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header
        className={`nb-box nb-header`}
        style={{
          borderBottom: 'none',
          padding: isSmallMobile ? '15px 0' : '20px 0',
          boxShadow: 'none',
          position: 'relative',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: isSmallMobile ? '0 15px' : '0 20px',
          }}
        >
          {/* Navigation */}
          {isMobile ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '15px',
                }}
              >
                <h1 className={`${isSmallMobile ? 'text-2xl' : 'text-3xl'} font-black uppercase`}>
                  SSH<span style={{ color: 'var(--accent-color)' }}>Bridge</span>
                </h1>
                <button
                  className="nb-btn"
                  onClick={() => router.push('/')}
                  style={{
                    background: 'none',
                    border: 'none',
                    boxShadow: 'none',
                    padding: '5px',
                    fontSize: '1.2rem',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ←
                </button>
              </div>

              {/* Mobile Tabs */}
              <div className="nb-tabs">
                <button
                  className="nb-tab"
                  onClick={() => router.push('/')}
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.tunnels')}
                </button>
                <button
                  className="nb-tab"
                  onClick={() => router.push('/stats')}
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.statistics')}
                </button>
                <button
                  className="nb-tab nb-tab-active"
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.settings')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h1 className="text-4xl font-black uppercase">
                  SSH<span style={{ color: 'var(--accent-color)' }}>Bridge</span>
                </h1>
                <button
                  className="nb-btn"
                  onClick={() => router.push('/')}
                  style={{
                    background: 'var(--gray-light)',
                    color: 'var(--fg-color)',
                  }}
                >
                  ← {t('general.back')}
                </button>
              </div>

              {/* Tabs */}
              <div className="nb-tabs">
                <button className="nb-tab" onClick={() => router.push('/')}>
                  {t('tunnelManager.tunnels')}
                </button>
                <button className="nb-tab" onClick={() => router.push('/stats')}>
                  {t('tunnelManager.statistics')}
                </button>
                <button className="nb-tab nb-tab-active">{t('tunnelManager.settings')}</button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: isSmallMobile ? '0 15px' : '0 20px',
        }}
      >
        <div style={{ marginTop: isSmallMobile ? '20px' : '40px' }}>
          <div className="nb-box nb-card">
            <div className="nb-card-header">
              <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>
                {t('settings.title')}
              </h2>
            </div>
            <div className="nb-card-body">
              <p style={{ marginBottom: '20px' }}>{t('settings.description')}</p>

              {error && (
                <div className="nb-alert nb-alert-destructive" style={{ marginBottom: '20px' }}>
                  {error}
                </div>
              )}

              {success && (
                <div
                  className="nb-alert"
                  style={{
                    marginBottom: '20px',
                    background: 'var(--accent-color)',
                    color: 'var(--bg-color)',
                  }}
                >
                  {success}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="nb-label" htmlFor="refreshInterval">
                    {t('settings.refreshInterval')}
                  </label>
                  <input
                    className="nb-input"
                    id="refreshInterval"
                    type="number"
                    min="1000"
                    step="100"
                    value={settings.refreshInterval}
                    onChange={handleIntervalChange}
                    required
                  />
                  <p
                    style={{
                      fontSize: '0.8rem',
                      marginTop: '5px',
                      fontFamily: 'monospace',
                      opacity: 0.8,
                    }}
                  >
                    {t('settings.refreshIntervalDescription')}
                  </p>
                </div>

                {/* Language Selection */}
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="nb-label" htmlFor="language">
                    {t('settings.language')}
                  </label>
                  <select
                    className="nb-input"
                    id="language"
                    value={currentLanguage}
                    onChange={(e) => changeLanguage(e.target.value)}
                    style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                  >
                    {availableLanguages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.nativeName} ({lang.name})
                      </option>
                    ))}
                  </select>
                  <p
                    style={{
                      fontSize: '0.8rem',
                      marginTop: '5px',
                      fontFamily: 'monospace',
                      opacity: 0.8,
                    }}
                  >
                    {t('settings.languageDescription')}
                  </p>
                </div>

                {/* Theme Selection */}
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="nb-label" htmlFor="theme">
                    {t('settings.theme')}
                  </label>
                  <select
                    className="nb-input"
                    id="theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as Theme)}
                    style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                  >
                    <option value="auto">{t('settings.themeAuto')}</option>
                    <option value="dark">{t('settings.themeDark')}</option>
                    <option value="light">{t('settings.themeLight')}</option>
                  </select>
                  <p
                    style={{
                      fontSize: '0.8rem',
                      marginTop: '5px',
                      fontFamily: 'monospace',
                      opacity: 0.8,
                    }}
                  >
                    {t('settings.themeDescription')}
                  </p>
                </div>

                <div
                  style={{
                    display: isMobile ? 'flex' : 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    justifyContent: 'flex-end',
                    gap: '10px',
                  }}
                >
                  <button
                    className="nb-btn"
                    type="button"
                    onClick={() => router.push('/')}
                    disabled={loading}
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    {t('general.back')}
                  </button>
                  <button
                    className="nb-btn nb-btn-primary"
                    type="submit"
                    disabled={loading}
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    {loading ? t('settings.saving') : t('settings.save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
