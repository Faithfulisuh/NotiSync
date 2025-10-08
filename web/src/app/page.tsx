'use client';

import React, { useEffect, useState } from 'react';
import { NotificationDashboard } from '@/components/NotificationDashboard';
import { LoginForm } from '@/components/LoginForm';
import { apiService } from '@/services/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const token = apiService.getToken();
    if (token) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLoginSuccess = (token: string) => {
    apiService.setToken(token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    apiService.clearToken();
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  return <NotificationDashboard />;
}