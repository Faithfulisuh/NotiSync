import * as Network from 'expo-network';
import * as Device from 'expo-device';
import { CapturedNotification, SyncedNotification } from '../types/notification';
import { databaseService, AuthTokens } from './database';

// Network-accessible backend URLs
const API_BASE_URL = __DEV__ 
  ? 'http://192.168.43.155:8080/api/v1' // Your actual local IP
  : 'https://api.notisync.com/api/v1';

const FALLBACK_URLS = [
  'http://10.0.2.2:8080/api/v1', // Android emulator
  'http://localhost:8080/api/v1', // iOS simulator
  'http://127.0.0.1:8080/api/v1', // Localhost fallback
];

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
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

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user?: any;
  error?: string;
  lastAuthAttempt?: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

class ApiService {
  private baseUrl: string;
  private authTokens: AuthTokens | null = null;
  private authState: AuthState;
  private retryConfig: RetryConfig;
  private isInitialized = false;
  private deviceInfo: any = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
    this.authState = {
      isAuthenticated: false,
      isLoading: false,
    };
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2,
    };
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.authState.isLoading = true;
      
      // Initialize database
      await databaseService.initialize();
      
      // Load device info
      await this.loadDeviceInfo();
      
      // Test and set working backend URL
      await this.findWorkingBackendUrl();
      
      // Load auth tokens
      await this.loadAuthTokens();
      
      this.isInitialized = true;
      console.log('API service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize API service:', error);
      this.authState.error = 'Failed to initialize API service';
    } finally {
      this.authState.isLoading = false;
    }
  }

  private async loadDeviceInfo(): Promise<void> {
    try {
      this.deviceInfo = {
        name: Device.deviceName || 'Unknown Device',
        platform: Device.osName?.toLowerCase() === 'ios' ? 'ios' : 'android',
        model: Device.modelName || 'Unknown Model',
        osVersion: Device.osVersion || 'Unknown Version',
        brand: Device.brand || 'Unknown Brand',
        manufacturer: Device.manufacturer || 'Unknown Manufacturer',
      };
    } catch (error) {
      console.error('Failed to load device info:', error);
      this.deviceInfo = {
        name: 'Unknown Device',
        platform: 'android',
        model: 'Unknown Model',
        osVersion: 'Unknown Version',
      };
    }
  }

  private async findWorkingBackendUrl(): Promise<void> {
    const urlsToTest = [API_BASE_URL, ...FALLBACK_URLS];
    
    for (const url of urlsToTest) {
      try {
        const healthUrl = url.replace('/api/v1', '/health');
        const response = await fetch(healthUrl, {
          method: 'GET',
          timeout: 5000,
        });
        
        if (response.ok) {
          this.baseUrl = url;
          console.log(`Using backend URL: ${url}`);
          return;
        }
      } catch (error) {
        console.log(`Backend URL ${url} not accessible:`, error);
      }
    }
    
    // If no URL works, use the default and let individual requests handle errors
    this.baseUrl = API_BASE_URL;
    console.warn('No backend URL accessible, using default:', this.baseUrl);
  }

  private async loadAuthTokens(): Promise<void> {
    try {
      this.authTokens = await databaseService.getAuthTokens();
      
      if (this.authTokens) {
        // Validate token expiration
        if (Date.now() >= this.authTokens.expiresAt) {
          console.log('Auth tokens expired, attempting refresh...');
          try {
            await this.refreshAccessToken();
          } catch (error) {
            console.log('Token refresh failed, clearing tokens');
            await this.clearAuthTokens();
          }
        } else {
          this.authState.isAuthenticated = true;
          console.log('Valid auth tokens loaded');
        }
      }
    } catch (error) {
      console.error('Failed to load auth tokens:', error);
      this.authState.error = 'Failed to load authentication state';
    }
  }

  private async saveAuthTokens(tokens: AuthTokens): Promise<void> {
    try {
      this.authTokens = tokens;
      await databaseService.saveAuthTokens(tokens);
      this.authState.isAuthenticated = true;
      this.authState.error = undefined;
      console.log('Auth tokens saved successfully');
    } catch (error) {
      console.error('Failed to save auth tokens:', error);
      throw new Error('Failed to save authentication tokens');
    }
  }

  private async clearAuthTokens(): Promise<void> {
    try {
      this.authTokens = null;
      await databaseService.clearAuthTokens();
      this.authState.isAuthenticated = false;
      this.authState.user = undefined;
      console.log('Auth tokens cleared');
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
    options: RequestInit = {},
    retryCount = 0
  ): Promise<ApiResponse<T>> {
    // Ensure service is initialized
    if (!this.isInitialized) {
      await this.initializeService();
    }

    try {
      // Check network connectivity
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected) {
        return {
          success: false,
          error: 'No network connection available',
        };
      }

      const headers = await this.getAuthHeaders();
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
        timeout: 30000, // 30 second timeout
      });

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        // Handle non-JSON responses
        data = { message: response.statusText };
      }

      if (response.ok) {
        return {
          success: true,
          data,
        };
      } else {
        // Handle specific HTTP status codes
        if (response.status === 401) {
          // Unauthorized - try to refresh token
          if (this.authTokens && retryCount === 0) {
            try {
              await this.refreshAccessToken();
              return this.makeRequest(endpoint, options, retryCount + 1);
            } catch (refreshError) {
              await this.clearAuthTokens();
              return {
                success: false,
                error: 'Authentication expired. Please log in again.',
              };
            }
          }
        }

        return {
          success: false,
          error: data.error || data.message || `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error) {
      console.error('Request failed:', error);
      
      // Retry logic for network errors
      if (retryCount < this.retryConfig.maxRetries && this.shouldRetry(error)) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retryCount),
          this.retryConfig.maxDelay
        );
        
        console.log(`Retrying request in ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(endpoint, options, retryCount + 1);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error occurred',
      };
    }
  }

  private shouldRetry(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true; // Network error
    }
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return true; // Timeout
    }
    return false;
  }

  // Authentication methods
  async login(credentials: LoginRequest): Promise<ApiResponse<AuthTokens & { user?: any }>> {
    try {
      this.authState.isLoading = true;
      this.authState.error = undefined;
      this.authState.lastAuthAttempt = Date.now();

      const response = await this.makeRequest<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      if (response.success && response.data) {
        const tokens: AuthTokens = {
          accessToken: response.data.token || response.data.accessToken,
          refreshToken: response.data.refreshToken || response.data.token,
          expiresAt: Date.now() + ((response.data.expiresIn || 24 * 60 * 60) * 1000),
        };

        await this.saveAuthTokens(tokens);
        
        // Store user info if provided
        if (response.data.user) {
          this.authState.user = response.data.user;
          await databaseService.saveUser({
            id: response.data.user.id,
            email: response.data.user.email,
            firstName: response.data.user.firstName || response.data.user.first_name,
            lastName: response.data.user.lastName || response.data.user.last_name,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }

        // Auto-register device after successful login
        try {
          await this.autoRegisterDevice();
        } catch (deviceError) {
          console.warn('Device registration failed:', deviceError);
          // Don't fail login if device registration fails
        }

        return { 
          success: true, 
          data: { 
            ...tokens, 
            user: response.data.user 
          } 
        };
      }

      this.authState.error = response.error || 'Login failed';
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      this.authState.error = errorMessage;
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      this.authState.isLoading = false;
    }
  }

  async register(userData: RegisterRequest): Promise<ApiResponse<any>> {
    try {
      this.authState.isLoading = true;
      this.authState.error = undefined;

      const response = await this.makeRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: userData.email,
          password: userData.password,
          first_name: userData.firstName,
          last_name: userData.lastName,
        }),
      });

      if (response.success) {
        // Auto-login after successful registration
        try {
          const loginResponse = await this.login({
            email: userData.email,
            password: userData.password,
          });
          
          if (loginResponse.success) {
            return {
              success: true,
              data: {
                ...response.data,
                autoLogin: true,
                tokens: loginResponse.data,
              },
            };
          }
        } catch (loginError) {
          console.warn('Auto-login after registration failed:', loginError);
        }
      }

      if (!response.success) {
        this.authState.error = response.error || 'Registration failed';
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      this.authState.error = errorMessage;
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      this.authState.isLoading = false;
    }
  }

  async logout(): Promise<ApiResponse<void>> {
    try {
      this.authState.isLoading = true;
      
      // Attempt to notify server of logout
      try {
        await this.makeRequest('/auth/logout', { method: 'POST' });
      } catch (error) {
        console.warn('Server logout notification failed:', error);
        // Continue with local logout even if server request fails
      }

      // Clear local auth state
      await this.clearAuthTokens();
      await databaseService.clearUser();

      return { success: true };
    } catch (error) {
      console.error('Logout failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      };
    } finally {
      this.authState.isLoading = false;
    }
  }

  async registerDevice(deviceInfo: DeviceRegistration): Promise<ApiResponse<any>> {
    if (!this.isAuthenticated()) {
      return {
        success: false,
        error: 'Must be authenticated to register device',
      };
    }

    return this.makeRequest('/auth/devices', {
      method: 'POST',
      body: JSON.stringify({
        name: deviceInfo.name,
        platform: deviceInfo.platform,
        device_token: deviceInfo.deviceToken,
        model: deviceInfo.model,
        os_version: deviceInfo.osVersion,
        brand: this.deviceInfo?.brand,
        manufacturer: this.deviceInfo?.manufacturer,
      }),
    });
  }

  private async autoRegisterDevice(): Promise<void> {
    if (!this.deviceInfo) return;

    try {
      const deviceRegistration: DeviceRegistration = {
        name: this.deviceInfo.name,
        platform: this.deviceInfo.platform,
        deviceToken: '', // Will be set when push notifications are configured
        model: this.deviceInfo.model,
        osVersion: this.deviceInfo.osVersion,
      };

      const response = await this.registerDevice(deviceRegistration);
      if (response.success) {
        console.log('Device registered successfully');
      } else {
        console.warn('Device registration failed:', response.error);
      }
    } catch (error) {
      console.warn('Auto device registration failed:', error);
    }
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
    return this.authTokens !== null && 
           Date.now() < this.authTokens.expiresAt &&
           this.authState.isAuthenticated;
  }

  getAccessToken(): string | null {
    return this.authTokens?.accessToken || null;
  }

  getAuthState(): AuthState {
    return { ...this.authState };
  }

  getCurrentUser(): any {
    return this.authState.user;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl.replace('/api/v1', '')}/health`, {
        timeout: 5000,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async validateToken(): Promise<boolean> {
    if (!this.authTokens) return false;

    try {
      const response = await this.makeRequest('/auth/validate', {
        method: 'GET',
      });
      return response.success;
    } catch {
      return false;
    }
  }

  async refreshTokenIfNeeded(): Promise<boolean> {
    if (!this.authTokens) return false;

    // Refresh if token expires in the next 5 minutes
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() + fiveMinutes >= this.authTokens.expiresAt) {
      try {
        await this.refreshAccessToken();
        return true;
      } catch (error) {
        console.error('Token refresh failed:', error);
        return false;
      }
    }

    return true;
  }

  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }

  // Force re-initialization (useful for testing or recovery)
  async reinitialize(): Promise<void> {
    this.isInitialized = false;
    await this.initializeService();
  }

  // Get connection info for debugging
  getConnectionInfo(): {
    baseUrl: string;
    isInitialized: boolean;
    authState: AuthState;
    deviceInfo: any;
  } {
    return {
      baseUrl: this.baseUrl,
      isInitialized: this.isInitialized,
      authState: this.authState,
      deviceInfo: this.deviceInfo,
    };
  }
}

export const apiService = new ApiService();