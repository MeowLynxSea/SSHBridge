import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import TunnelStats from './TunnelStats';

interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  external_port: number;
  created_at: string;
  is_online?: boolean;
}





interface TunnelFormData {
  name: string;
  external_port: string;
}

export default function TunnelManager() {
  const { token, logout } = useAuth();
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTunnel, setEditingTunnel] = useState<Tunnel | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'tunnels' | 'stats'>('tunnels');
  const [tunnelStatuses, setTunnelStatuses] = useState<Map<number, boolean>>(new Map());
  const [formData, setFormData] = useState<TunnelFormData>({
    name: '',
    external_port: ''
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
      console.error('Failed to fetch tunnel statuses:', err);
    }
  }, [token]);

  const fetchTunnels = useCallback(async () => {
    try {
      const response = await fetch('/api/tunnels', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTunnels(data.tunnels.map((tunnel: Tunnel) => ({
          ...tunnel,
          is_online: tunnelStatuses.get(tunnel.id) || false
        })));
      }
    } catch (err) {
      console.error('Failed to fetch tunnels:', err);
      setError('Failed to fetch tunnels');
    } finally {
      setIsLoading(false);
    }
  }, [token, tunnelStatuses]);

  useEffect(() => {
    fetchTunnels();
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
        }),
      });

      if (response.ok) {
        setFormData({ name: '', external_port: '' });
        setShowForm(false);
        setEditingTunnel(null);
        fetchTunnels();
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to save tunnel');
      }
    } catch (err) {
      console.error('Failed to save tunnel:', err);
      setError('Network error');
    }
  };

  const handleEdit = (tunnel: Tunnel) => {
    setEditingTunnel(tunnel);
    setFormData({
      name: tunnel.name,
      external_port: tunnel.external_port.toString()
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this tunnel?')) return;

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
        setError('Failed to delete tunnel');
      }
    } catch (err) {
      console.error('Failed to delete tunnel:', err);
      setError('Network error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="nb-loader"></div>
          <h2 className="text-2xl font-bold">LOADING...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="nb-box" style={{ 
        borderBottom: 'none', 
        padding: '20px 0', 
        boxShadow: 'none',
        position: 'relative'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 className="text-4xl font-black uppercase">
              SSH<span style={{ color: 'var(--accent-color)' }}>Bridge</span>
            </h1>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <button 
                className="nb-btn nb-btn-accent" 
                onClick={() => {
                  setEditingTunnel(null);
                  setFormData({ name: '', external_port: '' });
                  setShowForm(true);
                }}
              >
                CREATE TUNNEL
              </button>
              <button className="nb-btn nb-btn-glitch" onClick={logout}>
                LOGOUT
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="nb-tabs">
            <button 
              className={`nb-tab ${activeTab === 'tunnels' ? 'nb-tab-active' : ''}`}
              onClick={() => setActiveTab('tunnels')}
            >
              TUNNELS
            </button>
            <button 
              className={`nb-tab ${activeTab === 'stats' ? 'nb-tab-active' : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              STATISTICS
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        {activeTab === 'tunnels' && (
          <div style={{ marginTop: '40px' }}>
            {error && (
              <div className="nb-alert nb-alert-destructive">
                {error}
              </div>
            )}

            {tunnels.length === 0 ? (
              <div className="nb-box nb-card">
                <div className="nb-card-header">
                  <h2 className="nb-card-title">NO TUNNELS CONFIGURED</h2>
                </div>
                <div className="nb-card-body">
                  <p style={{ marginBottom: '20px' }}>
                    Create your first tunnel to get started with SSHBridge.
                  </p>
                  <button 
                    className="nb-btn nb-btn-primary"
                    onClick={() => setShowForm(true)}
                  >
                    CREATE YOUR FIRST TUNNEL
                  </button>
                </div>
              </div>
            ) : (
              <div className="nb-box nb-card">
                <div className="nb-card-header">
                  <h2 className="nb-card-title">YOUR SSH TUNNELS</h2>
                </div>
                <div className="nb-card-body">
                  <table className="nb-table">
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>EXTERNAL PORT</th>
                        <th>CREATED</th>
                        <th style={{ textAlign: 'right' }}>ACTIONS</th>
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
                            {new Date(tunnel.created_at).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                className="nb-btn"
                                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                onClick={() => handleEdit(tunnel)}
                              >
                                EDIT
                              </button>
                              <button
                                className="nb-btn nb-btn-glitch"
                                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                onClick={() => handleDelete(tunnel.id)}
                              >
                                DELETE
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="nb-box nb-card" style={{ marginTop: '30px' }}>
              <div className="nb-card-header">
                <h2 className="nb-card-title">HOW TO USE YOUR TUNNELS</h2>
              </div>
              <div className="nb-card-body">
                <ol style={{ lineHeight: '1.8', paddingLeft: '20px' }}>
                  <li style={{ marginBottom: '10px' }}>Connect to this SSH server using your credentials and the -R flag</li>
                  <li style={{ marginBottom: '10px' }}>
                    Use your assigned external port: 
                    <code style={{ 
                      marginLeft: '10px', 
                      padding: '4px 8px', 
                      backgroundColor: 'var(--gray-light)', 
                      border: '1px solid var(--fg-color)',
                      fontFamily: 'monospace'
                    }}>
                      ssh -R {tunnels.length > 0 ? tunnels.map(t => t.external_port).join(', ') : 'PORT'}:localhost:LOCAL_PORT user@server
                    </code>
                  </li>
                  <li style={{ marginBottom: '10px' }}>External users connect to your assigned external port on this SSH server</li>
                  <li style={{ marginBottom: '10px' }}>SSH server forwards traffic to your local service specified in the -R flag</li>
                  <li>
                    Example: 
                    <code style={{ 
                      marginLeft: '10px', 
                      padding: '4px 8px', 
                      backgroundColor: 'var(--gray-light)', 
                      border: '1px solid var(--fg-color)',
                      fontFamily: 'monospace'
                    }}>
                      ssh -R 8080:localhost:3000 user@server
                    </code>, 
                    then external users access server:8080
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'stats' && (
          <div style={{ marginTop: '40px' }}>
            <TunnelStats />
          </div>
        )}
      </main>

      {/* Dialog for Create/Edit Tunnel */}
      {showForm && (
        <div className="nb-dialog-overlay" style={{ display: 'grid' }}>
          <div className="nb-dialog-card">
            <div className="nb-dialog-header">
              <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: '900', textTransform: 'uppercase' }}>
                {editingTunnel ? 'EDIT TUNNEL' : 'CREATE NEW TUNNEL'}
              </h2>
              <button 
                className="nb-btn" 
                style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '5px' }}
                onClick={() => {
                  setShowForm(false);
                  setEditingTunnel(null);
                  setFormData({ name: '', external_port: '' });
                }}
              >
                X
              </button>
            </div>
            <div className="nb-dialog-body">
              <p style={{ marginBottom: '20px' }}>
                {editingTunnel 
                  ? 'Update the tunnel configuration below.'
                  : 'Create a new SSH tunnel to expose your local services.'
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
                    TUNNEL NAME
                  </label>
                  <input
                    className="nb-input"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Web Server"
                    required
                  />
                </div>
                
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="nb-label" htmlFor="external_port">
                    EXTERNAL PORT
                  </label>
                  <input
                    className="nb-input"
                    id="external_port"
                    type="number"
                    value={formData.external_port}
                    onChange={(e) => setFormData({ ...formData, external_port: e.target.value })}
                    placeholder="8080"
                    required
                  />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    className="nb-btn"
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingTunnel(null);
                      setFormData({ name: '', external_port: '' });
                    }}
                  >
                    CANCEL
                  </button>
                  <button className="nb-btn nb-btn-primary" type="submit">
                    {editingTunnel ? 'UPDATE' : 'CREATE'} TUNNEL
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}