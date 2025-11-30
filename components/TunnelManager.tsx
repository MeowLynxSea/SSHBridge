import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { useOtp } from './OtpContext.js';
import TunnelStats from './TunnelStats.js';
import Settings from './Settings.js';
import TunnelAnalysis from './TunnelAnalysis.js';
import BandwidthMonitor from './BandwidthMonitor.js';
import CommandDialog from './CommandDialog.js';
import LogoutConfirmDialog from './LogoutConfirmDialog.js';
import TunnelFormDialog from './TunnelFormDialog.js';
import DeleteConfirmDialog from './DeleteConfirmDialog.js';
import OfflineConfirmDialog from './OfflineConfirmDialog.js';
import Footer from './Footer.js';
import { formatForDisplay } from '../src/utils/timeUtils.js';
import { useMobile } from './ResponsiveLayout.js';
import Tunnel from '../types/Tunnel.js';

interface TunnelFormData {
  name: string;
  external_port: string;
  max_bandwidth: string;
}

export default function TunnelManager() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, logout, user, apiFetch } = useAuth();
  const { showOtpModal } = useOtp();
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTunnel, setEditingTunnel] = useState<Tunnel | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'tunnels' | 'stats' | 'analysis' | 'settings'>(
    'tunnels'
  );
  const [tunnelStatuses, setTunnelStatuses] = useState<Map<number, boolean>>(new Map());
  const [selectedTunnelForBandwidth, setSelectedTunnelForBandwidth] = useState<Tunnel | null>(null);
  const [selectedTunnelForCommand, setSelectedTunnelForCommand] = useState<Tunnel | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tunnelToDelete, setTunnelToDelete] = useState<Tunnel | null>(null);
  const [showOfflineConfirm, setShowOfflineConfirm] = useState(false);
  const [tunnelToOffline, setTunnelToOffline] = useState<Tunnel | null>(null);
  const [baseTunnelHost, setBaseTunnelHost] = useState<string>('localhost');
  const [baseTunnelPort, setBaseTunnelPort] = useState<string>('22');
  const { isMobile, isSmallMobile } = useMobile();
  const [formData, setFormData] = useState<TunnelFormData>({
    name: '',
    external_port: '',
    max_bandwidth: '',
  });

  const fetchTunnelStatuses = useCallback(async () => {
    try {
      const response = await apiFetch('/api/stats');

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
  }, [t, apiFetch]);

  const fetchTunnels = useCallback(async () => {
    try {
      const response = await apiFetch('/api/tunnels');

      if (response.ok) {
        const data = await response.json();

        // Set tunnels with online status
        const tunnelsWithStatus = data.tunnels.map((tunnel: Tunnel) => ({
          ...tunnel,
          is_online: tunnelStatuses.get(tunnel.id) || false,
        }));

        setTunnels(tunnelsWithStatus);
      }
    } catch (err) {
      console.error(t('settings.failedToFetchTunnels'), err);
      setError(t('settings.failedToFetchTunnels'));
    } finally {
      setIsLoading(false);
    }
  }, [tunnelStatuses, t, apiFetch]);

  const fetchBaseTunnelHost = useCallback(async () => {
    try {
      const response = await apiFetch('/api/config/base-tunnel-host');
      if (response.ok) {
        const data = await response.json();
        setBaseTunnelHost(data.baseTunnelHost);
        setBaseTunnelPort(data.baseTunnelPort);
      }
    } catch (err) {
      console.error('Failed to fetch base tunnel host and port:', err);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchTunnels();
    fetchBaseTunnelHost();
    // Set up interval to fetch tunnel statuses
    const interval = setInterval(fetchTunnelStatuses, 5000);
    return () => clearInterval(interval);
  }, [token, fetchTunnelStatuses, fetchTunnels, fetchBaseTunnelHost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const url = editingTunnel ? `/api/tunnels/${editingTunnel.id}` : '/api/tunnels';

      const method = editingTunnel ? 'PUT' : 'POST';

      const response = await apiFetch(url, {
        method,
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
      max_bandwidth: tunnel.max_bandwidth ? tunnel.max_bandwidth.toString() : '',
    });
    setShowForm(true);
  };

  const handleDelete = (tunnel: Tunnel) => {
    setTunnelToDelete(tunnel);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async (otpToken?: string) => {
    if (!tunnelToDelete) return;

    try {
      const response = await apiFetch(`/api/tunnels/${tunnelToDelete.id}`, {
        method: 'DELETE',
        body: JSON.stringify({
          otpToken,
        }),
      });

      if (response.ok) {
        fetchTunnels();
        setShowDeleteConfirm(false);
        setTunnelToDelete(null);
      } else {
        const data = await response.json();
        setError(data.error || t('settings.failedToDeleteTunnel'));
      }
    } catch (err) {
      console.error(t('settings.failedToDeleteTunnel'), err);
      setError(t('settings.networkError'));
    }
  };

  const handleDeleteConfirm = () => {
    if (!user?.otp_enabled) {
      confirmDelete();
      return;
    }

    showOtpModal({
      id: 'delete-tunnel',
      title: t('otp.tunnelDeleteOtpRequired'),
      description: t('otp.tunnelDeleteOtpDescription'),
      onConfirm: async (otpToken: string) => {
        confirmDelete(otpToken);
        setShowDeleteConfirm(false);
        setTunnelToDelete(null);
      },
    });
  };

  const handleTakeOffline = (tunnel: Tunnel) => {
    setTunnelToOffline(tunnel);
    setShowOfflineConfirm(true);
  };

  const confirmTakeOffline = async () => {
    if (!tunnelToOffline) return;

    try {
      const response = await apiFetch(`/api/tunnels/${tunnelToOffline.id}/disconnect`, {
        method: 'POST',
      });

      if (response.ok) {
        // Refresh tunnel data
        fetchTunnels();
        fetchTunnelStatuses();
        setShowOfflineConfirm(false);
        setTunnelToOffline(null);
        // Show success message
        setError('');
      } else {
        const data = await response.json();
        setError(data.error || t('settings.networkError'));
      }
    } catch (err) {
      console.error('Failed to take tunnel offline:', err);
      setError(t('settings.networkError'));
    }
  };

  const handleOfflineConfirm = () => {
    confirmTakeOffline();
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
      <header
        className={`nb-box nb-header`}
        style={{
          borderBottom: 'none',
          padding: isSmallMobile ? '15px 0' : '20px 0',
          boxShadow: 'none',
          position: 'relative',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: isSmallMobile ? '0 15px' : '0 20px',
          }}
        >
          {/* Mobile-friendly header layout */}
          {isMobile ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '15px',
                }}
              >
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
                    justifyContent: 'center',
                  }}
                >
                  {showMobileMenu ? 'X' : '☰'}
                </button>
              </div>

              {/* Mobile Menu */}
              {showMobileMenu && (
                <div className="nb-box" style={{ marginBottom: '15px', padding: '15px' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <button
                      className="nb-btn w-full"
                      onClick={() => {
                        setShowMobileMenu(false);
                        router.push('/account');
                      }}
                      style={{ fontSize: isSmallMobile ? '0.9rem' : '1rem' }}
                    >
                      {t('tunnelManager.accountManagement')}
                    </button>
                    <button
                      className="nb-btn w-full"
                      onClick={() => {
                        setShowMobileMenu(false);
                        setShowLogoutConfirm(true);
                      }}
                      style={{ fontSize: isSmallMobile ? '0.9rem' : '1rem' }}
                    >
                      {t('tunnelManager.logout')}
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile Tabs */}
              <div style={{ marginTop: '20px' }} className="nb-tabs">
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
                  className={`nb-tab ${activeTab === 'analysis' ? 'nb-tab-active' : ''}`}
                  onClick={() => setActiveTab('analysis')}
                  style={{ fontSize: isSmallMobile ? '0.85rem' : '1rem' }}
                >
                  {t('tunnelManager.analysis')}
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h1 className="text-4xl font-black uppercase">
                  SSH<span style={{ color: 'var(--accent-color)' }}>Bridge</span>
                </h1>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <button className="nb-btn" onClick={() => router.push('/account')}>
                    {t('tunnelManager.accountManagement')}
                  </button>
                  <button className="nb-btn" onClick={() => setShowLogoutConfirm(true)}>
                    {t('tunnelManager.logout')}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ marginTop: '25px' }} className="nb-tabs">
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
                  className={`nb-tab ${activeTab === 'analysis' ? 'nb-tab-active' : ''}`}
                  onClick={() => setActiveTab('analysis')}
                >
                  {t('tunnelManager.analysis')}
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
      <main
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: isSmallMobile ? '0 15px' : '0 20px',
        }}
      >
        {activeTab === 'tunnels' && (
          <div style={{ marginTop: isSmallMobile ? '20px' : '40px' }}>
            {error && <div className="nb-alert nb-alert-destructive">{error}</div>}

            {tunnels.length === 0 ? (
              <div className="nb-box nb-card">
                <div className="nb-card-header">
                  <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>
                    {t('tunnelManager.noTunnels')}
                  </h2>
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
                <div
                  className="nb-card-header"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>
                    {t('tunnelManager.yourSshTunnels')}
                  </h2>
                  <button
                    className="nb-btn"
                    onClick={() => {
                      setEditingTunnel(null);
                      setFormData({
                        name: '',
                        external_port: '',
                        max_bandwidth: '',
                      });
                      setShowForm(true);
                    }}
                    style={{
                      fontSize: isSmallMobile ? '0.75rem' : '1rem',
                      padding: isSmallMobile ? '4px 8px' : undefined,
                      minWidth: isSmallMobile ? '0' : undefined,
                      width: isSmallMobile ? 'auto' : undefined,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isSmallMobile ? '创建' : t('tunnelManager.createTunnel')}
                  </button>
                </div>
                <div className="nb-card-body">
                  {isMobile ? (
                    // Mobile card-based layout
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '15px',
                      }}
                    >
                      {tunnels.map((tunnel) => (
                        <div key={tunnel.id} className="nb-box" style={{ padding: '15px' }}>
                          <div style={{ marginBottom: '10px' }}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '10px',
                              }}
                            >
                              <h3
                                style={{
                                  fontWeight: 'bold',
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: '1.1rem',
                                }}
                              >
                                {tunnel.name}
                              </h3>
                              <div
                                className="nb-badge"
                                style={{
                                  backgroundColor: tunnel.is_online
                                    ? 'var(--accent-color)'
                                    : 'var(--gray-light)',
                                  color: tunnel.is_online ? 'var(--bg-color)' : 'var(--fg-color)',
                                }}
                              >
                                {t('tunnelManager.externalPort')} {tunnel.external_port}
                              </div>
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.9rem',
                                }}
                              >
                                {t('tunnelManager.maxBandwidth')}:{' '}
                                {tunnel.max_bandwidth ? (
                                  <span
                                    className="nb-badge"
                                    style={{
                                      backgroundColor: 'var(--accent-color)',
                                      padding: '2px 6px',
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    {tunnel.max_bandwidth < 1024 * 1024
                                      ? `${(tunnel.max_bandwidth / 1024).toFixed(1)}KB/s`
                                      : `${(tunnel.max_bandwidth / (1024 * 1024)).toFixed(1)}MB/s`}
                                  </span>
                                ) : (
                                  <span
                                    className="nb-badge"
                                    style={{
                                      backgroundColor: 'var(--gray-light)',
                                      color: 'var(--fg-color)',
                                      padding: '2px 6px',
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    {t('tunnelManager.unlimited')}
                                  </span>
                                )}
                              </span>
                            </div>

                            <div
                              style={{
                                marginBottom: '15px',
                                fontFamily: 'monospace',
                                fontSize: '0.8rem',
                              }}
                            >
                              {t('tunnelManager.created')}: {formatForDisplay(tunnel.created_at)}
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '10px',
                                }}
                              >
                                <button
                                  className="nb-btn"
                                  style={{
                                    width: '100%',
                                    fontSize: '0.9rem',
                                  }}
                                  onClick={() => setSelectedTunnelForCommand(tunnel)}
                                >
                                  {t('tunnelManager.command')}
                                </button>
                                <button
                                  className="nb-btn nb-btn-danger"
                                  style={{
                                    width: '100%',
                                    fontSize: '0.9rem',
                                  }}
                                  onClick={() => handleTakeOffline(tunnel)}
                                >
                                  {t('tunnelManager.offline')}
                                </button>
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '10px',
                                }}
                              >
                                <button
                                  className="nb-btn"
                                  style={{
                                    flex: 1,
                                    fontSize: '0.9rem',
                                  }}
                                  onClick={() => handleEdit(tunnel)}
                                >
                                  {t('tunnelManager.edit')}
                                </button>
                                <button
                                  className="nb-btn nb-btn-danger"
                                  style={{
                                    flex: 1,
                                    fontSize: '0.9rem',
                                  }}
                                  onClick={() => handleDelete(tunnel)}
                                >
                                  {t('tunnelManager.delete')}
                                </button>
                              </div>
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
                                <span
                                  className="nb-badge"
                                  style={{
                                    backgroundColor: 'var(--accent-color)',
                                  }}
                                >
                                  {tunnel.max_bandwidth < 1024 * 1024
                                    ? `${(tunnel.max_bandwidth / 1024).toFixed(1)}KB/s`
                                    : `${(tunnel.max_bandwidth / (1024 * 1024)).toFixed(1)}MB/s`}
                                </span>
                              ) : (
                                <span
                                  className="nb-badge"
                                  style={{
                                    backgroundColor: 'var(--gray-light)',
                                    color: 'var(--fg-color)',
                                  }}
                                >
                                  {t('tunnelManager.unlimited')}
                                </span>
                              )}
                            </td>
                            <td>{formatForDisplay(tunnel.created_at)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '8px',
                                  justifyContent: 'flex-end',
                                }}
                              >
                                <button
                                  className="nb-btn"
                                  style={{
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                  }}
                                  onClick={() => setSelectedTunnelForCommand(tunnel)}
                                >
                                  {t('tunnelManager.command')}
                                </button>
                                <button
                                  className="nb-btn nb-btn-danger"
                                  style={{
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                  }}
                                  onClick={() => handleTakeOffline(tunnel)}
                                >
                                  {t('tunnelManager.offline')}
                                </button>
                                <button
                                  className="nb-btn"
                                  style={{
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                  }}
                                  onClick={() => handleEdit(tunnel)}
                                >
                                  {t('tunnelManager.edit')}
                                </button>
                                <button
                                  className="nb-btn nb-btn-danger"
                                  style={{
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                  }}
                                  onClick={() => handleDelete(tunnel)}
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
                <h2 className={`nb-card-title ${isSmallMobile ? 'text-lg' : ''}`}>
                  {t('tunnelManager.howToUseTunnels')}
                </h2>
              </div>
              <div className="nb-card-body">
                <ol
                  style={{
                    lineHeight: isSmallMobile ? '1.6' : '1.8',
                    paddingLeft: '20px',
                  }}
                >
                  <li style={{ marginBottom: '15px' }}>
                    <strong>{t('tunnelManager.step1Title')}</strong>
                    <div style={{ marginTop: '8px' }}>
                      {t('tunnelManager.step1Description')}
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '10px',
                          backgroundColor: 'var(--gray-light)',
                          border: '1px solid var(--fg-color)',
                          fontFamily: 'monospace',
                          fontSize: isSmallMobile ? '0.8rem' : '0.9rem',
                          wordBreak: 'break-all',
                          overflowX: 'auto',
                          borderRadius: '4px',
                        }}
                      >
                        {baseTunnelPort === '22'
                          ? `ssh -R ${tunnels.length > 0 ? tunnels[0]?.external_port || '8080' : '8080'}:localhost:3000 ${user?.username || 'your_username'}@${baseTunnelHost}`
                          : `ssh -p ${baseTunnelPort} -R ${tunnels.length > 0 ? tunnels[0]?.external_port || '8080' : '8080'}:localhost:3000 ${user?.username || 'your_username'}@${baseTunnelHost}`}
                      </div>
                    </div>
                  </li>
                  <li style={{ marginBottom: '15px' }}>
                    <strong>{t('tunnelManager.step2Title')}</strong>
                    <div style={{ marginTop: '8px' }}>
                      {t('tunnelManager.step2Description')}
                      <div style={{ marginTop: '8px' }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'var(--accent-color)',
                            color: 'var(--bg-color)',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.9rem',
                          }}
                        >
                          {baseTunnelHost}:
                          {tunnels.length > 0 ? tunnels[0]?.external_port || '8080' : '8080'}
                        </span>
                      </div>
                    </div>
                  </li>
                  <li>
                    <strong>{t('tunnelManager.step3Title')}</strong>
                    <div style={{ marginTop: '8px' }}>
                      {t('tunnelManager.step3Description')}
                      <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>
                        <ul
                          style={{
                            paddingLeft: '20px',
                            listStyleType: 'disc',
                          }}
                        >
                          <li style={{ marginBottom: '5px' }}>{t('tunnelManager.step3Option1')}</li>
                          <li style={{ marginBottom: '5px' }}>{t('tunnelManager.step3Option2')}</li>
                          <li>{t('tunnelManager.step3Note')}</li>
                        </ul>
                      </div>
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

        {activeTab === 'analysis' && <TunnelAnalysis tunnels={tunnels} />}

        {activeTab === 'settings' && (
          <div style={{ marginTop: isSmallMobile ? '20px' : '40px' }}>
            <Settings />
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* Tunnel Form Dialog */}
      <TunnelFormDialog
        isOpen={showForm}
        editingTunnel={editingTunnel}
        formData={formData}
        error={error}
        onClose={() => {
          setShowForm(false);
          setEditingTunnel(null);
        }}
        onSubmit={handleSubmit}
        onFormDataChange={setFormData}
        onErrorChange={setError}
      />
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

      {/* Logout Confirmation Dialog */}
      <LogoutConfirmDialog
        isOpen={showLogoutConfirm}
        onLogout={logout}
        onClose={() => setShowLogoutConfirm(false)}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        tunnel={tunnelToDelete}
        onClose={() => {
          setShowDeleteConfirm(false);
          setTunnelToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
      />

      {/* Offline Confirmation Dialog */}
      <OfflineConfirmDialog
        isOpen={showOfflineConfirm}
        tunnel={tunnelToOffline}
        onClose={() => {
          setShowOfflineConfirm(false);
          setTunnelToOffline(null);
        }}
        onConfirm={handleOfflineConfirm}
      />
    </div>
  );
}
