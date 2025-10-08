'use client';

import React from 'react';
import { Notification } from '@/types/notification';
import { formatDistanceToNow } from 'date-fns';
import { 
  Smartphone, 
  Monitor, 
  Globe, 
  MoreVertical, 
  Eye, 
  EyeOff, 
  X,
  Circle
} from 'lucide-react';

interface NotificationCardProps {
  notification: Notification;
  onClick: () => void;
  onMarkAsRead: () => void;
  onMarkAsUnread: () => void;
  onDismiss: () => void;
}

export const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onClick,
  onMarkAsRead,
  onMarkAsUnread,
  onDismiss,
}) => {
  const [showActions, setShowActions] = React.useState(false);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Work': return 'border-l-blue-500 bg-blue-50';
      case 'Personal': return 'border-l-green-500 bg-green-50';
      case 'Junk': return 'border-l-red-500 bg-red-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case 'mobile': return <Smartphone className="h-4 w-4" />;
      case 'desktop': return <Monitor className="h-4 w-4" />;
      case 'web': return <Globe className="h-4 w-4" />;
      default: return <Smartphone className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setShowActions(false);
  };

  return (
    <div
      className={`notification-card cursor-pointer relative ${
        !notification.isRead ? 'notification-unread' : ''
      } ${getCategoryColor(notification.category)}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                notification.category === 'Work' ? 'bg-blue-100 text-blue-800' :
                notification.category === 'Personal' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>
                {notification.category}
              </span>
              {!notification.isRead && (
                <Circle className="h-2 w-2 text-blue-500 fill-current" />
              )}
            </div>
            
            <div className="flex items-center space-x-2 text-gray-500">
              {notification.sourceDevice && getDeviceIcon(notification.sourceDevice)}
              <span className="text-xs">{formatTimestamp(notification.timestamp)}</span>
            </div>
          </div>

          {/* Content */}
          <div className="mb-3">
            <h3 className={`text-base font-medium text-gray-900 mb-1 ${
              !notification.isRead ? 'font-semibold' : ''
            }`}>
              {notification.title}
            </h3>
            <p className="text-sm text-gray-600 line-clamp-2">
              {notification.body}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {notification.appName}
            </span>
            
            {notification.isDismissed && (
              <span className="text-xs text-red-500 font-medium">
                Dismissed
              </span>
            )}
          </div>
        </div>

        {/* Actions Menu */}
        <div className="relative ml-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowActions(!showActions);
            }}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <MoreVertical className="h-4 w-4 text-gray-400" />
          </button>

          {showActions && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowActions(false)}
              />
              
              {/* Menu */}
              <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]">
                <button
                  onClick={(e) => handleActionClick(e, notification.isRead ? onMarkAsUnread : onMarkAsRead)}
                  className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {notification.isRead ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      <span>Mark Unread</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      <span>Mark Read</span>
                    </>
                  )}
                </button>
                
                {!notification.isDismissed && (
                  <button
                    onClick={(e) => handleActionClick(e, onDismiss)}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                    <span>Dismiss</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};