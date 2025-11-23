import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserSettings {
  refreshInterval: number;
}

export default function Settings({ isOpen, onClose }: SettingsProps) {
  const { token } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    refreshInterval: 2000, // Default 2 seconds
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSettings({
            refreshInterval: data.refreshInterval,
          });
        } else {
          setError(data.error || 'Failed to fetch settings');
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to fetch settings');
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch current settings when modal opens
  useEffect(() => {
    if (isOpen && token) {
      fetchSettings();
    }
  }, [isOpen, token, fetchSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          refreshInterval: settings.refreshInterval,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSuccess('Settings saved successfully!');
          // Update local state with the response value
          setSettings({
            refreshInterval: data.refreshInterval,
          });
        } else {
          setError(data.error || 'Failed to save settings');
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 1000) {
      setSettings({ ...settings, refreshInterval: value });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="nb-dialog-overlay" style={{ display: 'grid' }}>
      <div className="nb-dialog-card" style={{ maxWidth: '600px', width: '90%' }}>
        <div className="nb-dialog-header">
          <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: '900', textTransform: 'uppercase' }}>
            SETTINGS
          </h2>
          <button 
            className="nb-btn" 
            style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '5px' }}
            onClick={onClose}
          >
            X
          </button>
        </div>
        <div className="nb-dialog-body">
          <p style={{ marginBottom: '20px' }}>
            Configure your SSHBridge preferences
          </p>
          
          {error && (
            <div className="nb-alert nb-alert-destructive" style={{ marginBottom: '20px' }}>
              {error}
            </div>
          )}
          
          {success && (
            <div className="nb-alert" style={{ 
              marginBottom: '20px', 
              background: 'var(--accent-color)', 
              color: 'var(--bg-color)' 
            }}>
              {success}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="nb-label" htmlFor="refreshInterval">
                PTY STATUS REFRESH INTERVAL (MILLISECONDS)
              </label>
              <input
                className="nb-input"
                id="refreshInterval"
                type="number"
                min="1000"
                step="100"
                value={settings.refreshInterval}
                onChange={handleIntervalChange}
                required
              />
              <p style={{ 
                fontSize: '0.8rem', 
                marginTop: '5px', 
                fontFamily: 'monospace',
                opacity: 0.8
              }}>
                Minimum: 1000ms (1 second). This controls how often the PTY status display refreshes.
              </p>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="nb-btn"
                type="button"
                onClick={onClose}
                disabled={loading}
              >
                CANCEL
              </button>
              <button 
                className="nb-btn nb-btn-primary" 
                type="submit"
                disabled={loading}
              >
                {loading ? 'SAVING...' : 'SAVE SETTINGS'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}