/**
 * DisplayUtils.ts
 * Centralized display formatting utilities for UI components
 * 
 * Consolidates display formatting logic from:
 * - CompactStatusDisplay
 * - CrawlingMetricsDisplay
 * - MissingPageCalculator
 * - PageRangeParser
 * - Various UI components
 */

import type { CrawlingRange } from './PageRangeParser.js';

/**
 * Status color mapping interface
 */
export interface StatusColorMapping {
  running: string;
  completed: string;
  error: string;
  paused: string;
  idle: string;
  [key: string]: string;
}

/**
 * Status display information
 */
export interface StatusDisplayInfo {
  text: string;
  color: string;
  bgColor: string;
  icon?: string;
}

/**
 * Progress display options
 */
export interface ProgressDisplayOptions {
  showPercentage?: boolean;
  showFraction?: boolean;
  showRemaining?: boolean;
  compactFormat?: boolean;
  stageIdentifier?: string;
  context?: string;
}

/**
 * Number formatting options
 */
export interface NumberFormatOptions {
  useLocale?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  unit?: string;
  compact?: boolean;
}

/**
 * Range display options
 */
export interface RangeDisplayOptions {
  format?: 'compact' | 'detailed' | 'copy-paste';
  includeTotal?: boolean;
  separator?: string;
  includePriority?: boolean;
}

/**
 * Centralized display formatting utilities class
 */
export class DisplayUtils {

  // === Status Display ===

  /**
   * Default status color mappings
   */
  private static readonly DEFAULT_STATUS_COLORS: StatusColorMapping = {
    running: 'text-blue-600 dark:text-blue-400',
    completed: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    paused: 'text-yellow-600 dark:text-yellow-400',
    idle: 'text-gray-600 dark:text-gray-400'
  };

  /**
   * Default status background colors
   */
  private static readonly DEFAULT_STATUS_BG_COLORS: StatusColorMapping = {
    running: 'bg-blue-100 dark:bg-blue-900/50',
    completed: 'bg-green-100 dark:bg-green-900/50',
    error: 'bg-red-100 dark:bg-red-900/50',
    paused: 'bg-yellow-100 dark:bg-yellow-900/50',
    idle: 'bg-gray-100 dark:bg-gray-900/50'
  };

  /**
   * Get status color class
   * 
   * @param status Status string
   * @param customColors Custom color mapping
   * @returns CSS color class
   */
  static getStatusColor(status: string, customColors?: StatusColorMapping): string {
    const colors = { ...this.DEFAULT_STATUS_COLORS, ...customColors };
    return colors[status] || colors.idle;
  }

  /**
   * Get status background color class
   * 
   * @param status Status string
   * @param customColors Custom background color mapping
   * @returns CSS background color class
   */
  static getStatusBgColor(status: string, customColors?: StatusColorMapping): string {
    const colors = { ...this.DEFAULT_STATUS_BG_COLORS, ...customColors };
    return colors[status] || colors.idle;
  }

  /**
   * Get localized status text
   * 
   * @param status Status string
   * @returns Localized status text
   */
  static getStatusText(status: string): string {
    const statusTexts: Record<string, string> = {
      running: '진행중',
      completed: '완료',
      error: '오류',
      paused: '일시정지',
      idle: '대기중',
      waiting: '대기중',
      checking: '확인중',
      preparing: '준비중'
    };

    return statusTexts[status] || status;
  }

  /**
   * Get complete status display information
   * 
   * @param status Status string
   * @param options Custom options
   * @returns Complete status display info
   */
  static getStatusDisplayInfo(
    status: string,
    options: {
      customColors?: StatusColorMapping;
      customBgColors?: StatusColorMapping;
      includeIcon?: boolean;
    } = {}
  ): StatusDisplayInfo {
    const { customColors, customBgColors, includeIcon = false } = options;

    const icons: Record<string, string> = {
      running: '🔄',
      completed: '✅',
      error: '❌',
      paused: '⏸️',
      idle: '⏳'
    };

    return {
      text: this.getStatusText(status),
      color: this.getStatusColor(status, customColors),
      bgColor: this.getStatusBgColor(status, customBgColors),
      icon: includeIcon ? icons[status] : undefined
    };
  }

  // === Progress Display ===

  /**
   * Format progress information
   * 
   * @param processed Number of processed items
   * @param total Total number of items
   * @param options Display options
   * @returns Formatted progress string
   */
  static formatProgress(
    processed: number,
    total: number,
    options: ProgressDisplayOptions = {}
  ): string {
    const {
      showPercentage = true,
      showFraction = true,
      showRemaining = false,
      compactFormat = false,
      stageIdentifier,
      context
    } = options;

    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    const remaining = Math.max(0, total - processed);

    let parts: string[] = [];

    // Add stage identifier
    if (stageIdentifier) {
      parts.push(`${stageIdentifier}:`);
    }

    // Add context
    if (context) {
      parts.push(context);
    }

    // Add fraction
    if (showFraction) {
      if (compactFormat) {
        parts.push(`${this.formatNumber(processed)}/${this.formatNumber(total)}`);
      } else {
        parts.push(`${this.formatNumber(processed)}개 / ${this.formatNumber(total)}개`);
      }
    }

    // Add percentage
    if (showPercentage) {
      parts.push(`(${percentage}%)`);
    }

    // Add remaining
    if (showRemaining && remaining > 0) {
      if (compactFormat) {
        parts.push(`${this.formatNumber(remaining)} 남음`);
      } else {
        parts.push(`${this.formatNumber(remaining)}개 남음`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Format progress message with completion status
   * 
   * @param processed Number of processed items
   * @param total Total number of items
   * @param percentage Optional percentage override
   * @param options Message options
   * @returns Formatted progress message
   */
  static formatProgressMessage(
    processed: number,
    total: number,
    percentage?: number,
    options: {
      messageTemplate?: string;
      stageIdentifier?: string;
      context?: string;
      isCompleted?: boolean;
      includePercentage?: boolean;
    } = {}
  ): string {
    const {
      stageIdentifier,
      context,
      isCompleted = false,
      includePercentage = true
    } = options;

    const percentageValue = percentage ?? (total > 0 ? Math.round((processed / total) * 100) : 0);
    const percentageText = includePercentage && !isCompleted ? ` (${percentageValue}%)` : '';
    
    // Construct message parts
    const stage = stageIdentifier ? `${stageIdentifier}: ` : '';
    const contextText = context ? ` ${context}` : '';
    
    if (isCompleted) {
      return `${stage}완료: ${this.formatNumber(total)}개${contextText} 처리됨`;
    }
    
    return `${stage}${contextText} ${this.formatNumber(processed)}/${this.formatNumber(total)} 처리 중${percentageText}`;
  }

  // === Number Formatting ===

  /**
   * Format number with localization and options
   * 
   * @param value Number to format
   * @param options Formatting options
   * @returns Formatted number string
   */
  static formatNumber(value: number, options: NumberFormatOptions = {}): string {
    const {
      useLocale = true,
      minimumFractionDigits = 0,
      maximumFractionDigits = 2,
      unit,
      compact = false
    } = options;

    if (!Number.isFinite(value)) {
      return '0';
    }

    let formatted: string;

    if (compact && Math.abs(value) >= 1000) {
      // Compact notation for large numbers
      if (Math.abs(value) >= 1000000) {
        formatted = `${(value / 1000000).toFixed(1)}M`;
      } else if (Math.abs(value) >= 1000) {
        formatted = `${(value / 1000).toFixed(1)}K`;
      } else {
        formatted = Math.round(value).toString();
      }
    } else if (useLocale) {
      formatted = value.toLocaleString('ko-KR', {
        minimumFractionDigits,
        maximumFractionDigits
      });
    } else {
      formatted = value.toFixed(maximumFractionDigits);
    }

    return unit ? `${formatted}${unit}` : formatted;
  }

  /**
   * Format percentage
   * 
   * @param value Percentage value (0-100)
   * @param decimals Number of decimal places
   * @returns Formatted percentage string
   */
  static formatPercentage(value: number, decimals: number = 0): string {
    if (!Number.isFinite(value)) {
      return '0%';
    }
    return `${value.toFixed(decimals)}%`;
  }

  /**
   * Format file size
   * 
   * @param bytes File size in bytes
   * @returns Formatted file size string
   */
  static formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // === Range Display ===

  /**
   * Format page ranges for display
   * 
   * @param ranges Array of crawling ranges
   * @param options Display options
   * @returns Formatted range string
   */
  static formatPageRanges(
    ranges: CrawlingRange[],
    options: RangeDisplayOptions = {}
  ): string {
    const {
      format = 'compact',
      includeTotal = false,
      separator = ', ',
      includePriority = false
    } = options;

    if (ranges.length === 0) {
      return '범위 없음';
    }

    const formattedRanges = ranges.map(range => {
      const totalPages = Math.abs(range.endPage - range.startPage) + 1;
      let rangeText: string;

      if (totalPages === 1) {
        rangeText = `${range.startPage}`;
      } else {
        rangeText = `${range.startPage}~${range.endPage}`;
      }

      // Add additional information based on format
      if (format === 'detailed') {
        rangeText += ` (${totalPages}페이지)`;
        if (includePriority && range.priority) {
          rangeText += ` [우선순위: ${range.priority}]`;
        }
      }

      return rangeText;
    });

    let result = formattedRanges.join(separator);

    if (includeTotal) {
      const totalPages = ranges.reduce((sum, range) => 
        sum + Math.abs(range.endPage - range.startPage) + 1, 0
      );
      result += ` (총 ${totalPages}페이지)`;
    }

    return result;
  }

  /**
   * Format range summary for copy-paste
   * 
   * @param ranges Array of crawling ranges
   * @returns Copy-paste ready range string
   */
  static formatRangesForCopyPaste(ranges: CrawlingRange[]): string {
    return this.formatPageRanges(ranges, {
      format: 'compact',
      separator: ', '
    });
  }

  /**
   * Format page range info for user display
   * 
   * @param pageRangeInfo Page range information
   * @returns Formatted string
   */
  static formatPageRangeInfo(pageRangeInfo: {
    pageRangeStart: number;
    pageRangeEnd: number;
    actualCrawlPages: number;
    estimatedProducts: number;
    totalPages: number;
  }): string {
    const { pageRangeStart, pageRangeEnd, actualCrawlPages, estimatedProducts, totalPages } = pageRangeInfo;
    
    return `페이지 ${pageRangeStart}-${pageRangeEnd} (총 ${actualCrawlPages}페이지, 전체 ${totalPages}페이지 중) / 예상 제품: ${this.formatNumber(estimatedProducts)}개`;
  }

  // === Stage and Badge Display ===

  /**
   * Get stage badge styling classes
   * 
   * @param currentStage Current stage number
   * @param isPurpleTheme Whether to use purple theme
   * @returns CSS classes for stage badge
   */
  static getStageBadgeClass(currentStage: number, isPurpleTheme: boolean = false): string {
    if (currentStage === 1 || currentStage === 3 || isPurpleTheme) {
      return 'bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200';
    }
    return 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200';
  }

  /**
   * Get progress bar color class
   * 
   * @param status Current status
   * @param isPurpleTheme Whether to use purple theme
   * @returns CSS classes for progress bar
   */
  static getProgressBarColor(status: string, isPurpleTheme: boolean = false): string {
    if (status === 'completed') return 'bg-purple-500';
    if (status === 'error') return 'bg-red-500';
    if (isPurpleTheme) return 'bg-purple-500';
    return 'bg-blue-500';
  }

  /**
   * Get theme-based text color
   * 
   * @param isPurpleTheme Whether to use purple theme
   * @param variant Color variant ('primary', 'secondary', 'muted')
   * @returns CSS text color class
   */
  static getThemeTextColor(
    isPurpleTheme: boolean, 
    variant: 'primary' | 'secondary' | 'muted' = 'primary'
  ): string {
    if (isPurpleTheme) {
      switch (variant) {
        case 'primary': return 'text-purple-700 dark:text-purple-300';
        case 'secondary': return 'text-purple-500 dark:text-purple-400';
        case 'muted': return 'text-purple-600 dark:text-purple-400';
      }
    } else {
      switch (variant) {
        case 'primary': return 'text-gray-700 dark:text-gray-300';
        case 'secondary': return 'text-gray-500 dark:text-gray-400';
        case 'muted': return 'text-gray-600 dark:text-gray-400';
      }
    }
  }

  /**
   * Get theme-based background color
   * 
   * @param isPurpleTheme Whether to use purple theme
   * @returns CSS background color class
   */
  static getThemeBgColor(isPurpleTheme: boolean): string {
    if (isPurpleTheme) {
      return 'bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800';
    }
    return 'bg-gray-50 dark:bg-gray-700';
  }

  // === Performance and Metrics Display ===

  /**
   * Format performance duration (specialized for performance metrics)
   * 
   * @param ms Duration in milliseconds
   * @returns Formatted duration string
   */
  static formatPerformanceDuration(ms: number): string {
    if (ms < 1) return '<1ms';
    if (ms < 100) return `${ms.toFixed(0)}ms`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /**
   * Get performance color indicator
   * 
   * @param ms Performance time in milliseconds
   * @returns CSS color class
   */
  static getPerformanceColor(ms: number): string {
    if (ms < 100) return 'text-green-600';
    if (ms < 500) return 'text-yellow-600';
    return 'text-red-600';
  }

  /**
   * Format metrics with animation class
   * 
   * @param value Metric value
   * @param isAnimated Whether to show animation
   * @param unit Optional unit
   * @returns Object with formatted value and CSS classes
   */
  static formatAnimatedMetric(
    value: number | string,
    isAnimated: boolean = false,
    unit?: string
  ): { text: string; className: string } {
    const formattedValue = typeof value === 'number' 
      ? this.formatNumber(value) 
      : value;

    const text = unit ? `${formattedValue}${unit}` : formattedValue;
    const className = isAnimated ? 'animate-flip' : '';

    return { text, className };
  }

  // === Validation Error Display ===

  /**
   * Format validation errors for user display
   * 
   * @param errors Validation errors object
   * @returns Array of formatted error messages
   */
  static formatValidationErrors(errors: Record<string, string[]>): string[] {
    return Object.entries(errors)
      .map(([field, fieldErrors]) => {
        const fieldName = field.replace(/([A-Z])/g, ' $1').toLowerCase();
        return `${fieldName}: ${fieldErrors.join(', ')}`;
      });
  }

  /**
   * Format field name for display
   * 
   * @param fieldName Camel case field name
   * @returns Human readable field name
   */
  static formatFieldName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  // === Utility Methods ===

  /**
   * Truncate text with ellipsis
   * 
   * @param text Text to truncate
   * @param maxLength Maximum length
   * @returns Truncated text
   */
  static truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Generate CSS classes for status indicator
   * 
   * @param status Current status
   * @param size Size variant ('sm', 'md', 'lg')
   * @returns Combined CSS classes
   */
  static getStatusIndicatorClasses(
    status: string,
    size: 'sm' | 'md' | 'lg' = 'md'
  ): string {
    const baseClasses = 'inline-flex items-center rounded-full font-medium';
    const sizeClasses = {
      sm: 'px-2 py-1 text-xs',
      md: 'px-3 py-1.5 text-sm',
      lg: 'px-4 py-2 text-base'
    };

    const colorClass = this.getStatusColor(status);
    const bgClass = this.getStatusBgColor(status);

    return `${baseClasses} ${sizeClasses[size]} ${colorClass} ${bgClass}`;
  }

  /**
   * Generate loading dots animation
   * 
   * @param count Number of dots
   * @returns Loading dots string
   */
  static getLoadingDots(count: number = 3): string {
    return '.'.repeat(count);
  }

  /**
   * Format boolean as yes/no text
   * 
   * @param value Boolean value
   * @returns Localized yes/no text
   */
  static formatBoolean(value: boolean): string {
    return value ? '예' : '아니오';
  }

  /**
   * Format array as comma-separated list
   * 
   * @param items Array of items
   * @param maxItems Maximum items to show
   * @returns Formatted list string
   */
  static formatList(items: any[], maxItems: number = 5): string {
    if (items.length === 0) return '없음';
    
    const displayItems = items.slice(0, maxItems);
    const formatted = displayItems.join(', ');
    
    if (items.length > maxItems) {
      return `${formatted} 외 ${items.length - maxItems}개`;
    }
    
    return formatted;
  }
}
