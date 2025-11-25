import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMobile } from './ResponsiveLayout';
import Modal from './Modal';

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
  const { isSmallMobile } = useMobile();

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
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
    </Modal>
  );
}