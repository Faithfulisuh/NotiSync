'use client';

import React from 'react';

interface NotificationStatsCardProps {
  title: string;
  count: number;
  color: 'gray' | 'blue' | 'green' | 'red';
  isActive?: boolean;
  onClick?: () => void;
}

export const NotificationStatsCard: React.FC<NotificationStatsCardProps> = ({
  title,
  count,
  color,
  isActive = false,
  onClick,
}) => {
  const getColorClasses = (color: string, isActive: boolean) => {
    const baseClasses = 'transition-all duration-200 cursor-pointer';
    
    if (isActive) {
      switch (color) {
        case 'blue':
          return `${baseClasses} bg-blue-50 border-blue-200 ring-2 ring-blue-500`;
        case 'green':
          return `${baseClasses} bg-green-50 border-green-200 ring-2 ring-green-500`;
        case 'red':
          return `${baseClasses} bg-red-50 border-red-200 ring-2 ring-red-500`;
        default:
          return `${baseClasses} bg-gray-50 border-gray-200 ring-2 ring-gray-500`;
      }
    }

    return `${baseClasses} bg-white border-gray-200 hover:border-gray-300 hover:shadow-md`;
  };

  const getTextColorClasses = (color: string, isActive: boolean) => {
    if (isActive) {
      switch (color) {
        case 'blue': return 'text-blue-700';
        case 'green': return 'text-green-700';
        case 'red': return 'text-red-700';
        default: return 'text-gray-700';
      }
    }
    return 'text-gray-600';
  };

  const getCountColorClasses = (color: string, isActive: boolean) => {
    if (isActive) {
      switch (color) {
        case 'blue': return 'text-blue-900';
        case 'green': return 'text-green-900';
        case 'red': return 'text-red-900';
        default: return 'text-gray-900';
      }
    }
    return 'text-gray-900';
  };

  return (
    <div
      className={`rounded-lg border p-4 ${getColorClasses(color, isActive)}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium ${getTextColorClasses(color, isActive)}`}>
            {title}
          </p>
          <p className={`text-2xl font-bold ${getCountColorClasses(color, isActive)}`}>
            {count.toLocaleString()}
          </p>
        </div>
        
        {/* Icon based on category */}
        <div className={`p-2 rounded-full ${
          isActive 
            ? color === 'blue' ? 'bg-blue-100' :
              color === 'green' ? 'bg-green-100' :
              color === 'red' ? 'bg-red-100' : 'bg-gray-100'
            : 'bg-gray-100'
        }`}>
          {title === 'Total' && (
            <svg className={`h-5 w-5 ${getTextColorClasses(color, isActive)}`} fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {title === 'Unread' && (
            <svg className={`h-5 w-5 ${getTextColorClasses(color, isActive)}`} fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
          )}
          {title === 'Work' && (
            <svg className={`h-5 w-5 ${getTextColorClasses(color, isActive)}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h2zm4-3a1 1 0 00-1 1v1h2V4a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {title === 'Personal' && (
            <svg className={`h-5 w-5 ${getTextColorClasses(color, isActive)}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          )}
          {title === 'Junk' && (
            <svg className={`h-5 w-5 ${getTextColorClasses(color, isActive)}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 3a1 1 0 112 0v3a1 1 0 11-2 0V8zm4-1a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};