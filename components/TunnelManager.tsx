import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  target_host: string;
  target_port: number;
  local_port: number;
  created_at: string;
}

interface TunnelFormData {
  name: string;
  target_host: string;
  target_port: string;
  local_port: string;
}

export default function TunnelManager() {
  const { token, logout } = useAuth();
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTunnel, setEditingTunnel] = useState<Tunnel | null>(null);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<TunnelFormData>({
    name: '',
    target_host: '',
    target_port: '',
    local_port: ''
  });

  useEffect(() => {
    fetchTunnels();
  }, [token]);

  const fetchTunnels = async () => {
    try {
      const response = await fetch('/api/tunnels', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTunnels(data.tunnels);
      }
    } catch (err) {
      console.error('Failed to fetch tunnels:', err);
      setError('Failed to fetch tunnels');
    } finally {
      setIsLoading(false);
    }
  };

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
          target_host: formData.target_host,
          target_port: parseInt(formData.target_port),
          local_port: parseInt(formData.local_port),
        }),
      });

      if (response.ok) {
        setFormData({ name: '', target_host: '', target_port: '', local_port: '' });
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
      target_host: tunnel.target_host,
      target_port: tunnel.target_port.toString(),
      local_port: tunnel.local_port.toString()
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">SSH Tunnels</h1>
            <div className="flex space-x-4">
              <button
                onClick={() => setShowForm(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                Create Tunnel
              </button>
              <button
                onClick={logout}
                className="text-gray-600 hover:text-gray-900"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {showForm && (
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-xl font-semibold mb-4">
              {editingTunnel ? 'Edit Tunnel' : 'Create New Tunnel'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tunnel Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Host
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.target_host}
                    onChange={(e) => setFormData({ ...formData, target_host: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Port
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.target_port}
                    onChange={(e) => setFormData({ ...formData, target_port: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Local Port
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.local_port}
                    onChange={(e) => setFormData({ ...formData, local_port: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex space-x-4">
                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                >
                  {editingTunnel ? 'Update' : 'Create'} Tunnel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTunnel(null);
                    setFormData({ name: '', target_host: '', target_port: '', local_port: '' });
                  }}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          {tunnels.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No tunnels configured. Create your first tunnel to get started.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {tunnels.map((tunnel) => (
                <li key={tunnel.id} className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{tunnel.name}</h3>
                      <p className="text-sm text-gray-500">
                        {tunnel.target_host}:{tunnel.target_port} → localhost:{tunnel.local_port}
                      </p>
                      <p className="text-xs text-gray-400">
                        Created: {new Date(tunnel.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(tunnel)}
                        className="text-indigo-600 hover:text-indigo-900 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(tunnel.id)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">How to use your tunnels:</h3>
          <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
            <li>Connect to this SSH server using your credentials</li>
            <li>Configure your SSH client to use local port forwarding</li>
            <li>Example: ssh -L [local_port]:[target_host]:[target_port] user@server</li>
            <li>The tunnel will forward traffic from your local port to the target host</li>
          </ol>
        </div>
      </div>
    </div>
  );
}