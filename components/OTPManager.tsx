import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { useOtp } from './OtpContext.js';
import Image from 'next/image';

interface OTPManagerProps {
  onClose: () => void;
}

export default function OTPManager({ onClose: _onClose }: OTPManagerProps) {
  const { t } = useTranslation();
  const { token, updateUser } = useAuth();
  const { showOtpModal } = useOtp();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'status' | 'setup' | 'disable'>('status');

  useEffect(() => {
    // Check if user is authenticated
    if (!token) return;

    const checkOtpStatus = async () => {
      try {
        const response = await fetch('/api/auth/otp-status', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setIsEnabled(data.otp_enabled);
        }
      } catch (error) {
        console.error('Error checking OTP status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkOtpStatus();
  }, [token]);

  const generateOTP = async () => {
    if (!token) return;

    setIsGenerating(true);
    setError('');

    try {
      const response = await fetch('/api/auth/generate-otp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate OTP');
      }

      const data = await response.json();
      setQrCode(data.qrCode);
      setSecret(data.manualEntryKey);
      setStep('setup');
    } catch (error: unknown) {
      const err = error as Error;
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const enableOTP = async (otpToken?: string) => {
    if (!token || !secret) return;

    setIsEnabling(true);
    setError('');

    try {
      const response = await fetch('/api/auth/enable-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          secret,
          token: otpToken || '',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to enable OTP');
      }

      setIsEnabled(true);
      setStep('status');
      setSecret('');
      setQrCode('');

      // Update user state to reflect OTP enabled
      updateUser({ otp_enabled: true });
    } catch (error: unknown) {
      const err = error as Error;
      setError(err.message);
    } finally {
      setIsEnabling(false);
    }
  };

  const handleSetupOtp = () => {
    showOtpModal({
      id: 'otp-setup',
      title: t('otp.verificationRequired'),
      description: t('otp.setupDescription'),
      onConfirm: async (otpToken: string) => {
        enableOTP(otpToken);
      },
    });
  };

  const handleDisableOtp = () => {
    showOtpModal({
      id: 'otp-disable',
      title: t('otp.otpDisableOtpRequired'),
      description: t('otp.disableDescription'),
      onConfirm: async (otpToken: string) => {
        setError('');

        try {
          const response = await fetch('/api/auth/disable-otp', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              token: otpToken,
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to disable OTP');
          }

          setIsEnabled(false);
          setStep('status');

          // Update user state to reflect OTP disabled
          updateUser({ otp_enabled: false });
        } catch (error: unknown) {
          const err = error as Error;
          setError(err.message);
        }
      },
    });
  };

  if (isLoading) {
    return (
      <div className="nb-box nb-card">
        <div className="nb-card-body">
          <div className="flex justify-center p-8">
            <div className="nb-loader"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nb-box nb-card">
      <div className="nb-card-body">
        {error && <div className="nb-alert nb-alert-destructive mb-4">{error}</div>}

        {step === 'status' && (
          <div>
            <div className="mb-6">
              <p className="mb-4">
                {isEnabled ? t('otp.enabledDescription') : t('otp.disabledDescription')}
              </p>
              <div className={`nb-alert ${isEnabled ? 'nb-alert-success' : 'nb-alert-warning'}`}>
                {isEnabled ? t('otp.statusEnabled') : t('otp.statusDisabled')}
              </div>
            </div>

            <div className="flex gap-4">
              {!isEnabled ? (
                <button
                  className="nb-btn nb-btn-primary"
                  onClick={generateOTP}
                  disabled={isGenerating}
                >
                  {isGenerating ? t('general.loading') : t('otp.setup')}
                </button>
              ) : (
                <button className="nb-btn nb-btn-secondary" onClick={() => setStep('disable')}>
                  {t('otp.disable')}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'setup' && (
          <div>
            <div className="mb-6">
              <h3 className="nb-card-title mb-4">{t('otp.setupTitle')}</h3>
              <p className="mb-4">{t('otp.setupDescription')}</p>

              {qrCode && (
                <div className="flex justify-center mb-6">
                  <Image
                    src={qrCode}
                    alt="QR Code for OTP setup"
                    width={200}
                    height={200}
                    style={{
                      border: '4px solid black',
                      borderRadius: '8px',
                    }}
                  />
                </div>
              )}

              <div className="mb-4">
                <label className="nb-label">{t('otp.manualKey')}</label>
                <div className="nb-input nb-monospace">{secret}</div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                className="nb-btn nb-btn-primary"
                onClick={handleSetupOtp}
                disabled={isEnabling}
              >
                {isEnabling ? t('general.loading') : t('otp.enable')}
              </button>
              <button
                className="nb-btn nb-btn-ghost"
                onClick={() => {
                  setStep('status');
                  setSecret('');
                  setQrCode('');
                }}
              >
                {t('general.cancel')}
              </button>
            </div>
          </div>
        )}

        {step === 'disable' && (
          <div>
            <div className="mb-6">
              <h3 className="nb-card-title mb-4">{t('otp.disableTitle')}</h3>
              <p className="mb-4">{t('otp.disableDescription')}</p>
            </div>

            <div className="flex gap-4">
              <button className="nb-btn nb-btn-danger" onClick={handleDisableOtp}>
                {t('otp.disable')}
              </button>
              <button
                className="nb-btn nb-btn-ghost"
                onClick={() => {
                  setStep('status');
                }}
              >
                {t('general.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
