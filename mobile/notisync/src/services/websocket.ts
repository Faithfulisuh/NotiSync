import { apiService } from './api';

export interface WebSocketMessage {
  type: 'notification_update' | 'notification_new' | 'sync_status' | 'ping' | 'pong';
  data?: any;
  timestamp: number;
}

export interface NotificationUpdate {
  notificationId: string;
  action: 'read' | 'dismiss' | 'click';
  deviceId: string;
  timestamp: number;
}

export interface WebSocketConfig {
  url: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
}

type WebSocketEventHandler = (message: WebSocketMessage) => void;
type ConnectionEventHandler = (connected: boolean) => void;

class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private eventHandlers: Map<string, WebSocketEventHandler[]> = new Map();
  private connectionHandlers: ConnectionEventHandler[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;
  private lastPingTime = 0;

  constructor() {
    this.config = {
      url: __DEV__ 
        ? 'ws://localhost:8080/ws' 
        : 'wss://api.notisync.com/ws',
      reconnectInterval: 5000, // 5 seconds
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000, // 30 seconds
    };
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  async connect(): Promise<boolean> {
    if (this.isConnecting || this.isConnected) {
      return this.isConnected;
    }

    if (!apiService.isAuthenticated()) {
      console.warn('Cannot connect to WebSocket: not authenticated');
      return false;
    }

    this.isConnecting = true;

    try {
      const token = apiService.getAccessToken();
      const wsUrl = `${this.config.url}?token=${encodeURIComponent(token || '')}`;
      
      console.log('Connecting to WebSocket:', wsUrl.replace(/token=[^&]*/, 'token=***'));
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);

      // Wait for connection or timeout
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            console.warn('WebSocket connection timeout');
            this.disconnect();
            resolve(false);
          }
        }, 10000); // 10 second timeout

        const originalOnOpen = this.ws?.onopen;
        if (this.ws) {
          this.ws.onopen = (event) => {
            clearTimeout(timeout);
            if (originalOnOpen) originalOnOpen.call(this.ws, event);
            resolve(true);
          };
        }
      });
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      return false;
    }
  }

  disconnect(): void {
    console.log('Disconnecting WebSocket');
    
    this.isConnecting = false;
    this.isConnected = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.notifyConnectionHandlers(false);
  }

  private handleOpen(event: Event): void {
    console.log('WebSocket connected');
    this.isConnecting = false;
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    this.startHeartbeat();
    this.notifyConnectionHandlers(true);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      // Handle system messages
      if (message.type === 'pong') {
        const latency = Date.now() - this.lastPingTime;
        console.log(`WebSocket pong received, latency: ${latency}ms`);
        return;
      }

      // Notify event handlers
      const handlers = this.eventHandlers.get(message.type) || [];
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in WebSocket event handler:', error);
        }
      });

      // Notify wildcard handlers
      const wildcardHandlers = this.eventHandlers.get('*') || [];
      wildcardHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in WebSocket wildcard handler:', error);
        }
      });
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket disconnected:', event.code, event.reason);
    this.isConnected = false;
    this.isConnecting = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.notifyConnectionHandlers(false);

    // Attempt to reconnect if not manually disconnected
    if (event.code !== 1000 && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.isConnecting = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    console.log(`Scheduling WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();
        this.send({
          type: 'ping',
          timestamp: this.lastPingTime,
        });
      }
    }, this.config.heartbeatInterval);
  }

  send(message: WebSocketMessage): boolean {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send WebSocket message: not connected');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
      return false;
    }
  }

  // Event handling
  on(eventType: string, handler: WebSocketEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  off(eventType: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  onConnection(handler: ConnectionEventHandler): void {
    this.connectionHandlers.push(handler);
  }

  offConnection(handler: ConnectionEventHandler): void {
    const index = this.connectionHandlers.indexOf(handler);
    if (index > -1) {
      this.connectionHandlers.splice(index, 1);
    }
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        console.error('Error in connection handler:', error);
      }
    });
  }

  // Notification-specific methods
  sendNotificationUpdate(update: NotificationUpdate): boolean {
    return this.send({
      type: 'notification_update',
      data: update,
      timestamp: Date.now(),
    });
  }

  // Status methods
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }

  getConnectionStatus(): {
    connected: boolean;
    connecting: boolean;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
    };
  }

  // Configuration
  updateConfig(newConfig: Partial<WebSocketConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export const webSocketService = WebSocketService.getInstance();