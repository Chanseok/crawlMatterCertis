import React, { useRef } from 'react';

interface ExpandableSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  additionalClasses?: string;
  isLoading?: boolean;
  loadingContent?: React.ReactNode;
}

export const ExpandableSection: React.FC<ExpandableSectionProps> = ({
  title,
  isExpanded,
  onToggle,
  children,
  additionalClasses = '',
  isLoading,
  loadingContent
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${additionalClasses}`}>
      {/* 헤더 (클릭 시 접기/펼치기) */}
      <div
        className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-750 cursor-pointer"
        onClick={onToggle}
      >
        <h3 className="font-medium text-gray-700 dark:text-gray-300">{title}</h3>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isExpanded ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* 내용 (접기/펼치기) */}
      <div
        ref={contentRef}
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isExpanded ? '5000px' : '0',
          opacity: isExpanded ? 1 : 0,
          visibility: isExpanded ? 'visible' : 'hidden',
          display: 'block',
          transition: isExpanded
            ? 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out, transform 0.3s ease-in-out'
            : 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out, transform 0.3s ease-in-out, visibility 0s linear 0.3s',
          transform: isExpanded ? 'translateY(0)' : 'translateY(-10px)',
        }}
      >
        <div className="p-4">
          {isLoading && loadingContent ? loadingContent : children}
        </div>
      </div>
    </div>
  );
};
