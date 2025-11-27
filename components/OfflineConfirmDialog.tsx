import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMobile } from './ResponsiveLayout.js';
import Modal from './Modal.js';
import Tunnel from '../types/Tunnel.js';

interface OfflineConfirmDialogProps {
  isOpen: boolean;
  tunnel: Tunnel | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function OfflineConfirmDialog({
  isOpen,
  tunnel,
  onClose,
  onConfirm,
}: OfflineConfirmDialogProps) {
  const { t } = useTranslation();
  const { isSmallMobile } = useMobile();

  if (!isOpen || !tunnel) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="400px">
      <div className="nb-dialog-header">
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: '900',
            textTransform: 'uppercase',
            fontSize: isSmallMobile ? '1.2rem' : '1.5rem',
          }}
        >
          {t('tunnelManager.offline')}
        </h2>
      </div>
      <div className="nb-dialog-body">
        <p
          style={{
            marginBottom: '15px',
            fontSize: isSmallMobile ? '0.9rem' : '1rem',
          }}
        >
          {t('tunnelManager.takeOfflineConfirm')}
        </p>
        <div
          style={{
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: 'var(--gray-light)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: isSmallMobile ? '0.9rem' : '1rem',
          }}
        >
          <div style={{ marginBottom: '8px' }}>
            <strong>{t('tunnelManager.name')}:</strong> {tunnel.name}
          </div>
          <div>
            <strong>{t('tunnelManager.externalPort')}:</strong> {tunnel.external_port}
          </div>
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
            onClick={onClose}
          >
            {t('general.cancel')}
          </button>
          <button
            className="nb-btn nb-btn-danger"
            style={{
              fontSize: isSmallMobile ? '0.9rem' : '1rem',
              width: isSmallMobile ? '100%' : 'auto',
            }}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {t('tunnelManager.offline')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
