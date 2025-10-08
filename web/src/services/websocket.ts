import { WebSocketMessage } from '@/types/notification';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  constructor(private url: string, private token: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.url}?token=${this.token}`);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  subscribe(messageType: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(messageType)) {
      this.listeners.set(messageType, []);
    }
    this.listeners.get(messageType)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(messageType);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  private handleMessage(message: WebSocketMessage): void {
    const callbacks = this.listeners.get(message.type);
    if (callbacks) {
      callbacks.forEach(callback => callback(message.data));
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error);
        });
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let wsService: WebSocketService | null = null;

export const getWebSocketService = (url?: string, token?: string): WebSocketService => {
  if (!wsService && url && token) {
    wsService = new WebSocketService(url, token);
  }
  return wsService!;
};

export const disconnectWebSocket = (): void => {
  if (wsService) {
    wsService.disconnect();
    wsService = null;
  }
};