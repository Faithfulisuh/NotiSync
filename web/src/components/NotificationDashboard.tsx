'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Notification, NotificationFilter, NotificationStats } from '@/types/notification';
import { apiService } from '@/services/api';
import { getWebSocketService } from '@/services/websocket';
import { NotificationList } from './NotificationList';
import { NotificationFilters } from './NotificationFilters';
import { NotificationStatsCard } from './NotificationStatsCard';
import { LoadingSpinner } from './LoadingSpinner';
import { Bell, Wifi, WifiOff } from 'lucide-react';

export const NotificationDashboard: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats>({
    total: 0,
    unread: 0,
    work: 0,
    personal: 0,
    junk: 0,
  });
  const [filter, setFilter] = useState<NotificationFilter>({
    category: 'all',
    status: 'all',
    search: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [notificationsResponse, statsResponse] = await Promise.all([
        apiService.getNotifications(filter),
        apiService.getNotificationStats(),
      ]);
      
      setNotifications(notificationsResponse.notifications);
      setStats(statsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Initialize WebSocket connection
  useEffect(() => {
    const token = apiService.getToken();
    if (!token) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
    const wsService = getWebSocketService(wsUrl, token);

    wsService.connect()
      .then(() => {
        setIsConnected(true);
        
        // Subscribe to notification updates
        const unsubscribeSync = wsService.subscribe('notification_sync', (data) => {
          console.log('Received notification sync:', data);
          loadNotifications(); // Reload notifications when sync occurs
        });

        const unsubscribeAction = wsService.subscribe('notification_action', (data) => {
          console.log('Received notification action:', data);
          // Update specific notification in state
          setNotifications(prev => 
            prev.map(n => 
              n.id === data.notificationId 
                ? { ...n, isRead: data.isRead, isDismissed: data.isDismissed }
                : n
            )
          );
        });

        const unsubscribeStatus = wsService.subscribe('connection_status', (data) => {
          setIsConnected(data.connected);
        });

        // Cleanup subscriptions on unmount
        return () => {
          unsubscribeSync();
          unsubscribeAction();
          unsubscribeStatus();
        };
      })
      .catch(err => {
        console.error('WebSocket connection failed:', err);
        setIsConnected(false);
      });
  }, [loadNotifications]);

  // Load notifications on mount and filter changes
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Handle notification actions
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await apiService.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setStats(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleMarkAsUnread = async (notificationId: string) => {
    try {
      await apiService.markAsUnread(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: false } : n)
      );
      setStats(prev => ({ ...prev, unread: prev.unread + 1 }));
    } catch (err) {
      console.error('Failed to mark as unread:', err);
    }
  };

  const handleDismiss = async (notificationId: string) => {
    try {
      await apiService.dismissNotification(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isDismissed: true } : n)
      );
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  };

  const handleClick = async (notificationId: string) => {
    try {
      await apiService.clickNotification(notificationId);
      // Mark as read when clicked
      handleMarkAsRead(notificationId);
    } catch (err) {
      console.error('Failed to handle notification click:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const category = filter.category !== 'all' ? filter.category : undefined;
      await apiService.markAllAsRead(category);
      loadNotifications(); // Reload to get updated data
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleDismissAll = async () => {
    try {
      const category = filter.category !== 'all' ? filter.category : undefined;
      await apiService.dismissAll(category);
      loadNotifications(); // Reload to get updated data
    } catch (err) {
      console.error('Failed to dismiss all:', err);
    }
  };

  if (loading && notifications.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Bell className="h-8 w-8 text-primary-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">NotiSync</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <>
                    <Wifi className="h-5 w-5 text-green-500" />
                    <span className="text-sm text-green-600">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-5 w-5 text-red-500" />
                    <span className="text-sm text-red-600">Disconnected</span>
                  </>
                )}
              </div>
              
              {/* Bulk Actions */}
              {stats.unread > 0 && (
                <div className="flex space-x-2">
                  <button
                    onClick={handleMarkAllAsRead}
                    className="btn-secondary text-sm"
                  >
                    Mark All Read
                  </button>
                  <button
                    onClick={handleDismissAll}
                    className="btn-secondary text-sm"
                  >
                    Dismiss All
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <NotificationStatsCard
            title="Total"
            count={stats.total}
            color="gray"
            isActive={filter.category === 'all'}
            onClick={() => setFilter(prev => ({ ...prev, category: 'all' }))}
          />
          <NotificationStatsCard
            title="Unread"
            count={stats.unread}
            color="blue"
            isActive={filter.status === 'unread'}
            onClick={() => setFilter(prev => ({ ...prev, status: prev.status === 'unread' ? 'all' : 'unread' }))}
          />
          <NotificationStatsCard
            title="Work"
            count={stats.work}
            color="blue"
            isActive={filter.category === 'Work'}
            onClick={() => setFilter(prev => ({ ...prev, category: prev.category === 'Work' ? 'all' : 'Work' }))}
          />
          <NotificationStatsCard
            title="Personal"
            count={stats.personal}
            color="green"
            isActive={filter.category === 'Personal'}
            onClick={() => setFilter(prev => ({ ...prev, category: prev.category === 'Personal' ? 'all' : 'Personal' }))}
          />
          <NotificationStatsCard
            title="Junk"
            count={stats.junk}
            color="red"
            isActive={filter.category === 'Junk'}
            onClick={() => setFilter(prev => ({ ...prev, category: prev.category === 'Junk' ? 'all' : 'Junk' }))}
          />
        </div>

        {/* Filters */}
        <div className="mb-6">
          <NotificationFilters
            filter={filter}
            onFilterChange={setFilter}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
            <button
              onClick={loadNotifications}
              className="mt-2 text-red-600 hover:text-red-800 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Notifications List */}
        <NotificationList
          notifications={notifications}
          loading={loading}
          onMarkAsRead={handleMarkAsRead}
          onMarkAsUnread={handleMarkAsUnread}
          onDismiss={handleDismiss}
          onClick={handleClick}
        />
      </div>
    </div>
  );
};