/**
 * CrawlingDashboard.integration.test.tsx
 * Integration test for Clean Architecture implementation
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { observer } from 'mobx-react-lite';
import CrawlingDashboard from '../CrawlingDashboard';

// Mock the stores
jest.mock('../../hooks/useCrawlingStore', () => ({
  useCrawlingStore: () => ({
    status: 'idle',
    progress: {
      currentStage: 1,
      currentPage: 0,
      processedItems: 0,
      totalItems: 0,
      percentage: 0,
      currentStep: 'waiting',
      elapsedTime: 0,
      stage1PageStatuses: []
    },
    config: {
      pageRangeLimit: 100,
      productsPerPage: 12,
      productListRetryCount: 3,
      productDetailRetryCount: 2
    },
    statusSummary: null,
    startCrawling: jest.fn(),
    stopCrawling: jest.fn(),
    checkStatus: jest.fn(),
    error: null,
    clearError: jest.fn()
  })
}));

jest.mock('../../hooks/useTaskStore', () => ({
  useTaskStore: () => ({
    concurrentTasks: []
  })
}));

// Mock all display components
jest.mock('../displays/CrawlingStageDisplay', () => ({
  CrawlingStageDisplay: ({ getStageBadge }: any) => (
    <div data-testid="stage-display">
      Stage Display - {getStageBadge().props.children}
    </div>
  )
}));

jest.mock('../displays/CrawlingControlsDisplay', () => ({
  CrawlingControlsDisplay: () => <div data-testid="controls-display">Controls Display</div>
}));

jest.mock('../displays/StatusDisplay', () => ({
  StatusDisplay: () => <div data-testid="status-display">Status Display</div>
}));

jest.mock('../displays/ProgressBarDisplay', () => ({
  ProgressBarDisplay: () => <div data-testid="progress-bar">Progress Bar</div>
}));

jest.mock('../displays/CrawlingMetricsDisplay', () => ({
  CrawlingMetricsDisplay: () => <div data-testid="metrics-display">Metrics Display</div>
}));

jest.mock('../displays/CollectionStatusDisplay', () => ({
  CollectionStatusDisplay: () => <div data-testid="collection-status">Collection Status</div>
}));

jest.mock('../displays/TimeDisplay', () => ({
  TimeDisplay: () => <div data-testid="time-display">Time Display</div>
}));

jest.mock('../displays/PageProgressDisplay', () => ({
  PageProgressDisplay: () => <div data-testid="page-progress">Page Progress</div>
}));

// Mock legacy components
jest.mock('../ExpandableSection', () => ({
  ExpandableSection: ({ children, title }: any) => (
    <div data-testid="expandable-section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}));

jest.mock('../StatusCheckLoadingAnimation', () => {
  const StatusCheckLoadingAnimation = () => <div data-testid="loading-animation">Loading...</div>;
  return StatusCheckLoadingAnimation;
});

jest.mock('../RetryStatusIndicator', () => ({
  RetryStatusIndicator: () => <div data-testid="retry-indicator">Retry Status</div>
}));

jest.mock('../StageTransitionIndicator', () => ({
  StageTransitionIndicator: () => <div data-testid="stage-transition">Stage Transition</div>
}));

jest.mock('../ValidationResultsPanel', () => ({
  ValidationResultsPanel: () => <div data-testid="validation-panel">Validation Panel</div>
}));

describe('CrawlingDashboard Integration', () => {
  const defaultProps = {
    appCompareExpanded: false,
    setAppCompareExpanded: jest.fn()
  };

  it('should render all Clean Architecture components', () => {
    render(<CrawlingDashboard {...defaultProps} />);

    // Check that all display components are rendered
    expect(screen.getByTestId('stage-display')).toBeInTheDocument();
    expect(screen.getByTestId('controls-display')).toBeInTheDocument();
    expect(screen.getByTestId('status-display')).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('metrics-display')).toBeInTheDocument();
    expect(screen.getByTestId('collection-status')).toBeInTheDocument();
    expect(screen.getByTestId('time-display')).toBeInTheDocument();
    expect(screen.getByTestId('page-progress')).toBeInTheDocument();
  });

  it('should integrate ViewModel correctly', () => {
    render(<CrawlingDashboard {...defaultProps} />);

    // Check that ViewModel-computed values are displayed
    expect(screen.getByTestId('stage-display')).toHaveTextContent('대기');
  });

  it('should render expandable section for site comparison', () => {
    render(<CrawlingDashboard {...defaultProps} />);

    expect(screen.getByTestId('expandable-section')).toBeInTheDocument();
    expect(screen.getByText('사이트 로컬 비교')).toBeInTheDocument();
  });

  it('should display main dashboard title', () => {
    render(<CrawlingDashboard {...defaultProps} />);

    expect(screen.getByText('크롤링 상태')).toBeInTheDocument();
  });
});
