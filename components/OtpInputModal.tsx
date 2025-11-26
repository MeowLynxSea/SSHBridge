import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMobile } from './ResponsiveLayout';
import Modal from './Modal';

interface OtpInputModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  onConfirm: (otpToken: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function OtpInputModal({
  isOpen,
  title,
  description,
  onConfirm,
  onCancel,
  isLoading = false,
}: OtpInputModalProps) {
  const { t } = useTranslation();
  const { isSmallMobile } = useMobile();
  const [otpToken, setOtpToken] = useState('');

  const handleConfirm = async () => {
    if (otpToken.length === 6) {
      try {
        await onConfirm(otpToken);
        setOtpToken(''); // Reset after successful submission
      } catch {
        // Error is handled by the component that called onConfirm
        // We don't reset the token on error so user can try again
      }
    }
  };

  const handleCancel = () => {
    onCancel();
    setOtpToken(''); // Reset on cancel
  };

  // Reset OTP token when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setOtpToken('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} maxWidth="400px">
      <div className="nb-dialog-header">
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: '900',
            textTransform: 'uppercase',
            fontSize: isSmallMobile ? '1.2rem' : '1.5rem',
            marginBottom: '8px',
          }}
        >
          {title || t('otp.verificationRequired')}
        </h2>
        {description && (
          <p
            style={{
              fontSize: isSmallMobile ? '0.9rem' : '1rem',
              color: 'var(--fg-color)',
              opacity: 0.7,
              margin: 0,
            }}
          >
            {description}
          </p>
        )}
      </div>

      <div className="nb-dialog-body">
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label className="nb-label" htmlFor="otpToken">
            {t('otp.verificationCode')}
          </label>
          <input
            className="nb-input"
            id="otpToken"
            type="text"
            autoComplete="one-time-code"
            autoFocus
            required
            placeholder={t('otp.verificationPlaceholder')}
            value={otpToken}
            onChange={(e) => {
              // Only allow numbers and limit to 6 digits
              const value = e.target.value.replace(/\D/g, '').slice(0, 6);
              setOtpToken(value);
            }}
            maxLength={6}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && otpToken.length === 6) {
                handleConfirm();
              }
            }}
            style={{
              fontSize: '1.5rem',
              letterSpacing: '0.3em',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            flexDirection: isSmallMobile ? 'column' : 'row',
          }}
        >
          <button
            className="nb-btn"
            style={{
              fontSize: isSmallMobile ? '0.9rem' : '1rem',
              width: isSmallMobile ? '100%' : 'auto',
            }}
            onClick={handleCancel}
            disabled={isLoading}
          >
            {t('general.cancel')}
          </button>
          <button
            className="nb-btn nb-btn-primary"
            style={{
              fontSize: isSmallMobile ? '0.9rem' : '1rem',
              width: isSmallMobile ? '100%' : 'auto',
            }}
            onClick={handleConfirm}
            disabled={isLoading || otpToken.length !== 6}
          >
            {isLoading ? t('general.loading') : t('general.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
