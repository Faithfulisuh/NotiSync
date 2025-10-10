import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiService } from './api';

// Conditional imports for native modules
let Device: any = null;
let Notifications: any = null;

if (Platform.OS !== 'web') {
  try {
    Device = require('expo-device');
    Notifications = require('expo-notifications');
  } catch (error) {
    console.warn('Native modules not available:', error);
  }
}

export interface DeviceInfo {
  id: string;
  name: string;
  platform: 'mobile' | 'web' | 'desktop';
  model: string;
  osVersion: string;
  appVersion: string;
  pushToken?: string;
  isRegistered: boolean;
  registeredAt?: number;
}

const STORAGE_KEY = 'device_info';

class DeviceRegistrationService {
  private static instance: DeviceRegistrationService;
  private deviceInfo: DeviceInfo | null = null;

  constructor() {
    this.loadDeviceInfo();
  }

  static getInstance(): DeviceRegistrationService {
    if (!DeviceRegistrationService.instance) {
      DeviceRegistrationService.instance = new DeviceRegistrationService();
    }
    return DeviceRegistrationService.instance;
  }

  private async loadDeviceInfo(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.deviceInfo = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load device info:', error);
    }
  }

  async saveDeviceInfo(): Promise<void> {
    if (this.deviceInfo) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.deviceInfo));
      } catch (error) {
        console.error('Failed to save device info:', error);
      }
    }
  }

  async generateDeviceInfo(): Promise<DeviceInfo> {
    try {
      // Get push notification token (only on native platforms)
      let pushToken: string | undefined;
      if (Platform.OS !== 'web') {
        try {
          const { data: token } = await Notifications.getExpoPushTokenAsync({
            projectId: 'eacad04e-aaa8-4ecb-a7bd-b70cfc3aee93', // Your EAS project ID
          });
          pushToken = token;
        } catch (error) {
          console.warn('Failed to get push token:', error);
        }
      } else {
        // For web, generate a mock token
        pushToken = `web_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      }

      // Generate device info
      const deviceInfo: DeviceInfo = {
        id: await this.generateDeviceId(),
        name: await this.generateDeviceName(),
        platform: Platform.OS === 'web' ? 'web' : 'mobile', // Map to backend-compatible device types
        model: this.getDeviceModel(),
        osVersion: this.getOSVersion(),
        appVersion: '1.0.0', // This should come from app.json or package.json
        pushToken,
        isRegistered: false,
      };

      this.deviceInfo = deviceInfo;
      await this.saveDeviceInfo();

      return deviceInfo;
    } catch (error) {
      console.error('Failed to generate device info:', error);
      throw error;
    }
  }

  private async generateDeviceId(): Promise<string> {
    // Try to get existing device ID from storage
    try {
      const existingId = await AsyncStorage.getItem('device_id');
      if (existingId) {
        return existingId;
      }
    } catch (error) {
      console.warn('Failed to get existing device ID:', error);
    }

    // Generate new device ID
    const deviceId = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      await AsyncStorage.setItem('device_id', deviceId);
    } catch (error) {
      console.warn('Failed to save device ID:', error);
    }

    return deviceId;
  }

  private getDeviceModel(): string {
    if (Platform.OS === 'web') {
      return `${navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'} Web`;
    }
    return Device.modelName || Device.deviceName || 'Unknown Device';
  }

  private getOSVersion(): string {
    if (Platform.OS === 'web') {
      return navigator.userAgent;
    }
    return Device.osVersion || 'Unknown';
  }

  private async generateDeviceName(): Promise<string> {
    let platform: string;
    let model: string;

    if (Platform.OS === 'web') {
      platform = 'Web Browser';
      model = this.getDeviceModel();
    } else {
      platform = Platform.OS === 'ios' ? 'iPhone' : 'Android';
      model = Device.modelName || Device.deviceName || 'Device';
    }

    // Try to get user's custom name from storage
    try {
      const customName = await AsyncStorage.getItem('device_custom_name');
      if (customName) {
        return customName;
      }
    } catch (error) {
      console.warn('Failed to get custom device name:', error);
    }

    return `${model} (${platform})`;
  }

  async registerDevice(): Promise<{ success: boolean; error?: string; device?: any }> {
    try {
      console.log('Starting device registration...');

      if (!this.deviceInfo) {
        console.log('No device info found, generating...');
        await this.generateDeviceInfo();
      }

      if (!this.deviceInfo) {
        throw new Error('Failed to generate device info');
      }

      if (!apiService.isAuthenticated()) {
        throw new Error('User not authenticated');
      }

      const deviceRegistrationData = {
        name: this.deviceInfo.name,
        platform: this.deviceInfo.platform,
        deviceToken: this.deviceInfo.pushToken || this.deviceInfo.id,
        model: this.deviceInfo.model,
        osVersion: this.deviceInfo.osVersion,
      };

      console.log('Registering device with info:', {
        name: this.deviceInfo.name,
        platform: this.deviceInfo.platform,
        model: this.deviceInfo.model,
        osVersion: this.deviceInfo.osVersion,
        hasPushToken: !!this.deviceInfo.pushToken,
        deviceToken: deviceRegistrationData.deviceToken
      });

      console.log('API service auth status:', {
        isAuthenticated: apiService.isAuthenticated(),
        hasAccessToken: !!apiService.getAccessToken(),
        authState: apiService.getAuthState()
      });

      const result = await apiService.registerDevice(deviceRegistrationData);

      if (result.success) {
        this.deviceInfo.isRegistered = true;
        this.deviceInfo.registeredAt = Date.now();
        await this.saveDeviceInfo();

        console.log('Device registered successfully:', result.data);
        return {
          success: true,
          device: result.data?.device || result.data
        };
      } else {
        console.error('Device registration failed:', result.error);

        // If the error is "user not found", it means the token is invalid
        if (result.error?.includes('user not found')) {
          console.log('User not found error detected during device registration');
          // The API service should have already cleared the tokens
          // Mark device as not registered
          this.deviceInfo.isRegistered = false;
          this.deviceInfo.registeredAt = undefined;
          await this.saveDeviceInfo();
        }

        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Device registration error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async updateDeviceName(name: string): Promise<void> {
    try {
      await AsyncStorage.setItem('device_custom_name', name);

      if (this.deviceInfo) {
        this.deviceInfo.name = name;
        await this.saveDeviceInfo();
      }
    } catch (error) {
      console.error('Failed to update device name:', error);
    }
  }

  async refreshPushToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      // Web doesn't support push tokens in the same way
      return this.deviceInfo?.pushToken || null;
    }

    try {
      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: 'eacad04e-aaa8-4ecb-a7bd-b70cfc3aee93',
      });

      if (this.deviceInfo && token !== this.deviceInfo.pushToken) {
        this.deviceInfo.pushToken = token;
        await this.saveDeviceInfo();

        // Re-register device with new token if already registered
        if (this.deviceInfo.isRegistered && apiService.isAuthenticated()) {
          await this.registerDevice();
        }
      }

      return token;
    } catch (error) {
      console.error('Failed to refresh push token:', error);
      return null;
    }
  }

  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  isDeviceRegistered(): boolean {
    return this.deviceInfo?.isRegistered || false;
  }

  async unregisterDevice(): Promise<{ success: boolean; error?: string }> {
    try {
      if (apiService.isAuthenticated()) {
        // Try to notify the server about device removal
        try {
          const devices = await apiService.getDevices();
          if (devices.success && devices.data?.devices) {
            const currentDevice = devices.data.devices.find((d: any) =>
              d.device_name === this.deviceInfo?.name
            );

            if (currentDevice) {
              await apiService.removeDevice(currentDevice.id);
            }
          }
        } catch (error) {
          console.warn('Failed to notify server about device removal:', error);
        }
      }

      if (this.deviceInfo) {
        this.deviceInfo.isRegistered = false;
        this.deviceInfo.registeredAt = undefined;
        await this.saveDeviceInfo();
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Device unregistration error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async checkRegistrationStatus(): Promise<{
    isRegistered: boolean;
    needsReregistration: boolean;
    serverDevice?: any;
    error?: string;
  }> {
    try {
      if (!apiService.isAuthenticated()) {
        return {
          isRegistered: false,
          needsReregistration: false,
          error: 'Not authenticated'
        };
      }

      if (!this.deviceInfo) {
        return {
          isRegistered: false,
          needsReregistration: true,
          error: 'No local device info'
        };
      }

      // Check with server
      const devicesResponse = await apiService.getDevices();
      if (!devicesResponse.success) {
        return {
          isRegistered: this.deviceInfo.isRegistered,
          needsReregistration: false,
          error: devicesResponse.error
        };
      }

      const serverDevices = devicesResponse.data?.devices || [];
      const matchingDevice = serverDevices.find((d: any) =>
        d.device_name === this.deviceInfo?.name
      );

      if (matchingDevice) {
        // Device exists on server
        if (!this.deviceInfo.isRegistered) {
          // Local state is out of sync
          this.deviceInfo.isRegistered = true;
          this.deviceInfo.registeredAt = Date.now();
          await this.saveDeviceInfo();
        }

        return {
          isRegistered: true,
          needsReregistration: false,
          serverDevice: matchingDevice
        };
      } else {
        // Device doesn't exist on server
        if (this.deviceInfo.isRegistered) {
          // Local state is out of sync
          this.deviceInfo.isRegistered = false;
          this.deviceInfo.registeredAt = undefined;
          await this.saveDeviceInfo();
        }

        return {
          isRegistered: false,
          needsReregistration: true
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Registration status check error:', errorMessage);
      return {
        isRegistered: this.deviceInfo?.isRegistered || false,
        needsReregistration: false,
        error: errorMessage
      };
    }
  }
  async clearDeviceInfo(): Promise<void> {
    this.deviceInfo = null;
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem('device_id');
    await AsyncStorage.removeItem('device_custom_name');
  }

  async ensureDeviceRegistration(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Ensuring device registration...');

      // Check current registration status
      const status = await this.checkRegistrationStatus();

      if (status.isRegistered && !status.needsReregistration) {
        console.log('Device already registered');
        return { success: true };
      }

      if (status.needsReregistration || !status.isRegistered) {
        console.log('Device needs registration/re-registration');
        return await this.registerDevice();
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Ensure device registration error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async forceReregister(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Force re-registering device...');

      // Clear local registration state
      if (this.deviceInfo) {
        this.deviceInfo.isRegistered = false;
        this.deviceInfo.registeredAt = undefined;
        await this.saveDeviceInfo();
      }

      // Regenerate device info to get fresh tokens
      await this.generateDeviceInfo();

      // Register device
      return await this.registerDevice();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Force re-register error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // Utility methods for device capabilities
  getDeviceCapabilities() {
    const isWeb = Platform.OS === 'web';
    return {
      hasNotificationSupport: isWeb ? false : Device.isDevice,
      platform: Platform.OS,
      canReceivePushNotifications: isWeb ? false : (Device.isDevice && !__DEV__),
      supportsBackgroundTasks: isWeb ? false : Device.isDevice,
      deviceType: isWeb ? 'DESKTOP' : Device.deviceType,
      isPhysicalDevice: isWeb ? false : Device.isDevice,
    };
  }

  async checkNotificationSettings(): Promise<{
    permissionsGranted: boolean;
    pushTokenAvailable: boolean;
    deviceRegistered: boolean;
    canCapture: boolean;
  }> {
    if (Platform.OS === 'web') {
      const deviceInfo = this.getDeviceInfo();
      return {
        permissionsGranted: false, // Web doesn't have the same notification permissions
        pushTokenAvailable: !!deviceInfo?.pushToken,
        deviceRegistered: this.isDeviceRegistered(),
        canCapture: false, // Web can't capture system notifications
      };
    }

    const permissions = await Notifications.getPermissionsAsync();
    const deviceInfo = this.getDeviceInfo();

    return {
      permissionsGranted: permissions.status === 'granted',
      pushTokenAvailable: !!deviceInfo?.pushToken,
      deviceRegistered: this.isDeviceRegistered(),
      canCapture: Device.isDevice && permissions.status === 'granted',
    };
  }
}

export const deviceRegistrationService = DeviceRegistrationService.getInstance();