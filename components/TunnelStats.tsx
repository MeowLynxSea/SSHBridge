import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { formatForDisplay } from '../src/utils/timeUtils';
import { useMobile } from './ResponsiveLayout';

interface TunnelStatsResponse {
  id: number;
  tunnel_id: number;
  total_bytes_received: number;
  total_bytes_sent: number;
  current_bytes_received: number;
  current_bytes_sent: number;
  active_connections: number;
  is_online: number;
  created_at: string;
  updated_at: string;
  tunnel_name: string;
  external_port: number;
  user_id: number;
  formatted?: {
    total_bytes_received: string;
    total_bytes_sent: string;
    current_bytes_received: string;
    current_bytes_sent: string;
    rate_received: string;
    rate_sent: string;
  };
  realtimeStats?: {
    timestamp: Date;
    bytes_per_second_received: number;
    bytes_per_second_sent: number;
  };
}

export default function TunnelStats() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [stats, setStats] = useState<TunnelStatsResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // Default 5 seconds
  const { isMobile, isSmallMobile } = useMobile();

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      } else {
        const errorData = await response.json();
        setError(errorData.error || t('console.failedToFetchStatistics'));
      }
    } catch (err) {
      console.error(t('console.failedToFetchStatistics'), err);
      setError(t('settings.networkError'));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    // Also fetch the refresh interval
    const fetchRefreshInterval = async () => {
      try {
        const response = await fetch('/api/settings', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.refreshInterval) {
            setRefreshInterval(data.refreshInterval);
          }
        }
      } catch (err) {
        console.error('Failed to fetch refresh interval:', err);
      }
    };

    fetchStats();
    fetchRefreshInterval();
  }, [fetchStats, token]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchStats, refreshInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [token, autoRefresh, fetchStats, refreshInterval]);

  const formatDate = (dateString: string) => {
    return formatForDisplay(dateString);
  };

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{ padding: isSmallMobile ? '20px' : '40px' }}
      >
        <div className="nb-loader"></div>
        <h2
          className={`font-bold ${isSmallMobile ? 'text-lg' : 'text-2xl'}`}
          style={{ marginTop: '20px' }}
        >
          {t('tunnelManager.loadingStatistics')}
        </h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="nb-box nb-card">
        <div className="nb-card-header">
          <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>
            {t('tunnelManager.tunnelStatistics')}
          </h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isSmallMobile ? '10px' : '15px',
              flexWrap: isMobile ? 'wrap' : 'nowrap',
            }}
          >
            <div className="nb-checkbox-wrapper" style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                id="auto-refresh"
                className="nb-checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span className="nb-checkmark"></span>
              <label
                htmlFor="auto-refresh"
                className="nb-label"
                style={{
                  margin: 0,
                  marginBottom: 0,
                  fontSize: isSmallMobile ? '0.8rem' : '0.9rem',
                }}
              >
                {t('tunnelManager.autoRefresh', {
                  seconds: refreshInterval / 1000,
                })}
              </label>
            </div>
            <button
              className="nb-btn"
              onClick={fetchStats}
              style={{
                padding: isSmallMobile ? '6px 10px' : '8px 12px',
                fontSize: isSmallMobile ? '0.75rem' : '0.8rem',
              }}
            >
              {t('tunnelManager.refreshNow')}
            </button>
          </div>
        </div>

        <div className="nb-card-body">
          <p style={{ marginBottom: '20px' }}>{t('tunnelManager.monitorTraffic')}</p>

          {error && <div className="nb-alert nb-alert-destructive">{error}</div>}

          {stats.length === 0 ? (
            <div
              className="nb-box"
              style={{
                padding: isSmallMobile ? '20px' : '40px',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontFamily: 'monospace',
                  fontSize: isSmallMobile ? '1rem' : '1.1rem',
                }}
              >
                NO STATISTICS AVAILABLE. CREATE SOME TUNNELS TO START TRACKING USAGE.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {stats.map((stat) => (
                <div key={stat.id} className="nb-box nb-card" style={{ position: 'relative' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: isMobile ? 'flex-start' : 'flex-start',
                      marginBottom: '20px',
                      padding: isSmallMobile ? '15px' : '20px',
                      flexDirection: isMobile ? 'column' : 'row',
                    }}
                  >
                    <div style={{ marginBottom: isMobile ? '10px' : '0' }}>
                      <h3
                        style={{
                          fontSize: isSmallMobile ? '1.25rem' : '1.5rem',
                          fontWeight: 'bold',
                          fontFamily: 'var(--font-sans)',
                          textTransform: 'uppercase',
                          marginBottom: '5px',
                        }}
                      >
                        {stat.tunnel_name}
                      </h3>
                      <p
                        style={{
                          fontFamily: 'monospace',
                          fontSize: isSmallMobile ? '0.9rem' : '1rem',
                        }}
                      >
                        {t('tunnelManager.externalPort')}: {stat.external_port}
                      </p>
                    </div>
                    <div
                      className="nb-badge"
                      style={{
                        background: stat.is_online ? 'var(--accent-color)' : 'var(--gray-light)',
                        color: stat.is_online ? 'var(--bg-color)' : 'var(--fg-color)',
                        fontSize: isSmallMobile ? '0.8rem' : '0.9rem',
                        padding: isSmallMobile ? '4px 8px' : '4px 8px',
                        alignSelf: isMobile ? 'flex-start' : 'flex-end',
                      }}
                    >
                      {stat.is_online
                        ? `${stat.active_connections} ${t('tunnelManager.active')}`
                        : t('tunnelManager.inactive')}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isSmallMobile
                        ? '1fr'
                        : isMobile
                          ? 'repeat(auto-fit, minmax(200px, 1fr))'
                          : 'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: isSmallMobile ? '10px' : '15px',
                      padding: '0 20px 20px',
                    }}
                  >
                    <div className="nb-box" style={{ padding: '15px' }}>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          marginBottom: '10px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {t('tunnelManager.totalTraffic')}
                      </div>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: '5px',
                          }}
                        >
                          <span>{t('tunnelManager.received')}:</span>
                          <span>{stat.formatted?.total_bytes_received}</span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{t('tunnelManager.sent')}:</span>
                          <span>{stat.formatted?.total_bytes_sent}</span>
                        </div>
                      </div>
                    </div>

                    {stat.is_online && (
                      <>
                        <div className="nb-box" style={{ padding: '15px' }}>
                          <div
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              marginBottom: '10px',
                              fontFamily: 'monospace',
                            }}
                          >
                            {t('tunnelManager.currentSession')}
                          </div>
                          <div
                            style={{
                              fontSize: '0.9rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '5px',
                              }}
                            >
                              <span>{t('tunnelManager.received')}:</span>
                              <span>{stat.formatted?.current_bytes_received}</span>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span>{t('tunnelManager.sent')}:</span>
                              <span>{stat.formatted?.current_bytes_sent}</span>
                            </div>
                          </div>
                        </div>

                        <div className="nb-box" style={{ padding: '15px' }}>
                          <div
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              marginBottom: '10px',
                              fontFamily: 'monospace',
                            }}
                          >
                            Real-time Rate
                          </div>
                          <div
                            style={{
                              fontSize: '0.9rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '5px',
                              }}
                            >
                              <span>{t('tunnelManager.received')}:</span>
                              <span>{stat.formatted?.rate_received}</span>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span>{t('tunnelManager.sent')}:</span>
                              <span>{stat.formatted?.rate_sent}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: '0.8rem',
                      opacity: 0.7,
                      marginTop: '10px',
                      padding: '0 20px 20px',
                      fontFamily: 'monospace',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: isSmallMobile ? 'flex-start' : 'center',
                      flexDirection: isSmallMobile ? 'column' : 'row',
                      gap: isSmallMobile ? '5px' : '0',
                    }}
                  >
                    <span>
                      {t('tunnelManager.lastUpdated')}: {formatDate(stat.updated_at)}
                    </span>
                  </div>

                  <div
                    style={{
                      position: 'absolute',
                      right: isSmallMobile ? '10px' : '20px',
                      top: isSmallMobile ? '10px' : '20px',
                      border: '1px dashed var(--accent-color)',
                      padding: '5px',
                      transform: 'rotate(-2deg)',
                      fontSize: isSmallMobile ? '0.55rem' : '0.6rem',
                      fontFamily: 'monospace',
                      background: stat.is_online ? 'var(--accent-color)' : 'var(--gray-light)',
                      color: stat.is_online ? 'var(--bg-color)' : 'var(--fg-color)',
                    }}
                  >
                    {stat.is_online ? t('tunnelManager.online') : t('tunnelManager.offline')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
