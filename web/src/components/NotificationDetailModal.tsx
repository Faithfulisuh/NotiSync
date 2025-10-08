'use client';

import React from 'react';
import { Notification } from '@/types/notification';
import { formatDistanceToNow, format } from 'date-fns';
import { X, Eye, EyeOff, Trash2, Smartphone, Monitor, Globe } from 'lucide-react';

interface NotificationDetailModalProps {
  notification: Notification;
  onClose: () => void;
  onMarkAsRead: () => void;
  onMarkAsUnread: () => void;
  onDismiss: () => void;
}

export const NotificationDetailModal: React.FC<NotificationDetailModalProps> = ({
  notification,
  onClose,
  onMarkAsRead,
  onMarkAsUnread,
  onDismiss,
}) => {
  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case 'mobile': return <Smartphone className="h-5 w-5" />;
      case 'desktop': return <Monitor className="h-5 w-5" />;
      case 'web': return <Globe className="h-5 w-5" />;
      default: return <Smartphone className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Work': return 'bg-blue-100 text-blue-800';
      case 'Personal': return 'bg-green-100 text-green-800';
      case 'Junk': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return {
        relative: formatDistanceToNow(date, { addSuffix: true }),
        absolute: format(date, 'PPpp'),
      };
    } catch {
      return {
        relative: 'Unknown time',
        absolute: 'Invalid date',
      };
    }
  };

  const timeInfo = formatTimestamp(notification.timestamp);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Notification Details</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* Status and Category */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getCategoryColor(notification.category)}`}>
                  {notification.category}
                </span>
                {!notification.isRead && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Unread
                  </span>
                )}
                {notification.isDismissed && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Dismissed
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-2 text-gray-500">
                {notification.sourceDevice && getDeviceIcon(notification.sourceDevice)}
                <span className="text-sm">{timeInfo.relative}</span>
              </div>
            </div>

            {/* Main Content */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {notification.title}
              </h3>
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {notification.body}
                </p>
              </div>
            </div>

            {/* Metadata */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-gray-900">Notification Information</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">App:</span>
                  <span className="ml-2 text-gray-600">{notification.appName}</span>
                </div>
                
                <div>
                  <span className="font-medium text-gray-700">Category:</span>
                  <span className="ml-2 text-gray-600">{notification.category}</span>
                </div>
                
                <div>
                  <span className="font-medium text-gray-700">Received:</span>
                  <span className="ml-2 text-gray-600">{timeInfo.absolute}</span>
                </div>
                
                <div>
                  <span className="font-medium text-gray-700">Status:</span>
                  <span className="ml-2 text-gray-600">
                    {notification.isRead ? 'Read' : 'Unread'}
                    {notification.isDismissed && ' • Dismissed'}
                  </span>
                </div>
                
                {notification.sourceDevice && (
                  <div>
                    <span className="font-medium text-gray-700">Source:</span>
                    <span className="ml-2 text-gray-600 capitalize">{notification.sourceDevice}</span>
                  </div>
                )}
                
                {notification.priority !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700">Priority:</span>
                    <span className="ml-2 text-gray-600">{notification.priority}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {notification.actions && notification.actions.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-900 mb-3">Available Actions</h4>
                <div className="space-y-2">
                  {notification.actions.map((action) => (
                    <button
                      key={action.id}
                      className="w-full text-left px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex space-x-3">
              <button
                onClick={() => handleAction(notification.isRead ? onMarkAsUnread : onMarkAsRead)}
                className="flex items-center space-x-2 btn-secondary"
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
                  onClick={() => handleAction(onDismiss)}
                  className="flex items-center space-x-2 btn-danger"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Dismiss</span>
                </button>
              )}
            </div>
            
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};