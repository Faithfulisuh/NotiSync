import React, { useState, useEffect } from 'react';
import { View, Text, Platform } from 'react-native';
import { notificationCaptureService } from '../services/notificationCapture';

export function NotificationCaptureStatus() {
  const [captureCount, setCaptureCount] = useState(0);
  const [lastCaptured, setLastCaptured] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    let mounted = true;

    const updateStatus = async () => {
      try {
        // Get recent notifications count
        const recentNotifications = await notificationCaptureService.getRecentNotifications(100);
        if (mounted) {
          setCaptureCount(recentNotifications.length);
          
          if (recentNotifications.length > 0) {
            const latest = recentNotifications[0];
            setLastCaptured(`${latest.appName}: ${latest.title}`);
          }
        }
      } catch (error) {
        console.error('Failed to get capture status:', error);
      }
    };

    // Check if capture service is running
    const checkCaptureStatus = () => {
      // This would need to be implemented in the capture service
      setIsCapturing(true); // For now, assume it's always running
    };

    updateStatus();
    checkCaptureStatus();

    // Update every 5 seconds
    const interval = setInterval(() => {
      if (mounted) {
        updateStatus();
      }
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <View className="bg-blue-50 border border-blue-200 rounded-lg p-3 mx-4 mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className={`w-3 h-3 rounded-full mr-2 ${isCapturing ? 'bg-green-500' : 'bg-red-500'}`} />
          <Text className="text-sm font-medium text-blue-800">
            📱 Notification Capture
          </Text>
        </View>
        <Text className="text-xs text-blue-600 font-medium">
          {captureCount} captured
        </Text>
      </View>
      
      {lastCaptured && (
        <Text className="text-xs text-blue-700 mt-1" numberOfLines={1}>
          Latest: {lastCaptured}
        </Text>
      )}
      
      <Text className="text-xs text-blue-600 mt-1">
        Status: {isCapturing ? '✅ Active' : '❌ Inactive'} • 
        Platform: {Platform.OS === 'android' ? 'Android Service' : 'iOS Background'}
      </Text>
    </View>
  );
}