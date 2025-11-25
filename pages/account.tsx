import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../components/AuthContext';
import { LanguageProvider } from '../components/LanguageContext';
import { ThemeProvider } from '../components/ThemeContext';
import { useMobile } from '../components/ResponsiveLayout';
import '../lib/i18n';

function AccountManagerPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [isPasswordFormExpanded, setIsPasswordFormExpanded] = useState(false);
  const { isMobile, isSmallMobile } = useMobile();

  useEffect(() => {
    // Check if user is authenticated
    if (!token) {
      router.push('/');
    }
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError(t('account.passwordMismatch'));
      setIsLoading(false);
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      setError(t('account.passwordTooShort'));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (response.ok) {
        setSuccess(t('account.passwordUpdateSuccess'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');

        // Keep form expanded after success
        // Don't redirect to home

        // Clear success message after 3 seconds but keep form expanded
        setTimeout(() => {
          setSuccess('');
        }, 3000);
      } else {
        const data = await response.json();
        setError(data.error || t('account.passwordUpdateFailed'));
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(t('account.networkError'));
      console.error('Password change error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h1 className={`${isSmallMobile ? 'text-2xl' : 'text-3xl'} font-black uppercase`}>
              SSH<span style={{ color: 'var(--accent-color)' }}>Bridge</span>
            </h1>
            <button
              className={`nb-btn ${isSmallMobile ? 'px-2 text-xs' : ''}`}
              onClick={handleBack}
              style={{ 
                fontSize: isSmallMobile ? '0.75rem' : '1rem',
                minWidth: isSmallMobile ? '60px' : '120px',
                maxWidth: isSmallMobile ? '80px' : 'none',
                whiteSpace: 'nowrap',
                padding: isSmallMobile ? '8px 4px' : 'auto'
              }}
            >
              {isSmallMobile ? '主页' : t('account.backToHome')}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className="flex-1 flex items-center justify-center p-4"
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div
          className="nb-box nb-card"
          style={{
            width: '100%',
            maxWidth: isSmallMobile ? '100%' : '500px',
            margin: isSmallMobile ? '0' : 'auto',
            position: 'relative',
          }}
        >
          <div className="nb-card-header">
            <h2 className="nb-card-title">{t('account.title')}</h2>
          </div>

          <div className="nb-card-body">
            <div style={{ marginBottom: '20px' }}>
              <div
                className="nb-box"
                style={{
                  padding: '15px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => setIsPasswordFormExpanded(!isPasswordFormExpanded)}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <h3
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 'bold',
                      margin: 0,
                    }}
                  >
                    {t('account.changePassword')}
                  </h3>
                  <span style={{ fontSize: '1.2rem' }}>{isPasswordFormExpanded ? '▼' : '▶'}</span>
                </div>
              </div>

              {isPasswordFormExpanded && (
                <div style={{ marginTop: '15px' }}>
                  {error && (
                    <div className="nb-alert nb-alert-destructive" style={{ marginBottom: '15px' }}>
                      {error}
                    </div>
                  )}

                  {success && (
                    <div
                      className="nb-alert"
                      style={{
                        marginBottom: '15px',
                        backgroundColor: 'var(--accent-color)',
                        color: 'var(--bg-color)',
                      }}
                    >
                      {success}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-group">
                      <label className="nb-label" htmlFor="currentPassword">
                        {t('account.currentPassword')}
                      </label>
                      <input
                        className="nb-input"
                        id="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        required
                        placeholder={t('account.currentPasswordPlaceholder')}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="nb-label" htmlFor="newPassword">
                        {t('account.newPassword')}
                      </label>
                      <input
                        className="nb-input"
                        id="newPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        placeholder={t('account.newPasswordPlaceholder')}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="nb-label" htmlFor="confirmPassword">
                        {t('account.confirmPassword')}
                      </label>
                      <input
                        className="nb-input"
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        placeholder={t('account.confirmPasswordPlaceholder')}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col space-y-3 pt-4">
                      <button
                        className={`nb-btn nb-btn-primary ${isMobile ? 'w-full' : 'w-full'}`}
                        type="submit"
                        disabled={isLoading}
                        style={{
                          fontSize: isSmallMobile ? '1rem' : '1rem',
                          padding: isSmallMobile ? '14px 16px' : '12px 24px',
                        }}
                      >
                        {isLoading ? t('account.updating') : t('account.updatePassword')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AccountPage() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AccountManagerPage />
      </LanguageProvider>
    </ThemeProvider>
  );
}
