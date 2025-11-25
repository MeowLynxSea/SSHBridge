import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeContext';
import { useMobile } from './ResponsiveLayout';
import Tunnel from '../types/Tunnel';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  tunnel: Tunnel | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmDialog({
  isOpen,
  tunnel,
  onClose,
  onConfirm
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation();
  const { effectiveTheme } = useTheme();
  const { isMobile, isSmallMobile } = useMobile();

  if (!isOpen || !tunnel) return null;

  return (
    <div className="nb-dialog-overlay" style={{ display: 'grid' }}>
      <div 
        className="nb-dialog-card" 
        data-theme={effectiveTheme}
        style={{ 
          margin: isMobile ? '0 10px' : 'auto',
          maxWidth: isSmallMobile ? '95vw' : '400px'
        }}
      >
        <div className="nb-dialog-header">
          <h2 style={{ 
            fontFamily: 'var(--font-sans)', 
            fontWeight: '900', 
            textTransform: 'uppercase',
            fontSize: isSmallMobile ? '1.2rem' : '1.5rem'
          }}>
            {t('tunnelManager.delete')}
          </h2>
        </div>
        <div className="nb-dialog-body">
          <p style={{ 
            marginBottom: '15px',
            fontSize: isSmallMobile ? '0.9rem' : '1rem'
          }}>
            {t('tunnelManager.deleteConfirm')}
          </p>
          <div style={{
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: 'var(--gray-light)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: isSmallMobile ? '0.9rem' : '1rem'
          }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>{t('tunnelManager.name')}:</strong> {tunnel.name}
            </div>
            <div>
              <strong>{t('tunnelManager.externalPort')}:</strong> {tunnel.external_port}
            </div>
          </div>
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
                onConfirm();
                onClose();
              }}
            >
              {t('tunnelManager.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}