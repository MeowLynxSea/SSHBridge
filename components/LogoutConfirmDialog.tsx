import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeContext';
import { useMobile } from './ResponsiveLayout';

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  onLogout: () => void;
  onClose: () => void;
}

export default function LogoutConfirmDialog({ 
  isOpen, 
  onLogout, 
  onClose 
}: LogoutConfirmDialogProps) {
  const { t } = useTranslation();
  const { effectiveTheme } = useTheme();
  const { isMobile, isSmallMobile } = useMobile();

  if (!isOpen) return null;

  return (
    <div className="nb-dialog-overlay" style={{ display: 'grid' }}>
      <div 
        className="nb-dialog-card" 
        data-theme={effectiveTheme}
        style={{ 
          margin: isMobile ? '0 10px' : 'auto',
          maxWidth: isSmallMobile ? '95vw' : '500px'
        }}
      >
        <div className="nb-dialog-header">
          <h2 style={{ 
            fontFamily: 'var(--font-sans)', 
            fontWeight: '900', 
            textTransform: 'uppercase',
            fontSize: isSmallMobile ? '1.2rem' : '1.5rem'
          }}>
            {t('tunnelManager.logoutConfirmTitle')}
          </h2>
        </div>
        <div className="nb-dialog-body">
          <p style={{ 
            marginBottom: '20px',
            fontSize: isSmallMobile ? '0.9rem' : '1rem'
          }}>
            {t('tunnelManager.logoutConfirmMessage')}
          </p>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '10px',
            flexDirection: isSmallMobile ? 'column' : 'row'
          }}>
            <button
              className="nb-btn"
              style={{ 
                fontSize: isSmallMobile ? '0.9rem' : '1rem',
                width: isSmallMobile ? '100%' : 'auto'
              }}
              onClick={onClose}
            >
              {t('general.cancel')}
            </button>
            <button 
              className="nb-btn nb-btn-destructive" 
              style={{ 
                fontSize: isSmallMobile ? '0.9rem' : '1rem',
                width: isSmallMobile ? '100%' : 'auto'
              }}
              onClick={() => {
                onLogout();
                onClose();
              }}
            >
              {t('tunnelManager.logout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}