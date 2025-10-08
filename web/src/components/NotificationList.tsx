'use client';

import React, { useState } from 'react';
import { Notification } from '@/types/notification';
import { NotificationCard } from './NotificationCard';
import { NotificationDetailModal } from './NotificationDetailModal';
import { LoadingSpinner } from './LoadingSpinner';

interface NotificationListProps {
  notifications: Notification[];
  loading: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAsUnread: (id: string) => void;
  onDismiss: (id: string) => void;
  onClick: (id: string) => void;
}

export const NotificationList: React.FC<NotificationListProps> = ({
  notifications,
  loading,
  onMarkAsRead,
  onMarkAsUnread,
  onDismiss,
  onClick,
}) => {
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  const handleNotificationClick = (notification: Notification) => {
    setSelectedNotification(notification);
    onClick(notification.id);
  };

  const handleCloseModal = () => {
    setSelectedNotification(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-24 w-24 text-gray-300 mb-4">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications found</h3>
        <p className="text-gray-500">
          You're all caught up! No notifications match your current filters.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onClick={() => handleNotificationClick(notification)}
            onMarkAsRead={() => onMarkAsRead(notification.id)}
            onMarkAsUnread={() => onMarkAsUnread(notification.id)}
            onDismiss={() => onDismiss(notification.id)}
          />
        ))}
      </div>

      {/* Pagination could be added here */}
      {notifications.length >= 50 && (
        <div className="mt-8 text-center">
          <button className="btn-secondary">
            Load More
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          onClose={handleCloseModal}
          onMarkAsRead={() => onMarkAsRead(selectedNotification.id)}
          onMarkAsUnread={() => onMarkAsUnread(selectedNotification.id)}
          onDismiss={() => onDismiss(selectedNotification.id)}
        />
      )}
    </>
  );
};