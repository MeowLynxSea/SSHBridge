import React, { useState } from 'react';
import { AuthProvider, useAuth } from '../components/AuthContext';
import AuthForm from '../components/AuthForm';
import TunnelManager from '../components/TunnelManager';

function AppContent() {
  const { user, isLoading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}