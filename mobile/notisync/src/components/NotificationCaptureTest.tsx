import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNotificationCapture } from '../hooks/useNotificationCapture';

export function NotificationCaptureTest() {
  const [state, actions] = useNotificationCapture();

  useEffect(() => {
    // Auto-start capture if permissions are granted
    if (state.permissions?.granted && !state.isCapturing) {
      actions.startCapture();
    }
  }, [state.permissions?.granted, state.isCapturing]);

  const handleRequestPermissions = async () => {
    try {
      const permissions = await actions.requestPermissions();
      if (permissions.granted) {
        Alert.alert('Success', 'Notification permissions granted!');
      } else {
        Alert.alert('Error', 'Notification permissions denied');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to request permissions');
    }
  };

  const handleStartCapture = async () => {
    const success = await actions.startCapture();
    if (success) {
      Alert.alert('Success', 'Notification capture started!');
    } else {
      Alert.alert('Error', 'Failed to start notification capture');
    }
  };

  const handleStopCapture = async () => {
    console.log('Stop capture button pressed');
    try {
      await actions.stopCapture();
      console.log('Stop capture completed');
      Alert.alert('Info', 'Notification capture stopped');
    } catch (error) {
      console.error('Stop capture failed:', error);
      Alert.alert('Error', 'Failed to stop capture: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleSync = async () => {
    const result = await actions.syncPendingNotifications();
    Alert.alert(
      'Sync Complete',
      `Synced: ${result.success}, Failed: ${result.failed}`
    );
  };

  const handleTestConnection = async () => {
    const isOnline = await actions.testConnection();
    Alert.alert(
      'Connection Test',
      isOnline ? 'Server is reachable' : 'Server is not reachable'
    );
  };

  const handleRegisterDevice = async () => {
    const success = await actions.registerDevice();
    Alert.alert(
      'Device Registration',
      success ? 'Device registered successfully' : 'Device registration failed'
    );
  };

  const handleClearData = async () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to clear all captured notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await actions.clearAllData();
            Alert.alert('Success', 'All data cleared');
          },
        },
      ]
    );
  };

  if (!state.isInitialized) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-lg text-gray-600">Initializing...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-4">
        <Text className="text-2xl font-bold text-gray-800 mb-6">
          Notification Capture Test
        </Text>

        {/* Status Section */}
        <View className="bg-white rounded-lg p-4 mb-4 shadow-sm">
          <Text className="text-lg font-semibold text-gray-800 mb-3">Status</Text>
          
          <View className="space-y-2">
            <StatusRow 
              label="Permissions" 
              value={state.permissions?.granted ? 'Granted' : 'Not Granted'}
              status={state.permissions?.granted ? 'success' : 'error'}
            />
            <StatusRow 
              label="Capturing" 
              value={state.isCapturing ? 'Active' : 'Inactive'}
              status={state.isCapturing ? 'success' : 'warning'}
            />
            <StatusRow 
              label="Server Connection" 
              value={state.isOnline ? 'Online' : 'Offline'}
              status={state.isOnline ? 'success' : 'error'}
            />
            <StatusRow 
              label="Sync Status" 
              value={state.syncInProgress ? 'Syncing...' : 'Ready'}
              status={state.syncInProgress ? 'warning' : 'success'}
            />
          </View>
        </View>

        {/* Statistics Section */}
        <View className="bg-white rounded-lg p-4 mb-4 shadow-sm">
          <Text className="text-lg font-semibold text-gray-800 mb-3">Statistics</Text>
          
          <View className="grid grid-cols-2 gap-4">
            <StatCard label="Total Captured" value={state.stats.totalCaptured} />
            <StatCard label="Total Synced" value={state.stats.totalSynced} />
            <StatCard label="Pending Sync" value={state.stats.pendingSync} />
            <StatCard 
              label="Sync Rate" 
              value={`${state.stats.syncSuccessRate.toFixed(1)}%`} 
            />
          </View>
          
          {state.lastSyncTime && (
            <Text className="text-sm text-gray-600 mt-2">
              Last sync: {new Date(state.lastSyncTime).toLocaleString()}
            </Text>
          )}
        </View>

        {/* Recent Notifications */}
        <View className="bg-white rounded-lg p-4 mb-4 shadow-sm">
          <Text className="text-lg font-semibold text-gray-800 mb-3">
            Recent Notifications ({state.recentNotifications.length})
          </Text>
          
          {state.recentNotifications.length === 0 ? (
            <Text className="text-gray-500 text-center py-4">
              No notifications captured yet
            </Text>
          ) : (
            <View className="space-y-2">
              {state.recentNotifications.slice(0, 5).map((notification, index) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}
            </View>
          )}
        </View>

        {/* Actions Section */}
        <View className="bg-white rounded-lg p-4 mb-4 shadow-sm">
          <Text className="text-lg font-semibold text-gray-800 mb-3">Actions</Text>
          
          <View className="space-y-3">
            {!state.permissions?.granted && (
              <ActionButton
                title="Request Permissions"
                onPress={handleRequestPermissions}
                variant="primary"
              />
            )}
            
            {state.permissions?.granted && !state.isCapturing && (
              <ActionButton
                title="Start Capture"
                onPress={handleStartCapture}
                variant="success"
              />
            )}
            
            {state.isCapturing && (
              <ActionButton
                title="Stop Capture"
                onPress={handleStopCapture}
                variant="warning"
              />
            )}
            
            <ActionButton
              title="Test Connection"
              onPress={handleTestConnection}
              variant="secondary"
            />
            
            <ActionButton
              title="Register Device"
              onPress={handleRegisterDevice}
              variant="secondary"
            />
            
            <ActionButton
              title="Refresh Status"
              onPress={() => {
                actions.refreshStats();
                actions.refreshNotifications();
              }}
              variant="secondary"
            />
            
            {state.stats.pendingSync > 0 && (
              <ActionButton
                title={`Sync ${state.stats.pendingSync} Notifications`}
                onPress={handleSync}
                variant="primary"
                disabled={state.syncInProgress}
              />
            )}
            
            <ActionButton
              title="Clear All Data"
              onPress={handleClearData}
              variant="danger"
            />
          </View>
        </View>

        {/* Error Display */}
        {state.error && (
          <View className="bg-red-50 border border-red-200 rounded-lg p-4">
            <Text className="text-red-800 font-medium">Error</Text>
            <Text className="text-red-600 mt-1">{state.error}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function StatusRow({ 
  label, 
  value, 
  status 
}: { 
  label: string; 
  value: string; 
  status: 'success' | 'warning' | 'error' 
}) {
  const statusColors = {
    success: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
  };

  return (
    <View className="flex-row justify-between items-center">
      <Text className="text-gray-700">{label}:</Text>
      <Text className={`font-medium ${statusColors[status]}`}>{value}</Text>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="bg-gray-50 rounded-lg p-3">
      <Text className="text-2xl font-bold text-gray-800">{value}</Text>
      <Text className="text-sm text-gray-600">{label}</Text>
    </View>
  );
}

function NotificationItem({ notification }: { notification: any }) {
  return (
    <View className="border border-gray-200 rounded-lg p-3">
      <View className="flex-row justify-between items-start mb-1">
        <Text className="font-medium text-gray-800 flex-1" numberOfLines={1}>
          {notification.appName}
        </Text>
        <View className="flex-row space-x-2">
          {notification.synced && (
            <View className="bg-green-100 px-2 py-1 rounded">
              <Text className="text-green-800 text-xs">Synced</Text>
            </View>
          )}
          {notification.category && (
            <View className="bg-blue-100 px-2 py-1 rounded">
              <Text className="text-blue-800 text-xs">{notification.category}</Text>
            </View>
          )}
        </View>
      </View>
      
      <Text className="text-gray-700 font-medium" numberOfLines={1}>
        {notification.title}
      </Text>
      
      {notification.body && (
        <Text className="text-gray-600 text-sm mt-1" numberOfLines={2}>
          {notification.body}
        </Text>
      )}
      
      <Text className="text-gray-500 text-xs mt-2">
        {new Date(notification.timestamp).toLocaleString()}
      </Text>
    </View>
  );
}

function ActionButton({ 
  title, 
  onPress, 
  variant = 'secondary',
  disabled = false 
}: { 
  title: string; 
  onPress: () => void; 
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  disabled?: boolean;
}) {
  const variantStyles = {
    primary: 'bg-blue-600 active:bg-blue-700',
    secondary: 'bg-gray-600 active:bg-gray-700',
    success: 'bg-green-600 active:bg-green-700',
    warning: 'bg-yellow-600 active:bg-yellow-700',
    danger: 'bg-red-600 active:bg-red-700',
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`
        ${variantStyles[variant]} 
        ${disabled ? 'opacity-50' : ''} 
        px-4 py-3 rounded-lg
      `}
    >
      <Text className="text-white font-medium text-center">{title}</Text>
    </TouchableOpacity>
  );
}