import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import TunnelStats from './TunnelStats';
import Settings from './Settings';
import BandwidthMonitor from './BandwidthMonitor';
import CommandDialog from './CommandDialog';
import { formatForDisplay } from '../src/utils/timeUtils';
import { useMobile } from './ResponsiveLayout';
import Tunnel from '../types/Tunnel';


interface TunnelFormData {
  name: string;
  external_port: string;
  max_bandwidth: string;
}

export default function TunnelManager() {
  const { t } = useTranslation();
  const { token, logout, user } = useAuth();
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTunnel, setEditingTunnel] = useState<Tunnel | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'tunnels' | 'stats' | 'settings'>('tunnels');
  const [tunnelStatuses, setTunnelStatuses] = useState<Map<number, boolean>>(new Map());
  const [selectedTunnelForBandwidth, setSelectedTunnelForBandwidth] = useState<Tunnel | null>(null);
  const [selectedTunnelForCommand, setSelectedTunnelForCommand] = useState<Tunnel | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [baseTunnelHost, setBaseTunnelHost] = useState<string>('localhost');
  const [baseTunnelPort, setBaseTunnelPort] = useState<string>('22');
  const { isMobile, isSmallMobile } = useMobile();
  const [formData, setFormData] = useState<TunnelFormData>({
    name: '',
    external_port: '',
    max_bandwidth: ''
  });

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
      setError(t('settings.failedToFetchTunnels'));
    } finally {
      setIsLoading(false);
    }
  }, [token, tunnelStatuses, t]);

  useEffect(() => {
    fetchTunnels();
    fetchBaseTunnelHost();
    // Set up interval to fetch tunnel statuses
    const interval = setInterval(fetchTunnelStatuses, 5000);
    return () => clearInterval(interval);
  }, [token, fetchTunnelStatuses, fetchTunnels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const url = editingTunnel 
        ? `/api/tunnels/${editingTunnel.id}`
        : '/api/tunnels';
      
      const method = editingTunnel ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          external_port: parseInt(formData.external_port),
          max_bandwidth: formData.max_bandwidth ? parseInt(formData.max_bandwidth) : undefined,
        }),
      });

      if (response.ok) {
        setFormData({ name: '', external_port: '', max_bandwidth: '' });
        setShowForm(false);
        setEditingTunnel(null);
        fetchTunnels();
      } else {
        const error = await response.json();
        setError(error.error || t('tunnelManager.failedToSave'));
      }
    } catch (err) {
      console.error('Failed to save tunnel:', err);
      setError(t('settings.networkError'));
    }
  };

  const handleEdit = (tunnel: Tunnel) => {
    setEditingTunnel(tunnel);
    setFormData({
      name: tunnel.name,
      external_port: tunnel.external_port.toString(),
      max_bandwidth: tunnel.max_bandwidth ? tunnel.max_bandwidth.toString() : ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('tunnelManager.deleteConfirm'))) return;

    try {
      const response = await fetch(`/api/tunnels/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        fetchTunnels();
      } else {
        setError(t('settings.failedToDeleteTunnel'));
      }
    } catch (err) {
      console.error(t('settings.failedToDeleteTunnel'), err);
      setError(t('settings.networkError'));
    }
  };

  const fetchBaseTunnelHost = async () => {
    try {
      const response = await fetch('/api/config/base-tunnel-host');
      if (response.ok) {
        const data = await response.json();
        setBaseTunnelHost(data.baseTunnelHost);
        setBaseTunnelPort(data.baseTunnelPort);
      }
    } catch (err) {
      console.error('Failed to fetch base tunnel host and port:', err);
    }
  };



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
          {/* Mobile-friendly header layout */}
          {isMobile ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h1 className={`${isSmallMobile ? 'text-2xl' : 'text-3xl'} font-black uppercase`}>
                  SSH<span style={{ color: 'var(--accent-color)' }}>Bridge</span>
                </h1>
                <button 
                  className="nb-btn"
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
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
                  {showMobileMenu ? 'X' : '☰'}
                </button>
              </div>
              
              {/* Mobile Menu */}
              {showMobileMenu && (
                <div className="nb-box" style={{ marginBottom: '15px', padding: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button 
                      className="nb-btn nb-btn-accent w-full" 
                      onClick={() => {
                        setEditingTunnel(null);
                        setFormData({ name: '', external_port: '', max_bandwidth: '' });
                        setShowForm(true);
                        setShowMobileMenu(false);
                      }}
                      style={{ fontSize: isSmallMobile ? '0.9rem' : '1rem' }}
                    >
                      {t('tunnelManager.createTunnel')}
                    </button>
                    <button 
                      className="nb-btn w-full" 
                      onClick={() => {
                        logout();
                        setShowMobileMenu(false);
                      }}
                      style={{ fontSize: isSmallMobile ? '0.9rem' : '1rem' }}
                    >
                      {t('tunnelManager.logout')}
                    </button>
                  </div>
                </div>
              )}
              
              {/* Mobile Tabs */}
              <div className="nb-tabs">
                <button 
                  className={`nb-tab ${activeTab === 'tunnels' ? 'nb-tab-active' : ''}`}
                  onClick={() => setActiveTab('tunnels')}
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.tunnels')}
                </button>
                <button 
                  className={`nb-tab ${activeTab === 'stats' ? 'nb-tab-active' : ''}`}
                  onClick={() => setActiveTab('stats')}
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.statistics')}
                </button>
                <button 
                  className={`nb-tab ${activeTab === 'settings' ? 'nb-tab-active' : ''}`}
                  onClick={() => setActiveTab('settings')}
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
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <button 
                    className="nb-btn nb-btn-accent" 
                    onClick={() => {
                      setEditingTunnel(null);
                      setFormData({ name: '', external_port: '', max_bandwidth: '' });
                      setShowForm(true);
                    }}
                  >
                    {t('tunnelManager.createTunnel')}
                  </button>
                  <button className="nb-btn" onClick={logout}>
                    {t('tunnelManager.logout')}
                  </button>
                </div>
              </div>
              
              {/* Tabs */}
              <div className="nb-tabs">
                <button 
                  className={`nb-tab ${activeTab === 'tunnels' ? 'nb-tab-active' : ''}`}
                  onClick={() => setActiveTab('tunnels')}
                >
                  {t('tunnelManager.tunnels')}
                </button>
                <button 
                  className={`nb-tab ${activeTab === 'stats' ? 'nb-tab-active' : ''}`}
                  onClick={() => setActiveTab('stats')}
                >
                  {t('tunnelManager.statistics')}
                </button>
                <button 
                  className={`nb-tab ${activeTab === 'settings' ? 'nb-tab-active' : ''}`}
                  onClick={() => setActiveTab('settings')}
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
        {activeTab === 'tunnels' && (
          <div style={{ marginTop: isSmallMobile ? '20px' : '40px' }}>
            {error && (
              <div className="nb-alert nb-alert-destructive">
                {error}
              </div>
            )}

            {tunnels.length === 0 ? (
              <div className="nb-box nb-card">
                <div className="nb-card-header">
                  <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>{t('tunnelManager.noTunnels')}</h2>
                </div>
                <div className="nb-card-body">
                  <p style={{ marginBottom: '20px' }}>
                    {t('tunnelManager.createFirstTunnelDescription')}
                  </p>
                  <button 
                    className="nb-btn nb-btn-primary"
                    onClick={() => setShowForm(true)}
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    {t('tunnelManager.createFirstTunnel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="nb-box nb-card">
                <div className="nb-card-header">
                  <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>{t('tunnelManager.yourSshTunnels')}</h2>
                </div>
                <div className="nb-card-body">
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
                                {t('tunnelManager.maxBandwidth')}: {tunnel.max_bandwidth ? (
                                  <span className="nb-badge" style={{ 
                                    backgroundColor: 'var(--accent-color)',
                                    padding: '2px 6px',
                                    fontSize: '0.8rem'
                                  }}>
                                    {tunnel.max_bandwidth < 1024 * 1024 
                                      ? `${(tunnel.max_bandwidth / 1024).toFixed(1)}KB/s`
                                      : `${(tunnel.max_bandwidth / (1024 * 1024)).toFixed(1)}MB/s`
                                    }
                                  </span>
                                ) : (
                                  <span className="nb-badge" style={{ 
                                    backgroundColor: 'var(--gray-light)', 
                                    color: 'var(--fg-color)',
                                    padding: '2px 6px',
                                    fontSize: '0.8rem'
                                  }}>
                                    {t('tunnelManager.unlimited')}
                                  </span>
                                )}
                              </span>
                            </div>
                            
                            <div style={{ marginBottom: '15px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {t('tunnelManager.created')}: {formatForDisplay(tunnel.created_at)}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <button
                                className="nb-btn"
                                style={{ width: '100%', fontSize: '0.9rem' }}
                                onClick={() => setSelectedTunnelForCommand(tunnel)}
                              >
                                {t('tunnelManager.command')}
                              </button>
                              {tunnel.is_online && (
                                <button
                                  className="nb-btn"
                                  style={{ width: '100%', fontSize: '0.9rem' }}
                                  onClick={() => setSelectedTunnelForBandwidth(tunnel)}
                                >
                                  {t('tunnelManager.bandwidthMonitor')}
                                </button>
                              )}
                              <button
                                className="nb-btn"
                                style={{ width: '100%', fontSize: '0.9rem' }}
                                onClick={() => handleEdit(tunnel)}
                              >
                                {t('tunnelManager.edit')}
                              </button>
                              <button
                                className="nb-btn nb-btn-glitch"
                                style={{ width: '100%', fontSize: '0.9rem' }}
                                onClick={() => handleDelete(tunnel.id)}
                              >
                                {t('tunnelManager.delete')}
                              </button>
                            </div>
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
                          <th>{t('tunnelManager.maxBandwidth')}</th>
                          <th>{t('tunnelManager.created')}</th>
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
                              {tunnel.max_bandwidth ? (
                                <span className="nb-badge" style={{ backgroundColor: 'var(--accent-color)' }}>
                                  {tunnel.max_bandwidth < 1024 * 1024 
                                    ? `${(tunnel.max_bandwidth / 1024).toFixed(1)}KB/s`
                                    : `${(tunnel.max_bandwidth / (1024 * 1024)).toFixed(1)}MB/s`
                                  }
                                </span>
                              ) : (
                                <span className="nb-badge" style={{ backgroundColor: 'var(--gray-light)', color: 'var(--fg-color)' }}>
                                  {t('tunnelManager.unlimited')}
                                </span>
                              )}
                            </td>
                            <td>
                              {formatForDisplay(tunnel.created_at)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                  className="nb-btn"
                                  style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                  onClick={() => setSelectedTunnelForCommand(tunnel)}
                                >
                                  {t('tunnelManager.command')}
                                </button>
                                {tunnel.is_online && (
                                  <button
                                    className="nb-btn"
                                    style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                    onClick={() => setSelectedTunnelForBandwidth(tunnel)}
                                  >
                                    {t('tunnelManager.viewBandwidth')}
                                  </button>
                                )}
                                <button
                                  className="nb-btn"
                                  style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                  onClick={() => handleEdit(tunnel)}
                                >
                                  {t('tunnelManager.edit')}
                                </button>
                                <button
                                  className="nb-btn nb-btn-glitch"
                                  style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                  onClick={() => handleDelete(tunnel.id)}
                                >
                                  {t('tunnelManager.delete')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="nb-box nb-card" style={{ marginTop: isSmallMobile ? '20px' : '30px' }}>
              <div className="nb-card-header">
                <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>{t('tunnelManager.howToUseTunnels')}</h2>
              </div>
              <div className="nb-card-body">
                <ol style={{ lineHeight: isSmallMobile ? '1.6' : '1.8', paddingLeft: '20px' }}>
                  <li style={{ marginBottom: '10px' }}>{t('tunnelManager.connectInstruction')}</li>
                  <li style={{ marginBottom: '10px' }}>
                    {t('tunnelManager.usePortInstruction')}
                    <div style={{ 
                      marginTop: '5px',
                      padding: '8px', 
                      backgroundColor: 'var(--gray-light)', 
                      border: '1px solid var(--fg-color)',
                      fontFamily: 'monospace',
                      fontSize: isSmallMobile ? '0.8rem' : '0.9rem',
                      wordBreak: 'break-all',
                      overflowX: 'auto'
                    }}>
                      ssh -R {tunnels.length > 0 ? tunnels.map(t => t.external_port).join(', ') : 'PORT'}:localhost:LOCAL_PORT user@server
                    </div>
                  </li>
                  <li style={{ marginBottom: '10px' }}>{t('tunnelManager.connectExternalUsers')}</li>
                  <li style={{ marginBottom: '10px' }}>{t('tunnelManager.sshForward')}</li>
                  <li>
                    {t('tunnelManager.example')}
                    <div style={{ 
                      marginTop: '5px',
                      padding: '8px', 
                      backgroundColor: 'var(--gray-light)', 
                      border: '1px solid var(--fg-color)',
                      fontFamily: 'monospace',
                      fontSize: isSmallMobile ? '0.8rem' : '0.9rem',
                      wordBreak: 'break-all'
                    }}>
                      ssh -R 8080:localhost:3000 user@server
                    </div>
                    <div style={{ marginTop: '5px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {t('tunnelManager.exampleDescription')}
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'stats' && (
          <div style={{ marginTop: isSmallMobile ? '20px' : '40px' }}>
            <TunnelStats />
          </div>
        )}
        
        {activeTab === 'settings' && (
          <div style={{ marginTop: isSmallMobile ? '20px' : '40px' }}>
            <Settings />
          </div>
        )}
      </main>

      {/* Dialog for Create/Edit Tunnel */}
      {showForm && (
        <div className="nb-dialog-overlay" style={{ display: 'grid' }}>
          <div className="nb-dialog-card">
            <div className="nb-dialog-header">
              <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: '900', textTransform: 'uppercase' }}>
                {editingTunnel ? t('tunnelManager.editTunnel') : t('tunnelManager.createNewTunnel')}
              </h2>
              <button 
                className="nb-btn" 
                style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '5px' }}
                onClick={() => {
                  setShowForm(false);
                  setEditingTunnel(null);
                  setFormData({ name: '', external_port: '', max_bandwidth: '' });
                }}
              >
                {t('tunnelManager.close')}
              </button>
            </div>
            <div className="nb-dialog-body">
              <p style={{ marginBottom: '20px' }}>
                {editingTunnel 
                  ? t('tunnelManager.updateTunnel')
                  : t('tunnelManager.createTunnelDescription')
                }
              </p>
              
              {error && (
                <div className="nb-alert nb-alert-destructive">
                  {error}
                </div>
              )}
              
              <form onSubmit={handleSubmit}>
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="nb-label" htmlFor="name">
                    {t('tunnelManager.tunnelName')}
                  </label>
                  <input
                    className="nb-input"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('tunnelManager.tunnelNamePlaceholder')}
                    required
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
                    onChange={(e) => setFormData({ ...formData, external_port: e.target.value })}
                    placeholder={t('tunnelManager.portPlaceholder')}
                    required
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
                    onChange={(e) => setFormData({ ...formData, max_bandwidth: e.target.value })}
                    placeholder={t('tunnelManager.bandwidthPlaceholder')}
                  />
                  <small style={{ color: 'var(--gray-medium)', display: 'block', marginTop: '5px' }}>
                    {t('tunnelManager.bandwidthDescription')}
                  </small>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    className="nb-btn"
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingTunnel(null);
                      setFormData({ name: '', external_port: '', max_bandwidth: '' });
                    }}
                  >
                    {t('general.cancel')}
                  </button>
                  <button className="nb-btn nb-btn-primary" type="submit">
                    {editingTunnel ? t('tunnelManager.edit') : t('tunnelManager.create')} {t('tunnelManager.tunnel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Bandwidth Monitor Dialog */}
      {selectedTunnelForBandwidth && (
        <BandwidthMonitor
          tunnel={selectedTunnelForBandwidth}
          isOpen={!!selectedTunnelForBandwidth}
          onClose={() => setSelectedTunnelForBandwidth(null)}
        />
      )}
      
      {/* Command Dialog */}
      {selectedTunnelForCommand && user && (
        <CommandDialog
          tunnel={selectedTunnelForCommand}
          username={user.username}
          baseTunnelHost={baseTunnelHost}
          baseTunnelPort={baseTunnelPort}
          isOpen={!!selectedTunnelForCommand}
          onClose={() => setSelectedTunnelForCommand(null)}
        />
      )}



    </div>
  );
}

