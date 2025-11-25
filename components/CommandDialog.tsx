import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

interface Tunnel {
  id: number;
  name: string;
  external_port: number;
  max_bandwidth?: number;
  is_online?: boolean;
}

interface CommandDialogProps {
  tunnel: Tunnel;
  username: string;
  baseTunnelHost: string;
  baseTunnelPort: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandDialog({ 
  tunnel, 
  username, 
  baseTunnelHost, 
  baseTunnelPort,
  isOpen, 
  onClose 
}: CommandDialogProps) {
  const { t } = useTranslation();
  const [localIP, setLocalIP] = useState('localhost');
  const [localPort, setLocalPort] = useState('');
  const [error, setError] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      // Use setTimeout to avoid setting state synchronously during render
      setTimeout(() => {
        setLocalIP('localhost');
        setLocalPort('');
        setError('');
        setIsCopied(false);
      }, 0);
    }
  }, [isOpen]);

  const handleCopyCommand = async () => {
    setError('');
    
    // Validate inputs
    if (!localIP.trim()) {
      setError(t('tunnelManager.commandDialog.localIPRequired'));
      return;
    }
    
    if (!localPort.trim()) {
      setError(t('tunnelManager.commandDialog.localPortRequired'));
      return;
    }
    
    // Validate port is a valid number and within range
    const portNum = parseInt(localPort);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError(t('tunnelManager.commandDialog.invalidPort'));
      return;
    }
    
    // Generate command
    const command = `ssh -R ${tunnel.external_port}:${localIP}:${localPort} ${username}@${baseTunnelHost}`;
    
    try {
      await navigator.clipboard.writeText(command);
      setIsCopied(true);
    } catch {
      setError(t('tunnelManager.commandDialog.copyFailed'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="nb-dialog-header">
        <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: '900', textTransform: 'uppercase' }}>
          {t('tunnelManager.commandDialog.title')}
        </h2>
      </div>
      <div className="nb-dialog-body">
          <p style={{ marginBottom: '20px' }}>
            {t('tunnelManager.commandDialog.description', { tunnelName: tunnel.name, externalPort: tunnel.external_port })}
          </p>
          
          {error && (
            <div className="nb-alert nb-alert-destructive" style={{ marginBottom: '20px' }}>
              {error}
            </div>
          )}
          
          {isCopied ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ 
                fontSize: '3rem', 
                marginBottom: '15px'
              }}>
                ✓
              </div>
              <p style={{ 
                fontWeight: 'bold', 
                fontSize: '1.2rem',
                marginBottom: '15px'
              }}>
                {t('tunnelManager.commandDialog.success')}
              </p>
              <div style={{ 
                padding: '15px',
                backgroundColor: 'var(--gray-light)',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                wordBreak: 'break-all'
              }}>
                {baseTunnelPort === '22' 
                  ? `ssh -R ${tunnel.external_port}:${localIP}:${localPort} ${username}@${baseTunnelHost}`
                  : `ssh -p ${baseTunnelPort} -R ${tunnel.external_port}:${localIP}:${localPort} ${username}@${baseTunnelHost}`
                }
              </div>
              <button className="nb-btn nb-btn-primary" onClick={onClose} style={{ width: '100%', marginTop: '20px' }}>
                {t('general.close')}
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleCopyCommand(); }}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="nb-label" htmlFor="localIP">
                  {t('tunnelManager.commandDialog.localIP')}
                </label>
                <input
                  className="nb-input"
                  id="localIP"
                  value={localIP}
                  onChange={(e) => setLocalIP(e.target.value)}
                  placeholder={t('tunnelManager.commandDialog.localIPPlaceholder')}
                  required
                />
                <small style={{ color: 'var(--gray-medium)', display: 'block', marginTop: '5px' }}>
                  {t('tunnelManager.commandDialog.localIPDescription')}
                </small>
              </div>
              
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="nb-label" htmlFor="localPort">
                  {t('tunnelManager.commandDialog.localPort')}
                </label>
                <input
                  className="nb-input"
                  id="localPort"
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)}
                  placeholder={t('tunnelManager.commandDialog.localPortPlaceholder')}
                  required
                />
                <small style={{ color: 'var(--gray-medium)', display: 'block', marginTop: '5px' }}>
                  {t('tunnelManager.commandDialog.localPortDescription')}
                </small>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  className="nb-btn"
                  type="button"
                  onClick={onClose}
                >
                  {t('general.cancel')}
                </button>
                <button className="nb-btn nb-btn-primary" type="submit">
                  {t('tunnelManager.commandDialog.copyCommand')}
                </button>
              </div>
            </form>
          )}
        </div>
    </Modal>
  );
}