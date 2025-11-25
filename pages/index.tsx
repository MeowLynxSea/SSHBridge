import React, { useState } from 'react';
import { AuthProvider, useAuth } from '../components/AuthContext';
import { LanguageProvider } from '../components/LanguageContext';
import { ThemeProvider } from '../components/ThemeContext';
import '../lib/i18n';
import AuthForm from '../components/AuthForm';
import TunnelManager from '../components/TunnelManager';
import ResponsiveLayout from '../components/ResponsiveLayout';

function AppContent() {
  const { user, isLoading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="nb-loader"></div>
          <h2 className="text-2xl font-black uppercase" style={{ fontFamily: 'var(--font-sans)' }}>
            Loading...
          </h2>
          <div 
            className="nb-box" 
            style={{ 
              padding: '10px', 
              fontSize: '0.8rem', 
              fontFamily: 'monospace',
              transform: 'rotate(1deg)'
            }}
          >
            SYSTEM INITIALIZING...
          </div>
        </div>
      </div>
    );
  }

  if (user) {
    return <TunnelManager />;
  }

  return (
    <AuthForm 
      mode={mode} 
      onToggleMode={() => setMode(mode === 'login' ? 'register' : 'login')} 
    />
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <ResponsiveLayout>
            <AppContent />
          </ResponsiveLayout>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}