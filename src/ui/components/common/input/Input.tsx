import React, { forwardRef } from 'react';
import { cn } from '../../../utils/common';

export type InputVariant = 'default' | 'error' | 'success';
export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: InputVariant;
  size?: InputSize;
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const inputVariants: Record<InputVariant, string> = {
  default: 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500',
  error: 'border-red-300 dark:border-red-600 focus:border-red-500 focus:ring-red-500',
  success: 'border-green-300 dark:border-green-600 focus:border-green-500 focus:ring-green-500'
};

const inputSizes: Record<InputSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-4 py-3 text-lg'
};

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  variant = 'default',
  size = 'md',
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  ...props
}, ref) => {
  const hasError = Boolean(error);
  const actualVariant = hasError ? 'error' : variant;

  return (
    <div className={cn('flex flex-col', fullWidth && 'w-full')}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-400 dark:text-gray-500 text-sm">
              {leftIcon}
            </span>
          </div>
        )}
        
        <input
          ref={ref}
          className={cn(
            // Base styles
            'block border rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 transition-colors duration-200',
            // Variant styles
            inputVariants[actualVariant],
            // Size styles
            inputSizes[size],
            // Icon padding
            leftIcon ? 'pl-10' : '',
            rightIcon ? 'pr-10' : '',
            // Width styles
            fullWidth && 'w-full',
            className
          )}
          {...props}
        />
        
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-gray-400 dark:text-gray-500 text-sm">
              {rightIcon}
            </span>
          </div>
        )}
      </div>
      
      {(error || helperText) && (
        <p className={cn(
          'mt-1 text-sm',
          hasError ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
        )}>
          {error || helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
