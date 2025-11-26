import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMobile } from './ResponsiveLayout.js';
import Modal from './Modal.js';
import Tunnel from '../types/Tunnel.js';

interface TunnelFormData {
  name: string;
  external_port: string;
  max_bandwidth: string;
}

interface TunnelFormDialogProps {
  isOpen: boolean;
  editingTunnel: Tunnel | null;
  formData: TunnelFormData;
  error: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFormDataChange: (formData: TunnelFormData) => void;
  onErrorChange: (error: string) => void;
}

export default function TunnelFormDialog({
  isOpen,
  editingTunnel,
  formData,
  error,
  onClose,
  onSubmit,
  onFormDataChange,
  onErrorChange,
}: TunnelFormDialogProps) {
  const { t } = useTranslation();
  const { isSmallMobile } = useMobile();

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      onErrorChange('');
    }
  }, [isOpen, onErrorChange]);

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    // Reset form data when closing
    onFormDataChange({ name: '', external_port: '', max_bandwidth: '' });
    onErrorChange('');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="nb-dialog-header">
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: '900',
            textTransform: 'uppercase',
            fontSize: isSmallMobile ? '1.2rem' : '1.5rem',
          }}
        >
          {editingTunnel ? t('tunnelManager.editTunnel') : t('tunnelManager.createNewTunnel')}
        </h2>
      </div>
      <div className="nb-dialog-body">
        <p
          style={{
            marginBottom: '20px',
            fontSize: isSmallMobile ? '0.9rem' : '1rem',
          }}
        >
          {editingTunnel
            ? t('tunnelManager.updateTunnel')
            : t('tunnelManager.createTunnelDescription')}
        </p>

        {error && (
          <div className="nb-alert nb-alert-destructive" style={{ marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="nb-label" htmlFor="name">
              {t('tunnelManager.tunnelName')}
            </label>
            <input
              className="nb-input"
              id="name"
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              placeholder={t('tunnelManager.tunnelNamePlaceholder')}
              required
              style={{ fontSize: isSmallMobile ? '0.9rem' : '1rem' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="nb-label" htmlFor="external_port">
              {t('tunnelManager.externalPortRange')}
            </label>
            <input
              className="nb-input"
              id="external_port"
              type="number"
              value={formData.external_port}
              onChange={(e) => onFormDataChange({ ...formData, external_port: e.target.value })}
              placeholder={t('tunnelManager.portPlaceholder')}
              required
              style={{ fontSize: isSmallMobile ? '0.9rem' : '1rem' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="nb-label" htmlFor="max_bandwidth">
              {t('tunnelManager.maxBandwidthOptional')}
            </label>
            <input
              className="nb-input"
              id="max_bandwidth"
              type="number"
              value={formData.max_bandwidth}
              onChange={(e) => onFormDataChange({ ...formData, max_bandwidth: e.target.value })}
              placeholder={t('tunnelManager.bandwidthPlaceholder')}
              style={{ fontSize: isSmallMobile ? '0.9rem' : '1rem' }}
            />
            <small
              style={{
                color: 'var(--gray-medium)',
                display: 'block',
                marginTop: '5px',
                fontSize: isSmallMobile ? '0.8rem' : '0.9rem',
              }}
            >
              {t('tunnelManager.bandwidthDescription')}
            </small>
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
              type="button"
              onClick={handleClose}
              style={{
                fontSize: isSmallMobile ? '0.9rem' : '1rem',
                width: isSmallMobile ? '100%' : 'auto',
              }}
            >
              {t('general.cancel')}
            </button>
            <button
              className="nb-btn nb-btn-primary"
              type="submit"
              style={{
                fontSize: isSmallMobile ? '0.9rem' : '1rem',
                width: isSmallMobile ? '100%' : 'auto',
              }}
            >
              {editingTunnel ? t('tunnelManager.edit') : t('tunnelManager.create')}{' '}
              {t('tunnelManager.tunnel')}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
