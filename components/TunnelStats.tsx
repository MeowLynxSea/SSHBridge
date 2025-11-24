import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { formatForDisplay } from '../src/utils/timeUtils';


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
  const { token } = useAuth();
  const [stats, setStats] = useState<TunnelStatsResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // Default 5 seconds

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to fetch statistics');
      }
    } catch (err) {
      console.error('Failed to fetch statistics:', err);
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Also fetch the refresh interval
    const fetchRefreshInterval = async () => {
      try {
        const response = await fetch('/api/settings', {
          headers: {
            'Authorization': `Bearer ${token}`,
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
      <div className="flex flex-col items-center justify-center" style={{ padding: '40px' }}>
        <div className="nb-loader"></div>
        <h2 className="text-2xl font-bold" style={{ marginTop: '20px' }}>LOADING STATISTICS...</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="nb-box nb-card">
        <div className="nb-card-header">
          <h2 className="nb-card-title">TUNNEL STATISTICS</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="nb-checkbox-wrapper">
              <input
                type="checkbox"
                id="auto-refresh"
                className="nb-checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span className="nb-checkmark"></span>
              <label htmlFor="auto-refresh" className="nb-label" style={{ margin: 0, marginBottom: 0 }}>
                AUTO-REFRESH ({refreshInterval / 1000}s)
              </label>
            </div>
            <button 
              className="nb-btn"
              onClick={fetchStats}
              style={{ padding: '8px 12px', fontSize: '0.8rem' }}
            >
              REFRESH NOW
            </button>
          </div>
        </div>
        
        <div className="nb-card-body">
          <p style={{ marginBottom: '20px' }}>
            Monitor your tunnel traffic and connection status in real-time
          </p>
          
          {error && (
            <div className="nb-alert nb-alert-destructive">
              {error}
            </div>
          )}

          {stats.length === 0 ? (
            <div className="nb-box" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>
                NO STATISTICS AVAILABLE. CREATE SOME TUNNELS TO START TRACKING USAGE.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {stats.map((stat) => (
                <div key={stat.id} className="nb-box nb-card">
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start', 
                    marginBottom: '20px',
                    padding: '20px'
                  }}>
                    <div>
                      <h3 style={{ 
                        fontSize: '1.5rem', 
                        fontWeight: 'bold', 
                        fontFamily: 'var(--font-sans)',
                        textTransform: 'uppercase'
                      }}>
                        {stat.tunnel_name}
                      </h3>
                      <p style={{ fontFamily: 'monospace' }}>
                        EXTERNAL PORT: {stat.external_port}
                      </p>
                    </div>
                    <div 
                      className="nb-badge"
                      style={{ 
                        background: stat.is_online ? 'var(--accent-color)' : 'var(--gray-light)',
                        color: stat.is_online ? 'var(--bg-color)' : 'var(--fg-color)'
                      }}
                    >
                      {stat.is_online ? `${stat.active_connections} ACTIVE` : 'INACTIVE'}
                    </div>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                    gap: '15px',
                    padding: '0 20px 20px'
                  }}>
                    <div className="nb-box" style={{ padding: '15px' }}>
                      <div style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: 'bold', 
                        textTransform: 'uppercase',
                        marginBottom: '10px',
                        fontFamily: 'monospace'
                      }}>
                        Total Traffic
                      </div>
                      <div style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span>Received:</span>
                          <span>{stat.formatted?.total_bytes_received}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Sent:</span>
                          <span>{stat.formatted?.total_bytes_sent}</span>
                        </div>
                      </div>
                    </div>
                    
                    {stat.is_online && (
                      <>
                        <div className="nb-box" style={{ padding: '15px' }}>
                          <div style={{ 
                            fontSize: '0.8rem', 
                            fontWeight: 'bold', 
                            textTransform: 'uppercase',
                            marginBottom: '10px',
                            fontFamily: 'monospace'
                          }}>
                            Current Session
                          </div>
                          <div style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                              <span>Received:</span>
                              <span>{stat.formatted?.current_bytes_received}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Sent:</span>
                              <span>{stat.formatted?.current_bytes_sent}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="nb-box" style={{ padding: '15px' }}>
                          <div style={{ 
                            fontSize: '0.8rem', 
                            fontWeight: 'bold', 
                            textTransform: 'uppercase',
                            marginBottom: '10px',
                            fontFamily: 'monospace'
                          }}>
                            Real-time Rate
                          </div>
                          <div style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                              <span>Received:</span>
                              <span>{stat.formatted?.rate_received}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Sent:</span>
                              <span>{stat.formatted?.rate_sent}</span>
                            </div>
                          </div>
                        </div>
                        

                      </>
                    )}
                  </div>

                  <div style={{ 
                    fontSize: '0.8rem', 
                    opacity: 0.7,
                    marginTop: '10px',
                    padding: '0 20px 20px',
                    fontFamily: 'monospace',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>Last updated: {formatDate(stat.updated_at)}</span>
                  </div>

                  <div style={{ 
                    position: 'absolute', 
                    right: '20px', 
                    top: '20px', 
                    border: '1px dashed var(--accent-color)', 
                    padding: '5px', 
                    transform: 'rotate(-2deg)', 
                    fontSize: '0.6rem',
                    fontFamily: 'monospace',
                    background: stat.is_online ? 'var(--accent-color)' : 'var(--gray-light)',
                    color: stat.is_online ? 'var(--bg-color)' : 'var(--fg-color)'
                  }}>
                    {stat.is_online ? 'ONLINE' : 'OFFLINE'}
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