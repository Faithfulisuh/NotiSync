import AsyncStorage from '@react-native-async-storage/async-storage';
import { CapturedNotification, SyncedNotification } from '../types/notification';

const API_BASE_URL = __DEV__ 
  ? 'http://localhost:8080/api/v1' 
  : 'https://api.notisync.com/api/v1';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface DeviceRegistration {
  name: string;
  platform: 'ios' | 'android';
  deviceToken: string;
  model?: string;
  osVersion?: string;
}

class ApiService {
  private baseUrl: string;
  private authTokens: AuthTokens | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
    this.loadAuthTokens();
  }

  private async loadAuthTokens(): Promise<void> {
    try {
      const tokens = await AsyncStorage.getItem('auth_tokens');
      if (tokens) {
        this.authTokens = JSON.parse(tokens);
      }
    } catch (error) {
      console.error('Failed to load auth tokens:', error);
    }
  }

  private async saveAuthTokens(tokens: AuthTokens): Promise<void> {
    try {
      this.authTokens = tokens;
      await AsyncStorage.setItem('auth_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.error('Failed to save auth tokens:', error);
    }
  }

  private async clearAuthTokens(): Promise<void> {
    try {
      this.authTokens = null;
      await AsyncStorage.removeItem('auth_tokens');
    } catch (error) {
      console.error('Failed to clear auth tokens:', error);
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authTokens) {
      // Check if token is expired
      if (Date.now() >= this.authTokens.expiresAt) {
        await this.refreshAccessToken();
      }
      
      if (this.authTokens) {
        headers.Authorization = `Bearer ${this.authTokens.accessToken}`;
      }
    }

    return headers;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.authTokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: this.authTokens.refreshToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await this.saveAuthTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || this.authTokens.refreshToken,
          expiresAt: Date.now() + (data.expiresIn * 1000),
        });
      } else {
        // Refresh failed, clear tokens
        await this.clearAuthTokens();
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      await this.clearAuthTokens();
      throw error;
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          data,
        };
      } else {
        return {
          success: false,
          error: data.error || data.message || 'Request failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Authentication methods
  async login(credentials: LoginRequest): Promise<ApiResponse<AuthTokens>> {
    const response = await this.makeRequest<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (response.success && response.data) {
      const tokens: AuthTokens = {
        accessToken: response.data.token,
        refreshToken: response.data.refreshToken || response.data.token,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };
      await this.saveAuthTokens(tokens);
      return { success: true, data: tokens };
    }

    return response;
  }

  async register(userData: RegisterRequest): Promise<ApiResponse<any>> {
    return this.makeRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: userData.email,
        password: userData.password,
        first_name: userData.firstName,
        last_name: userData.lastName,
      }),
    });
  }

  async logout(): Promise<void> {
    try {
      await this.makeRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      await this.clearAuthTokens();
    }
  }

  async registerDevice(deviceInfo: DeviceRegistration): Promise<ApiResponse<any>> {
    return this.makeRequest('/auth/devices', {
      method: 'POST',
      body: JSON.stringify({
        name: deviceInfo.name,
        platform: deviceInfo.platform,
        device_token: deviceInfo.deviceToken,
        model: deviceInfo.model,
        os_version: deviceInfo.osVersion,
      }),
    });
  }

  // Notification methods
  async syncNotification(notification: CapturedNotification): Promise<ApiResponse<any>> {
    return this.makeRequest('/notifications', {
      method: 'POST',
      body: JSON.stringify({
        app_name: notification.appName,
        title: notification.title,
        body: notification.body,
        category: notification.category,
        priority: notification.priority,
        timestamp: new Date(notification.timestamp).toISOString(),
        package_name: notification.packageName,
        extras: notification.extras,
      }),
    });
  }

  async batchSyncNotifications(notifications: CapturedNotification[]): Promise<ApiResponse<any>> {
    return this.makeRequest('/notifications/batch', {
      method: 'POST',
      body: JSON.stringify({
        notifications: notifications.map(n => ({
          app_name: n.appName,
          title: n.title,
          body: n.body,
          category: n.category,
          priority: n.priority,
          timestamp: new Date(n.timestamp).toISOString(),
          package_name: n.packageName,
          extras: n.extras,
        })),
      }),
    });
  }

  async getNotifications(limit = 50, offset = 0): Promise<ApiResponse<any>> {
    return this.makeRequest(`/notifications?limit=${limit}&offset=${offset}`);
  }

  async updateNotificationStatus(
    notificationId: string, 
    action: 'read' | 'dismiss' | 'click'
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(`/notifications/${notificationId}`, {
      method: 'PUT',
      body: JSON.stringify({ action }),
    });
  }

  // Utility methods
  isAuthenticated(): boolean {
    return this.authTokens !== null && Date.now() < this.authTokens.expiresAt;
  }

  getAccessToken(): string | null {
    return this.authTokens?.accessToken || null;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl.replace('/api/v1', '')}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const apiService = new ApiService();