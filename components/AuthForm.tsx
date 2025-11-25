import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { useMobile } from './ResponsiveLayout';

interface AuthFormProps {
  mode: 'login' | 'register';
  onToggleMode: () => void;
}

export default function AuthForm({ mode, onToggleMode }: AuthFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuth();
  const { isMobile, isSmallMobile } = useMobile();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="nb-box nb-card" style={{ 
        width: '100%', 
        maxWidth: isSmallMobile ? '100%' : '500px',
        margin: isSmallMobile ? '0' : 'auto'
      }}>
        <div className="nb-card-header">
          <h1 className="nb-card-title">
            {mode === 'login' ? 'SIGN IN' : 'REGISTER'}
          </h1>
          <div className="loader-container">
            {isLoading && <div className="nb-loader"></div>}
          </div>
        </div>
        
        <div className="nb-card-body">
          <p className="mb-6">
            {mode === 'login' 
              ? 'ENTER YOUR CREDENTIALS TO ACCESS YOUR SSH TUNNELS' 
              : 'CREATE A NEW ACCOUNT TO START MANAGING SSH TUNNELS'
            }
          </p>
          
          {error && (
            <div className="nb-alert nb-alert-destructive">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-group">
              <label className="nb-label" htmlFor="username">
                USERNAME
              </label>
              <input
                className="nb-input"
                id="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="nb-label" htmlFor="password">
                PASSWORD
              </label>
              <input
                className="nb-input"
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            <div className="flex flex-col space-y-4 pt-4">
              <button 
                className={`nb-btn nb-btn-primary ${isMobile ? 'w-full' : 'w-full'}`} 
                type="submit" 
                disabled={isLoading}
                style={{
                  fontSize: isSmallMobile ? '1rem' : '1rem',
                  padding: isSmallMobile ? '14px 16px' : '12px 24px'
                }}
              >
                {isLoading ? 'PROCESSING...' : (mode === 'login' ? 'SIGN IN' : 'REGISTER')}
              </button>
              
              <button
                className={`nb-btn ${isMobile ? 'w-full' : 'w-full'}`}
                type="button"
                onClick={onToggleMode}
                style={{
                  fontSize: isSmallMobile ? '0.9rem' : '1rem',
                  padding: isSmallMobile ? '12px 16px' : '12px 24px'
                }}
              >
                {mode === 'login' 
                  ? "DON'T HAVE AN ACCOUNT? REGISTER" 
                  : 'ALREADY HAVE AN ACCOUNT? SIGN IN'
                }
              </button>
            </div>
          </form>
        </div>
        
        {/* 装饰性元素 */}
        <div className="decoration" style={{ 
          position: 'absolute', 
          right: '20px', 
          top: '20px', 
          border: '2px solid black', 
          padding: '10px', 
          transform: 'rotate(3deg)', 
          fontSize: '0.7rem',
          fontFamily: 'monospace'
        }}>
          SYSTEM STATUS: ONLINE<br/>
          SECURITY: {mode === 'login' ? 'ENFORCED' : 'CREATING'}<br/>
        </div>
      </div>
    </div>
  );
}