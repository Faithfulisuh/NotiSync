'use client';

import React from 'react';
import { NotificationFilter } from '@/types/notification';
import { Search, Filter } from 'lucide-react';

interface NotificationFiltersProps {
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
}

export const NotificationFilters: React.FC<NotificationFiltersProps> = ({
  filter,
  onFilterChange,
}) => {
  const handleSearchChange = (search: string) => {
    onFilterChange({ ...filter, search });
  };

  const handleCategoryChange = (category: NotificationFilter['category']) => {
    onFilterChange({ ...filter, category });
  };

  const handleStatusChange = (status: NotificationFilter['status']) => {
    onFilterChange({ ...filter, status });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-6">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={filter.search || ''}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={filter.category || 'all'}
            onChange={(e) => handleCategoryChange(e.target.value as NotificationFilter['category'])}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="all">All Categories</option>
            <option value="Work">Work</option>
            <option value="Personal">Personal</option>
            <option value="Junk">Junk</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-2">
          <select
            value={filter.status || 'all'}
            onChange={(e) => handleStatusChange(e.target.value as NotificationFilter['status'])}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="all">All Status</option>
            <option value="unread">Unread Only</option>
            <option value="read">Read Only</option>
          </select>
        </div>

        {/* Clear Filters */}
        {(filter.search || filter.category !== 'all' || filter.status !== 'all') && (
          <button
            onClick={() => onFilterChange({ category: 'all', status: 'all', search: '' })}
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
};