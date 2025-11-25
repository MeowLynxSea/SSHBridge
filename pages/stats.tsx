import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../components/AuthContext';
import { useMobile } from '../components/ResponsiveLayout';
import BandwidthMonitor from '../components/BandwidthMonitor';

interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  external_port: number;
  max_bandwidth?: number;
  created_at: string;
  is_online?: boolean;
}

export default function StatsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tunnelStatuses, setTunnelStatuses] = useState<Map<number, boolean>>(new Map());
  const [selectedTunnelForBandwidth, setSelectedTunnelForBandwidth] = useState<Tunnel | null>(null);
  const { isMobile, isSmallMobile } = useMobile();

  const fetchTunnelStatuses = useCallback(async () => {
    try {
      const response = await fetch('/api/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const statuses = new Map<number, boolean>();
        data.stats.forEach((stat: { tunnel_id: number; is_online: number }) => {
          statuses.set(stat.tunnel_id, stat.is_online === 1);
        });
        setTunnelStatuses(statuses);
      }
    } catch (err) {
      console.error(t('console.failedToFetchTunnelStatuses'), err);
    }
  }, [token, t]);

  const fetchTunnels = useCallback(async () => {
    try {
      const response = await fetch('/api/tunnels', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Set tunnels with online status
        const tunnelsWithStatus = data.tunnels.map((tunnel: Tunnel) => ({
          ...tunnel,
          is_online: tunnelStatuses.get(tunnel.id) || false
        }));
        
        setTunnels(tunnelsWithStatus);
      }
    } catch (err) {
      console.error(t('settings.failedToFetchTunnels'), err);
    } finally {
      setIsLoading(false);
    }
  }, [token, tunnelStatuses, t]);

  useEffect(() => {
    fetchTunnels();
    // Set up interval to fetch tunnel statuses
    const interval = setInterval(fetchTunnelStatuses, 5000);
    return () => clearInterval(interval);
  }, [token, fetchTunnelStatuses, fetchTunnels]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="nb-loader"></div>
          <h2 className="text-2xl font-bold">{t('general.loading')}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className={`nb-box nb-header`} style={{ 
        borderBottom: 'none', 
        padding: isSmallMobile ? '15px 0' : '20px 0', 
        boxShadow: 'none',
        position: 'relative'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isSmallMobile ? '0 15px' : '0 20px' }}>
          {/* Navigation */}
          {isMobile ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h1 className={`${isSmallMobile ? 'text-2xl' : 'text-3xl'} font-black uppercase`}>
                  SSH<span style={{ color: 'var(--accent-color)' }}>Bridge</span>
                </h1>
                <button 
                  className="nb-btn"
                  onClick={() => router.push('/')}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    boxShadow: 'none', 
                    padding: '5px',
                    fontSize: '1.2rem',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ←
                </button>
              </div>
              
              {/* Mobile Tabs */}
              <div className="nb-tabs">
                <button 
                  className="nb-tab"
                  onClick={() => router.push('/')}
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.tunnels')}
                </button>
                <button 
                  className="nb-tab nb-tab-active"
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.statistics')}
                </button>
                <button 
                  className="nb-tab"
                  onClick={() => router.push('/settings')}
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.settings')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className="text-4xl font-black uppercase">
                  SSH<span style={{ color: 'var(--accent-color)' }}>Bridge</span>
                </h1>
                <button 
                  className="nb-btn" 
                  onClick={() => router.push('/')}
                  style={{ 
                    background: 'var(--gray-light)', 
                    color: 'var(--fg-color)' 
                  }}
                >
                  ← {t('general.back')}
                </button>
              </div>
              
              {/* Tabs */}
              <div className="nb-tabs">
                <button 
                  className="nb-tab"
                  onClick={() => router.push('/')}
                >
                  {t('tunnelManager.tunnels')}
                </button>
                <button 
                  className="nb-tab nb-tab-active"
                >
                  {t('tunnelManager.statistics')}
                </button>
                <button 
                  className="nb-tab"
                  onClick={() => router.push('/settings')}
                >
                  {t('tunnelManager.settings')}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        padding: isSmallMobile ? '0 15px' : '0 20px' 
      }}>
        <div style={{ marginTop: isSmallMobile ? '20px' : '40px' }}>
          <div className="nb-box nb-card">
            <div className="nb-card-header">
              <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>{t('tunnelManager.statistics')}</h2>
            </div>
            <div className="nb-card-body">
              {/* Content will be the same as TunnelStats component */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {tunnels.length === 0 ? (
                  <div className="nb-box" style={{ padding: '20px', textAlign: 'center' }}>
                    <p>{t('tunnelManager.noTunnels')}</p>
                  </div>
                ) : (
                  <div>
                    {isMobile ? (
                      // Mobile card-based layout
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {tunnels.map((tunnel) => (
                          <div key={tunnel.id} className="nb-box" style={{ padding: '15px' }}>
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                marginBottom: '10px'
                              }}>
                                <h3 style={{ 
                                  fontWeight: 'bold', 
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: '1.1rem'
                                }}>
                                  {tunnel.name}
                                </h3>
                                <div 
                                  className="nb-badge"
                                  style={{ 
                                    backgroundColor: tunnel.is_online ? 'var(--accent-color)' : 'var(--gray-light)',
                                    color: tunnel.is_online ? 'var(--bg-color)' : 'var(--fg-color)'
                                  }}
                                >
                                  {t('tunnelManager.externalPort')} {tunnel.external_port}
                                </div>
                              </div>
                              
                              <div style={{ marginBottom: '10px' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                  {t('tunnelManager.status')}: 
                                  <span className="nb-badge" style={{ 
                                    backgroundColor: tunnel.is_online ? 'var(--accent-color)' : 'var(--gray-light)',
                                    color: tunnel.is_online ? 'var(--bg-color)' : 'var(--fg-color)',
                                    marginLeft: '5px',
                                    padding: '2px 6px',
                                    fontSize: '0.8rem'
                                  }}>
                                    {tunnel.is_online ? t('tunnelManager.online') : t('tunnelManager.offline')}
                                  </span>
                                </span>
                              </div>
                              
                              {tunnel.is_online && (
                                <button
                                  className="nb-btn"
                                  style={{ width: '100%', fontSize: '0.9rem' }}
                                  onClick={() => setSelectedTunnelForBandwidth(tunnel)}
                                >
                                  {t('tunnelManager.bandwidthMonitor')}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // Desktop table layout
                      <table className="nb-table">
                        <thead>
                          <tr>
                            <th>{t('tunnelManager.name')}</th>
                            <th>{t('tunnelManager.externalPort')}</th>
                            <th>{t('tunnelManager.status')}</th>
                            <th style={{ textAlign: 'right' }}>{t('tunnelManager.actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tunnels.map((tunnel) => (
                            <tr key={tunnel.id}>
                              <td className="font-medium">{tunnel.name}</td>
                              <td>
                                <span className="nb-badge">{tunnel.external_port}</span>
                              </td>
                              <td>
                                <span 
                                  className="nb-badge"
                                  style={{ 
                                    backgroundColor: tunnel.is_online ? 'var(--accent-color)' : 'var(--gray-light)',
                                    color: tunnel.is_online ? 'var(--bg-color)' : 'var(--fg-color)'
                                  }}
                                >
                                  {tunnel.is_online ? t('tunnelManager.online') : t('tunnelManager.offline')}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {tunnel.is_online && (
                                  <button
                                    className="nb-btn"
                                    style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                    onClick={() => setSelectedTunnelForBandwidth(tunnel)}
                                  >
                                    {t('tunnelManager.bandwidthMonitor')}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bandwidth Monitor Dialog */}
      {selectedTunnelForBandwidth && (
        <BandwidthMonitor
          tunnel={selectedTunnelForBandwidth}
          isOpen={!!selectedTunnelForBandwidth}
          onClose={() => setSelectedTunnelForBandwidth(null)}
        />
      )}
    </div>
  );
}