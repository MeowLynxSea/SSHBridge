import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { formatForDisplay } from '../src/utils/timeUtils.js';
import { useMobile } from './ResponsiveLayout.js';

interface BandwidthStats {
  tunnel_id: number;
  tunnel_name: string;
  max_bandwidth?: number;
  is_limited: boolean;
  current_bytes_received: number;
  current_bytes_sent: number;
  total_bytes_received: number;
  total_bytes_sent: number;
  active_connections: number;
  is_online: number;
  updated_at: string;
}

interface Tunnel {
  id: number;
  name: string;
  external_port: number;
  max_bandwidth?: number;
  is_online?: boolean;
}

interface BandwidthMonitorProps {
  tunnel: Tunnel;
  isOpen: boolean;
  onClose: () => void;
}

export default function BandwidthMonitor({ tunnel, isOpen, onClose }: BandwidthMonitorProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [stats, setStats] = useState<BandwidthStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { isSmallMobile } = useMobile();

  // Function to format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Function to fetch bandwidth stats
  const fetchStats = async () => {
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/tunnels/${tunnel.id}/bandwidth`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      } else {
        const errorData = await response.json();
        setError(errorData.error || t('console.failedToFetchBandwidthStats'));
      }
    } catch (err) {
      console.error(t('console.failedToFetchBandwidthStats'), err);
      setError(t('settings.networkError'));
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats when component opens or when tunnel changes
  useEffect(() => {
    if (isOpen && tunnel.id) {
      fetchStats();

      // Set up interval to refresh stats every 2 seconds
      const interval = setInterval(fetchStats, 2000);

      return () => clearInterval(interval);
    }
  }, [isOpen, tunnel.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Function to calculate utilization percentage
  const getUtilizationPercentage = (): number => {
    if (!stats || !stats.max_bandwidth) return 0;

    // Calculate current rate based on recent traffic
    // This is a simplified calculation - in a real scenario, you'd track rate over time
    const totalBytes = stats.current_bytes_received + stats.current_bytes_sent;
    const maxBytes = stats.max_bandwidth; // per second

    // This is a rough approximation for demonstration
    return Math.min(100, Math.round((totalBytes / maxBytes) * 100));
  };

  if (!isOpen) return null;

  return (
    <div className="nb-dialog-overlay" style={{ display: 'grid' }}>
      <div
        className="nb-dialog-card"
        style={{
          maxWidth: isSmallMobile ? '100%' : '700px',
          maxHeight: isSmallMobile ? '100vh' : '90vh',
          overflowY: 'auto',
        }}
      >
        <div className="nb-dialog-header">
          <h2
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: '900',
              textTransform: 'uppercase',
              fontSize: isSmallMobile ? '1.2rem' : '1.5rem',
            }}
          >
            {isSmallMobile ? t('tunnelManager.bandwidth') : t('tunnelManager.bandwidthMonitor')}:{' '}
            {tunnel.name}
          </h2>
          <button
            className="nb-btn"
            style={{
              background: 'none',
              border: 'none',
              boxShadow: 'none',
              padding: '5px',
            }}
            onClick={onClose}
          >
            {t('tunnelManager.close')}
          </button>
        </div>
        <div className="nb-dialog-body">
          {error && <div className="nb-alert nb-alert-destructive">{error}</div>}

          {loading && !stats && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div className="nb-loader" style={{ margin: '0 auto' }}></div>
              <p style={{ marginTop: '10px' }}>{t('tunnelManager.loadingBandwidth')}</p>
            </div>
          )}

          {stats && (
            <div>
              {/* Bandwidth Configuration */}
              <div className="nb-box nb-card" style={{ marginBottom: '20px' }}>
                <div className="nb-card-header">
                  <h3 className="nb-card-title">{t('tunnelManager.bandwidthConfiguration')}</h3>
                </div>
                <div className="nb-card-body">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <span>{t('tunnelManager.statusLabel')}</span>
                    <span className={`nb-badge ${stats.is_limited ? '' : 'nb-badge-success'}`}>
                      {stats.is_limited ? t('tunnelManager.limited') : t('tunnelManager.unlimited')}
                    </span>
                  </div>
                  {stats.max_bandwidth && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{t('tunnelManager.maxBandwidthLabel')}</span>
                      <span className="nb-badge">
                        {stats.max_bandwidth < 1024 * 1024
                          ? `${(stats.max_bandwidth / 1024).toFixed(1)}KB/s`
                          : `${(stats.max_bandwidth / (1024 * 1024)).toFixed(1)}MB/s`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Traffic Statistics */}
              <div className="nb-box nb-card" style={{ marginBottom: '20px' }}>
                <div className="nb-card-header">
                  <h3 className="nb-card-title">{t('tunnelManager.trafficStatistics')}</h3>
                </div>
                <div className="nb-card-body">
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '15px',
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          marginBottom: '10px',
                          fontSize: '0.9rem',
                          opacity: '0.8',
                        }}
                      >
                        {t('tunnelManager.currentSession')}
                      </h4>
                      <div
                        style={{
                          marginBottom: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{t('tunnelManager.received')}:</span>
                        <span>{formatBytes(stats.current_bytes_received)}</span>
                      </div>
                      <div
                        style={{
                          marginBottom: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{t('tunnelManager.sent')}:</span>
                        <span>{formatBytes(stats.current_bytes_sent)}</span>
                      </div>
                      <div
                        style={{
                          fontWeight: 'bold',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{t('tunnelManager.total')}</span>
                        <span>
                          {formatBytes(stats.current_bytes_received + stats.current_bytes_sent)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h4
                        style={{
                          marginBottom: '10px',
                          fontSize: '0.9rem',
                          opacity: '0.8',
                        }}
                      >
                        {t('tunnelManager.allTimeTotal')}
                      </h4>
                      <div
                        style={{
                          marginBottom: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{t('tunnelManager.received')}:</span>
                        <span>{formatBytes(stats.total_bytes_received)}</span>
                      </div>
                      <div
                        style={{
                          marginBottom: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{t('tunnelManager.sent')}:</span>
                        <span>{formatBytes(stats.total_bytes_sent)}</span>
                      </div>
                      <div
                        style={{
                          fontWeight: 'bold',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{t('tunnelManager.total')}</span>
                        <span>
                          {formatBytes(stats.total_bytes_received + stats.total_bytes_sent)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Info */}
              <div className="nb-box nb-card">
                <div className="nb-card-header">
                  <h3 className="nb-card-title">{t('tunnelManager.connectionInfo')}</h3>
                </div>
                <div className="nb-card-body">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <span>Active Connections:</span>
                    <span className="nb-badge">{stats.active_connections}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <span>Tunnel {t('tunnelManager.statusLabel')}</span>
                    <span className={`nb-badge ${stats.is_online ? 'nb-badge-success' : ''}`}>
                      {stats.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Last Updated:</span>
                    <span>{formatForDisplay(stats.updated_at)}</span>
                  </div>
                </div>
              </div>

              {/* Utilization Bar */}
              {stats.is_limited && stats.max_bandwidth && (
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ marginBottom: '10px' }}>
                    {t('tunnelManager.bandwidthUtilization')}
                  </h4>
                  <div
                    style={{
                      height: '20px',
                      backgroundColor: 'var(--gray-light)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      marginBottom: '5px',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${getUtilizationPercentage()}%`,
                        backgroundColor:
                          getUtilizationPercentage() > 80
                            ? 'var(--destructive-color)'
                            : 'var(--accent-color)',
                        transition: 'width 0.3s ease',
                        borderRadius: '10px',
                      }}
                    ></div>
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: '0.8' }}>
                    {getUtilizationPercentage()}% utilized (approximate)
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '20px', textAlign: 'right' }}>
            <button className="nb-btn" onClick={onClose}>
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
