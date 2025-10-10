import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { apiService } from '../services/api';
import { 
  NotificationPermissionStatus, 
  NotificationStats, 
  SyncedNotification,
  NotificationCaptureConfig 
} from '../types/notification';

export interface NotificationCaptureState {
  isCapturing: boolean;
  isInitialized: boolean;
  permissions: NotificationPermissionStatus | null;
  stats: NotificationStats;
  recentNotifications: SyncedNotification[];
  config: NotificationCaptureConfig;
  isOnline: boolean;
  lastSyncTime: number | null;
  syncInProgress: boolean;
  error: string | null;
}

export interface NotificationCaptureActions {
  startCapture: () => Promise<boolean>;
  stopCapture: () => Promise<void>;
  requestPermissions: () => Promise<NotificationPermissionStatus>;
  syncPendingNotifications: () => Promise<{ success: number; failed: number }>;
  refreshStats: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  updateConfig: (config: Partial<NotificationCaptureConfig>) => Promise<void>;
  clearAllData: () => Promise<void>;
  registerDevice: () => Promise<boolean>;
  testConnection: () => Promise<boolean>;
}

export function useNotificationCapture(): [NotificationCaptureState, NotificationCaptureActions] {
  // Conditionally load services based on platform
  const getCaptureService = () => {
    if (Platform.OS === 'web') {
      const { webNotificationCaptureService } = require('../services/webNotificationCapture');
      return webNotificationCaptureService;
    } else {
      const { notificationCaptureService } = require('../services/notificationCapture');
      return notificationCaptureService;
    }
  };

  const getDeviceService = () => {
    const { deviceRegistrationService } = require('../services/deviceRegistration');
    return deviceRegistrationService;
  };
  const [state, setState] = useState<NotificationCaptureState>({
    isCapturing: false,
    isInitialized: false,
    permissions: null,
    stats: {
      totalCaptured: 0,
      totalSynced: 0,
      pendingSync: 0,
      captureRate: 0,
      syncSuccessRate: 0,
    },
    recentNotifications: [],
    config: {
      enabled: true,
      captureSystemNotifications: true,
      captureAppNotifications: true,
      excludedApps: [],
      includedApps: [],
      filterKeywords: [],
    },
    isOnline: false,
    lastSyncTime: null,
    syncInProgress: false,
    error: null,
  });

  // Initialize the capture service
  const initialize = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      const captureService = getCaptureService();
      
      // Load initial data
      const [permissions, stats, notifications, config, isOnline] = await Promise.all([
        captureService.requestPermissions(),
        captureService.getStats(),
        captureService.getRecentNotifications(20),
        Promise.resolve(captureService.getConfig()),
        apiService.testConnection(),
      ]);

      setState(prev => ({
        ...prev,
        permissions,
        stats,
        recentNotifications: notifications,
        config,
        isOnline,
        isCapturing: captureService.isCapturingEnabled(),
        isInitialized: true,
        lastSyncTime: stats.lastSyncTime || null,
      }));
    } catch (error) {
      console.error('Failed to initialize notification capture:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Initialization failed',
        isInitialized: true,
      }));
    }
  }, []);

  // App state change handler
  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      // App became active, refresh data
      await refreshStats();
      await refreshNotifications();
      
      // Test connection
      const isOnline = await apiService.testConnection();
      setState(prev => ({ ...prev, isOnline }));
      
      // Auto-sync if online and authenticated
      if (isOnline && apiService.isAuthenticated()) {
        syncPendingNotifications();
      }
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initialize();
    
    // Listen for app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Periodically sync state with service
    const statusInterval = setInterval(() => {
      const captureService = getCaptureService();
      const currentStatus = captureService.getCurrentStatus();
      setState(prev => {
        if (prev.isCapturing !== currentStatus.isCapturing) {
          console.log('State sync: updating isCapturing from', prev.isCapturing, 'to', currentStatus.isCapturing);
          return { ...prev, isCapturing: currentStatus.isCapturing };
        }
        return prev;
      });
    }, 2000); // Check every 2 seconds
    
    return () => {
      subscription?.remove();
      clearInterval(statusInterval);
    };
  }, [initialize, handleAppStateChange]);

  // Actions
  const startCapture = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      const captureService = getCaptureService();
      const success = await captureService.startCapturing();
      
      if (success) {
        setState(prev => ({ ...prev, isCapturing: true }));
        
        // Register device if not already registered
        const deviceService = getDeviceService();
        if (!deviceService.isDeviceRegistered() && apiService.isAuthenticated()) {
          await registerDevice();
        }
      }
      
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start capture';
      setState(prev => ({ ...prev, error: errorMessage }));
      return false;
    }
  }, []);

  const stopCapture = useCallback(async (): Promise<void> => {
    try {
      console.log('Hook stopCapture called, current state:', state.isCapturing);
      setState(prev => ({ ...prev, error: null }));
      
      const captureService = getCaptureService();
      await captureService.stopCapturing();
      
      // Force state update to ensure UI reflects the change
      const currentStatus = captureService.getCurrentStatus();
      console.log('Service status after stop:', currentStatus);
      
      setState(prev => ({ 
        ...prev, 
        isCapturing: currentStatus.isCapturing,
        error: null 
      }));
      
      console.log('Hook stopCapture completed successfully');
    } catch (error) {
      console.error('Hook stopCapture error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop capture';
      
      // Even if there's an error, check the actual service state
      const captureService = getCaptureService();
      const currentStatus = captureService.getCurrentStatus();
      setState(prev => ({ 
        ...prev, 
        isCapturing: currentStatus.isCapturing,
        error: errorMessage 
      }));
    }
  }, [state.isCapturing]);

  const requestPermissions = useCallback(async (): Promise<NotificationPermissionStatus> => {
    try {
      const captureService = getCaptureService();
      const permissions = await captureService.requestPermissions();
      setState(prev => ({ ...prev, permissions, error: null }));
      return permissions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Permission request failed';
      setState(prev => ({ ...prev, error: errorMessage }));
      throw error;
    }
  }, []);

  const syncPendingNotifications = useCallback(async (): Promise<{ success: number; failed: number }> => {
    if (state.syncInProgress) {
      return { success: 0, failed: 0 };
    }

    try {
      setState(prev => ({ ...prev, syncInProgress: true, error: null }));
      
      const captureService = getCaptureService();
      const result = await captureService.syncPendingNotifications();
      
      // Refresh stats after sync
      const stats = await captureService.getStats();
      setState(prev => ({
        ...prev,
        stats,
        lastSyncTime: Date.now(),
        syncInProgress: false,
      }));
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      setState(prev => ({ 
        ...prev, 
        error: errorMessage, 
        syncInProgress: false 
      }));
      return { success: 0, failed: 0 };
    }
  }, [state.syncInProgress]);

  const refreshStats = useCallback(async (): Promise<void> => {
    try {
      const captureService = getCaptureService();
      const stats = await captureService.getStats();
      setState(prev => ({ ...prev, stats, error: null }));
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    }
  }, []);

  const refreshNotifications = useCallback(async (): Promise<void> => {
    try {
      const captureService = getCaptureService();
      const notifications = await captureService.getRecentNotifications(20);
      setState(prev => ({ ...prev, recentNotifications: notifications, error: null }));
    } catch (error) {
      console.error('Failed to refresh notifications:', error);
    }
  }, []);

  const updateConfig = useCallback(async (newConfig: Partial<NotificationCaptureConfig>): Promise<void> => {
    try {
      const captureService = getCaptureService();
      await captureService.updateConfig(newConfig);
      const config = captureService.getConfig();
      setState(prev => ({ ...prev, config, error: null }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update config';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, []);

  const clearAllData = useCallback(async (): Promise<void> => {
    try {
      const captureService = getCaptureService();
      await captureService.clearAllNotifications();
      await refreshStats();
      await refreshNotifications();
      setState(prev => ({ ...prev, error: null }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear data';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [refreshStats, refreshNotifications]);

  const registerDevice = useCallback(async (): Promise<boolean> => {
    try {
      // Check authentication first
      if (!apiService.isAuthenticated()) {
        setState(prev => ({ ...prev, error: 'User not authenticated' }));
        return false;
      }

      const deviceService = getDeviceService();
      const result = await deviceService.registerDevice();
      if (!result.success) {
        setState(prev => ({ ...prev, error: result.error || 'Device registration failed' }));
      }
      return result.success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Device registration failed';
      // Don't log authentication errors as ERROR level
      if (errorMessage.includes('not authenticated')) {
        console.warn('Device registration skipped:', errorMessage);
      } else {
        console.error('Device registration error:', errorMessage);
      }
      setState(prev => ({ ...prev, error: errorMessage }));
      return false;
    }
  }, []);

  const testConnection = useCallback(async (): Promise<boolean> => {
    try {
      const isOnline = await apiService.testConnection();
      setState(prev => ({ ...prev, isOnline, error: null }));
      return isOnline;
    } catch (error) {
      setState(prev => ({ ...prev, isOnline: false }));
      return false;
    }
  }, []);

  const actions: NotificationCaptureActions = {
    startCapture,
    stopCapture,
    requestPermissions,
    syncPendingNotifications,
    refreshStats,
    refreshNotifications,
    updateConfig,
    clearAllData,
    registerDevice,
    testConnection,
  };

  return [state, actions];
}