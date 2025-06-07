import React from 'react';
import { cn } from '../../../utils/common';

export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  className?: string;
  pulse?: boolean;
  icon?: React.ReactNode;
}

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  secondary: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  info: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200'
};

const badgeSizes: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base'
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  children,
  className,
  pulse = false,
  icon
}) => {
  return (
    <span
      className={cn(
        // Base styles
        'inline-flex items-center font-medium rounded-full',
        // Variant styles
        badgeVariants[variant],
        // Size styles
        badgeSizes[size],
        // Pulse animation
        pulse && 'animate-pulse',
        className
      )}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {children}
    </span>
  );
};

// Predefined status badges for common use cases
export const StatusBadge: React.FC<{
  status: 'idle' | 'running' | 'completed' | 'error' | 'paused' | 'stopped';
  size?: BadgeSize;
  className?: string;
}> = ({ status, size = 'md', className }) => {
  const statusConfig = {
    idle: { variant: 'default' as BadgeVariant, text: 'Idle', icon: '⏸️' },
    running: { variant: 'primary' as BadgeVariant, text: 'Running', icon: '▶️', pulse: true },
    completed: { variant: 'success' as BadgeVariant, text: 'Completed', icon: '✅' },
    error: { variant: 'danger' as BadgeVariant, text: 'Error', icon: '❌' },
    paused: { variant: 'warning' as BadgeVariant, text: 'Paused', icon: '⏸️' },
    stopped: { variant: 'secondary' as BadgeVariant, text: 'Stopped', icon: '⏹️' }
  };

  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant}
      size={size}
      className={className}
      pulse={'pulse' in config ? config.pulse : false}
      icon={config.icon}
    >
      {config.text}
    </Badge>
  );
};

export default Badge;
