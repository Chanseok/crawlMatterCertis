import React from 'react';
import { cn } from '../../../utils/common';

export interface TableColumn<T = any> {
  key: string;
  header: string;
  render?: (value: any, item: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  width?: string;
}

export interface TableProps<T = any> {
  data: T[];
  columns: TableColumn<T>[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  headerClassName?: string;
  rowClassName?: string | ((item: T, index: number) => string);
  onRowClick?: (item: T, index: number) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string, order: 'asc' | 'desc') => void;
}

export const Table = <T,>({
  data,
  columns,
  loading = false,
  emptyMessage = 'No data available',
  className,
  headerClassName,
  rowClassName,
  onRowClick,
  sortBy,
  sortOrder,
  onSort
}: TableProps<T>) => {
  const handleSort = (columnKey: string) => {
    if (!onSort) return;
    
    const newOrder = sortBy === columnKey && sortOrder === 'asc' ? 'desc' : 'asc';
    onSort(columnKey, newOrder);
  };

  const getSortIcon = (columnKey: string) => {
    if (sortBy !== columnKey) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className={cn('border border-gray-200 dark:border-gray-700 rounded-md', className)}>
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden', className)}>
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className={cn('bg-gray-50 dark:bg-gray-800', headerClassName)}>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider',
                  column.sortable && onSort && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none',
                  column.headerClassName
                )}
                style={column.width ? { width: column.width } : undefined}
                onClick={column.sortable && onSort ? () => handleSort(column.key) : undefined}
              >
                <div className="flex items-center justify-between">
                  <span>{column.header}</span>
                  {column.sortable && onSort && (
                    <span className="ml-1 text-gray-400">
                      {getSortIcon(column.key)}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
          {data.length > 0 ? (
            data.map((item, index) => {
              const computedRowClassName = typeof rowClassName === 'function' 
                ? rowClassName(item, index) 
                : rowClassName;
              
              return (
                <tr
                  key={index}
                  className={cn(
                    'hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-150',
                    onRowClick && 'cursor-pointer',
                    computedRowClassName
                  )}
                  onClick={onRowClick ? () => onRowClick(item, index) : undefined}
                >
                  {columns.map((column) => {
                    const value = item[column.key as keyof T];
                    const content = column.render 
                      ? column.render(value, item, index)
                      : String(value || '');
                    
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          'px-4 py-3 text-sm text-gray-900 dark:text-gray-100',
                          column.className
                        )}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
