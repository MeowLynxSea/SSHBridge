import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { useMobile } from './ResponsiveLayout';
import { useOtp } from './OtpContext';

interface AuthFormProps {
  mode: 'login' | 'register';
  onToggleMode: () => void;
}

export default function AuthForm({ mode, onToggleMode }: AuthFormProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setPendingCredentials] = useState({ username: '', password: '' });
  const { login, register } = useAuth();
  const { showOtpModal } = useOtp();
  const { isMobile, isSmallMobile } = useMobile();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const result = await login(username, password);
        if (result.requiresOtp) {
          const currentCredentials = { username, password };
          setPendingCredentials(currentCredentials);
          showOtpModal({
            id: 'login',
            title: t('otp.loginOtpRequired'),
            onConfirm: async (otpToken: string) => {
              await login(currentCredentials.username, currentCredentials.password, otpToken);
            },
            onCancel: () => {
              setPendingCredentials({ username: '', password: '' });
            }
          });
          setIsLoading(false);
          return;
        }
      } else {
        await register(username, password);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div
        className="nb-box nb-card"
        style={{
          width: '100%',
          maxWidth: isSmallMobile ? '100%' : '500px',
          margin: isSmallMobile ? '0' : 'auto',
        }}
      >
        <div className="nb-card-header">
          <h1 className="nb-card-title">
            {mode === 'login' ? t('auth.signIn') : t('auth.register')}
          </h1>
          <div className="loader-container">{isLoading && <div className="nb-loader"></div>}</div>
        </div>

        <div className="nb-card-body">
          <p className="mb-6">
            {mode === 'login' ? t('auth.signInDescription') : t('auth.registerDescription')}
          </p>

          {error && <div className="nb-alert nb-alert-destructive">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-group">
              <label className="nb-label" htmlFor="username">
                {t('auth.username')}
              </label>
              <input
                className="nb-input"
                id="username"
                type="text"
                autoComplete="username"
                required
                placeholder={t('auth.usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="nb-label" htmlFor="password">
                {t('auth.password')}
              </label>
              <input
                className="nb-input"
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col space-y-4 pt-4">
              <button
                className={`nb-btn nb-btn-primary ${isMobile ? 'w-full' : 'w-full'}`}
                type="submit"
                disabled={isLoading}
                style={{
                  fontSize: isSmallMobile ? '1rem' : '1rem',
                  padding: isSmallMobile ? '14px 16px' : '12px 24px',
                }}
              >
                {isLoading
                  ? t('general.loading')
                  : mode === 'login'
                    ? t('auth.submitLogin')
                    : t('auth.submitRegister')}
              </button>

              <button
                className={`nb-btn ${isMobile ? 'w-full' : 'w-full'}`}
                type="button"
                onClick={onToggleMode}
                style={{
                  fontSize: isSmallMobile ? '0.9rem' : '1rem',
                  padding: isSmallMobile ? '12px 16px' : '12px 24px',
                }}
              >
                {mode === 'login'
                  ? `${t('auth.noAccount')} ${t('auth.switchToRegister')}`
                  : `${t('auth.hasAccount')} ${t('auth.switchToLogin')}`}
              </button>
            </div>
          </form>
        </div>

        {/* 装饰性元素 */}
        <div
          className="decoration"
          style={{
            position: 'absolute',
            right: '20px',
            top: '20px',
            border: '2px solid black',
            padding: '10px',
            transform: 'rotate(3deg)',
            fontSize: '0.7rem',
            fontFamily: 'monospace',
          }}
        >
          {t('auth.systemStatus')}
          <br />
          SECURITY: {mode === 'login' ? 'ENFORCED' : 'CREATING'}
          <br />
        </div>
      </div>
    </div>
  );
}
