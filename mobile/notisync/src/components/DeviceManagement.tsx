import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';

interface Device {
  id: string;
  deviceName: string;
  deviceType: 'mobile' | 'web' | 'desktop';
  lastSeen: string;
  isCurrentDevice: boolean;
}

interface DeviceManagementProps {
  onBack: () => void;
}

export const DeviceManagement: React.FC<DeviceManagementProps> = ({ onBack }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      // TODO: Replace with actual API call
      const response = await fetch('/api/devices', {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeDevice = async (deviceId: string) => {
    Alert.alert(
      'Remove Device',
      'Are you sure you want to remove this device? It will stop receiving notifications.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`/api/devices/${deviceId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${await getAuthToken()}`,
                },
              });
              
              if (response.ok) {
                setDevices(devices.filter(d => d.id !== deviceId));
              } else {
                Alert.alert('Error', 'Failed to remove device');
              }
            } catch (error) {
              Alert.alert('Error', 'Network error occurred');
            }
          },
        },
      ]
    );
  };

  const getAuthToken = async (): Promise<string> => {
    // TODO: Implement token retrieval from storage
    return 'mock-token';
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile': return '📱';
      case 'web': return '🌐';
      case 'desktop': return '💻';
      default: return '📱';
    }
  };

  const formatLastSeen = (lastSeen: string) => {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const renderDevice = ({ item }: { item: Device }) => (
    <View className="bg-white p-4 mb-3 rounded-lg border border-gray-200">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <Text className="text-2xl mr-3">{getDeviceIcon(item.deviceType)}</Text>
          <View className="flex-1">
            <Text className="text-base font-pmedium text-slate-800">
              {item.deviceName}
              {item.isCurrentDevice && (
                <Text className="text-sm font-pregular text-blue-600"> (This device)</Text>
              )}
            </Text>
            <Text className="text-sm text-gray-600 font-pregular">
              {item.deviceType} • Last seen {formatLastSeen(item.lastSeen)}
            </Text>
          </View>
        </View>
        
        {!item.isCurrentDevice && (
          <TouchableOpacity
            onPress={() => removeDevice(item.id)}
            className="bg-red-100 px-3 py-2 rounded-lg"
          >
            <Text className="text-red-600 font-pmedium text-sm">Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600 font-pregular">Loading devices...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white p-4 border-b border-gray-200">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={onBack} className="mr-4">
            <Text className="text-blue-600 font-pmedium text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-lg font-pbold text-slate-800">Device Management</Text>
        </View>
      </View>

      <View className="flex-1 p-4">
        <Text className="text-sm text-gray-600 font-pregular mb-4">
          Manage devices connected to your NotiSync account. Remove devices to stop syncing notifications to them.
        </Text>

        <FlatList
          data={devices}
          renderItem={renderDevice}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="bg-white p-6 rounded-lg border border-gray-200 items-center">
              <Text className="text-gray-500 font-pregular text-center">
                No devices found. Add devices by logging in from other platforms.
              </Text>
            </View>
          }
        />

        <View className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500 mt-4">
          <Text className="text-sm font-pmedium text-slate-800 mb-1">💡 Tip</Text>
          <Text className="text-sm text-slate-600 font-pregular">
            Install NotiSync on your computer or access the web app to sync notifications across all your devices.
          </Text>
        </View>
      </View>
    </View>
  );
};