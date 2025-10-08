import { Notification, NotificationFilter, NotificationStats } from '@/types/notification';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

class ApiService {
  private token: string | null = null;

  setToken(token: string): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  clearToken(): void {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = this.getToken();

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Authentication
  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, password: string): Promise<{ token: string; user: any }> {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  // Notifications
  async getNotifications(filter?: NotificationFilter): Promise<{ notifications: Notification[]; total: number }> {
    const params = new URLSearchParams();
    
    if (filter?.category && filter.category !== 'all') {
      params.append('category', filter.category);
    }
    if (filter?.status && filter.status !== 'all') {
      params.append('status', filter.status);
    }
    if (filter?.search) {
      params.append('search', filter.search);
    }
    if (filter?.dateRange) {
      params.append('start_date', filter.dateRange.start.toISOString());
      params.append('end_date', filter.dateRange.end.toISOString());
    }

    const queryString = params.toString();
    const endpoint = `/api/notifications${queryString ? `?${queryString}` : ''}`;
    
    return this.request(endpoint);
  }

  async getNotificationStats(): Promise<NotificationStats> {
    return this.request('/api/notifications/stats');
  }

  async markAsRead(notificationId: string): Promise<void> {
    return this.request(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  }

  async markAsUnread(notificationId: string): Promise<void> {
    return this.request(`/api/notifications/${notificationId}/unread`, {
      method: 'POST',
    });
  }

  async dismissNotification(notificationId: string): Promise<void> {
    return this.request(`/api/notifications/${notificationId}/dismiss`, {
      method: 'POST',
    });
  }

  async clickNotification(notificationId: string): Promise<void> {
    return this.request(`/api/notifications/${notificationId}/click`, {
      method: 'POST',
    });
  }

  // Bulk operations
  async markAllAsRead(category?: string): Promise<void> {
    const params = category ? `?category=${category}` : '';
    return this.request(`/api/notifications/mark-all-read${params}`, {
      method: 'POST',
    });
  }

  async dismissAll(category?: string): Promise<void> {
    const params = category ? `?category=${category}` : '';
    return this.request(`/api/notifications/dismiss-all${params}`, {
      method: 'POST',
    });
  }

  // Device management
  async getDevices(): Promise<{ devices: any[] }> {
    return this.request('/api/devices');
  }

  async removeDevice(deviceId: string): Promise<void> {
    return this.request(`/api/devices/${deviceId}`, {
      method: 'DELETE',
    });
  }

  // Daily digest
  async getDailyDigest(date?: string): Promise<any> {
    const params = date ? `?date=${date}` : '';
    return this.request(`/api/digest${params}`);
  }
}

export const apiService = new ApiService();