import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, 
  Pie, Cell, ResponsiveContainer, LineChart, Line
} from 'recharts';
import { toUIMatterProducts, type UIMatterProduct } from '../../types/ui-types';

// 차트 색상 설정
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

/**
 * 날짜 범위 슬라이더 컴포넌트
 */
interface DateRangeSliderProps {
  minDate: Date;
  maxDate: Date;
  startDate: Date;
  endDate: Date;
  onDateRangeChange: (startDate: Date, endDate: Date) => void;
}

function DateRangeSlider({ minDate, maxDate, startDate, endDate, onDateRangeChange }: DateRangeSliderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
  const startDays = Math.ceil((startDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
  const endDays = Math.ceil((endDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

  const handleStartChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDays = parseInt(event.target.value);
    const newStartDate = new Date(minDate.getTime() + newStartDays * 24 * 60 * 60 * 1000);
    onDateRangeChange(newStartDate, endDate);
  };

  const handleEndChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDays = parseInt(event.target.value);
    const newEndDate = new Date(minDate.getTime() + newEndDays * 24 * 60 * 60 * 1000);
    onDateRangeChange(startDate, newEndDate);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg mb-4">
      {/* 헤더 - 클릭으로 펼치기/접기 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors rounded-lg"
      >
        <div className="flex items-center space-x-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">인증 날짜 범위 필터</h4>
          {!isExpanded && (
            <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
              {formatDate(startDate)} ~ {formatDate(endDate)}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 내용 - 접기/펼치기에 따라 표시 */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">시작 날짜</label>
              <input
                type="range"
                min="0"
                max={totalDays}
                value={startDays}
                onChange={handleStartChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 slider-thumb"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>{formatDate(minDate)}</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">{formatDate(startDate)}</span>
                <span>{formatDate(maxDate)}</span>
              </div>
            </div>
            
            <div className="relative">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">종료 날짜</label>
              <input
                type="range"
                min="0"
                max={totalDays}
                value={endDays}
                onChange={handleEndChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 slider-thumb"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>{formatDate(minDate)}</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">{formatDate(endDate)}</span>
                <span>{formatDate(maxDate)}</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                선택된 기간: {formatDate(startDate)} ~ {formatDate(endDate)}
              </span>
              <button
                onClick={() => onDateRangeChange(minDate, maxDate)}
                className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded transition-colors"
              >
                전체 선택
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Matter 제품 데이터 분석 컴포넌트
 * 수집된 MatterProduct 데이터를 다양하게 분석하고 시각화합니다.
 */
export function AnalysisTab() {
  const [products, setProducts] = useState<UIMatterProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [selectedDeviceTypes, setSelectedDeviceTypes] = useState<string[]>([]);
  
  // 제품 유형 필터 확장 상태
  const [isDeviceTypeFilterExpanded, setIsDeviceTypeFilterExpanded] = useState(false);
  
  // 날짜 범위 필터 상태
  const [dateRangeStart, setDateRangeStart] = useState<Date | null>(null);
  const [dateRangeEnd, setDateRangeEnd] = useState<Date | null>(null);
  const [availableDateRange, setAvailableDateRange] = useState<{ min: Date; max: Date } | null>(null);
  
  // 데이터 테이블 페이지네이션 상태
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  
  // 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const result = await window.electron.getProducts({ limit: 10000 });
        setProducts(toUIMatterProducts(result.products));
      } catch (error) {
        console.error('데이터 로드 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // 사용 가능한 날짜 범위 계산
  useEffect(() => {
    if (products.length > 0) {
      const validDates = products
        .map(p => p.certificationDate)
        .filter((date): date is string | Date => date != null)
        .map(date => new Date(date))
        .filter(date => !isNaN(date.getTime()));
      
      if (validDates.length > 0) {
        const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
        
        setAvailableDateRange({ min: minDate, max: maxDate });
        
        // 초기 날짜 범위를 전체 범위로 설정
        if (!dateRangeStart || !dateRangeEnd) {
          setDateRangeStart(minDate);
          setDateRangeEnd(maxDate);
        }
      }
    }
  }, [products, dateRangeStart, dateRangeEnd]);
  
  // 날짜 범위 변경 핸들러
  const handleDateRangeChange = (startDate: Date, endDate: Date) => {
    setDateRangeStart(startDate);
    setDateRangeEnd(endDate);
  };
  
  // 날짜 범위로 필터링된 제품 목록
  const dateFilteredProducts = useMemo(() => {
    if (!dateRangeStart || !dateRangeEnd) return products;
    
    return products.filter(product => {
      if (!product.certificationDate) return false;
      
      try {
        const productDate = new Date(product.certificationDate);
        if (isNaN(productDate.getTime())) return false;
        
        return productDate >= dateRangeStart && productDate <= dateRangeEnd;
      } catch {
        return false;
      }
    });
  }, [products, dateRangeStart, dateRangeEnd]);

  // 필터링된 제품 목록
  const filteredProducts = useMemo(() => {
    let filtered = [...dateFilteredProducts];
    
    // 검색어 필터링
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        (p.manufacturer?.toLowerCase().includes(query)) ||
        (p.model?.toLowerCase().includes(query)) ||
        (p.deviceType?.toLowerCase().includes(query))
      );
    }
    
    // 유형별 필터링
    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.deviceType === filterType);
    }
    
    return filtered;
  }, [dateFilteredProducts, searchQuery, filterType]);
  
  // 페이지네이션 계산
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  
  // 현재 페이지가 범위를 벗어나면 첫 페이지로 리셋
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);
  
  // 페이지당 항목 수 변경 시 첫 페이지로 리셋
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };
  
  // 통계 데이터 계산 (날짜 필터링 적용)
  const statistics = useMemo(() => {
    if (!dateFilteredProducts.length) return null;
    
    // 제조사별 통계
    const manufacturerCounts = dateFilteredProducts.reduce((acc, product) => {
      const manufacturer = product.manufacturer || 'Unknown';
      acc[manufacturer] = (acc[manufacturer] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // 상위 10개 제조사 추출
    const topManufacturers = Object.entries(manufacturerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
    
    // 디바이스 유형별 통계
    const deviceTypeCounts = dateFilteredProducts.reduce((acc, product) => {
      const deviceType = product.deviceType || 'Unknown';
      acc[deviceType] = (acc[deviceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // 디바이스 유형 차트 데이터
    const deviceTypeChartData = Object.entries(deviceTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
      
    // 인증 날짜별 통계 (월별 및 제품 유형별)
    const certificationByMonthAndType = dateFilteredProducts.reduce((acc, product) => {
      if (!product.certificationDate) return acc;
      
      try {
        const date = new Date(product.certificationDate as string);
        if (!isNaN(date.getTime())) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const deviceType = product.deviceType || 'Unknown';
          
          if (!acc[monthKey]) {
            acc[monthKey] = {};
          }
          acc[monthKey][deviceType] = (acc[monthKey][deviceType] || 0) + 1;
          acc[monthKey]['total'] = (acc[monthKey]['total'] || 0) + 1;
        }
      } catch (e) {
        // 날짜 파싱 오류는 무시
      }
      
      return acc;
    }, {} as Record<string, Record<string, number>>);

    // 월별 데이터 정렬 및 전체 데이터
    const sortedMonths = Object.keys(certificationByMonthAndType)
      .sort((a, b) => a.localeCompare(b))
      .slice(-36); // 최근 36개월 (3년)
      
    const certMonthData = sortedMonths.map(month => ({
      name: month,
      value: certificationByMonthAndType[month]?.['total'] || 0
    }));

    // 제품 유형별 월별 데이터
    const certMonthDataByType = sortedMonths.map(month => {
      const monthData: any = { name: month };
      Object.keys(deviceTypeCounts).forEach(deviceType => {
        if (deviceType !== 'Unknown') {
          monthData[deviceType] = certificationByMonthAndType[month]?.[deviceType] || 0;
        }
      });
      return monthData;
    });
    
    // 규격 버전 분석
    const specVersionCounts = dateFilteredProducts.reduce((acc, product) => {
      const specVersion = product.specificationVersion || 'Unknown';
      acc[specVersion] = (acc[specVersion] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // 규격 버전 차트 데이터
    const specVersionData = Object.entries(specVersionCounts)
      .filter(([name]) => name !== 'Unknown' && name !== '')
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
    
    return {
      totalProducts: dateFilteredProducts.length,
      uniqueManufacturers: Object.keys(manufacturerCounts).length,
      uniqueDeviceTypes: Object.keys(deviceTypeCounts).length,
      topManufacturers,
      deviceTypeChartData,
      certMonthData,
      certMonthDataByType,
      deviceTypeCounts,
      specVersionData
    };
  }, [dateFilteredProducts]);
  
  // 디바이스 유형 목록 (필터용)
  const deviceTypes = useMemo(() => {
    const types = new Set<string>();
    dateFilteredProducts.forEach(p => {
      if (p.deviceType) types.add(p.deviceType);
    });
    return Array.from(types).sort();
  }, [dateFilteredProducts]);
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <>
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Matter 제품 데이터 분석</h2>
      
      {/* 날짜 범위 필터 */}
      {availableDateRange && dateRangeStart && dateRangeEnd && (
        <DateRangeSlider
          minDate={availableDateRange.min}
          maxDate={availableDateRange.max}
          startDate={dateRangeStart}
          endDate={dateRangeEnd}
          onDateRangeChange={handleDateRangeChange}
        />
      )}
      
      {/* 요약 통계 */}
      {statistics && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className={`p-3 rounded-lg shadow-md bg-white dark:bg-gray-800 text-center border ${
            activeTab === 0 ? 'border-blue-200 dark:border-blue-600' :
            activeTab === 1 ? 'border-emerald-200 dark:border-emerald-600' :
            activeTab === 2 ? 'border-purple-200 dark:border-purple-600' :
            'border-orange-200 dark:border-orange-600'
          }`}>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">총 제품 수</div>
            <div className={`text-2xl font-bold ${
              activeTab === 0 ? 'text-blue-700 dark:text-blue-300' :
              activeTab === 1 ? 'text-emerald-700 dark:text-emerald-300' :
              activeTab === 2 ? 'text-purple-700 dark:text-purple-300' :
              'text-orange-700 dark:text-orange-300'
            }`}>{statistics.totalProducts.toLocaleString()}</div>
          </div>
          
          <div className={`p-3 rounded-lg shadow-md bg-white dark:bg-gray-800 text-center border ${
            activeTab === 0 ? 'border-blue-200 dark:border-blue-600' :
            activeTab === 1 ? 'border-emerald-200 dark:border-emerald-600' :
            activeTab === 2 ? 'border-purple-200 dark:border-purple-600' :
            'border-orange-200 dark:border-orange-600'
          }`}>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">제조사 수</div>
            <div className={`text-2xl font-bold ${
              activeTab === 0 ? 'text-blue-700 dark:text-blue-300' :
              activeTab === 1 ? 'text-emerald-700 dark:text-emerald-300' :
              activeTab === 2 ? 'text-purple-700 dark:text-purple-300' :
              'text-orange-700 dark:text-orange-300'
            }`}>{statistics.uniqueManufacturers.toLocaleString()}</div>
          </div>
          
          <div className={`p-3 rounded-lg shadow-md bg-white dark:bg-gray-800 text-center border ${
            activeTab === 0 ? 'border-blue-200 dark:border-blue-600' :
            activeTab === 1 ? 'border-emerald-200 dark:border-emerald-600' :
            activeTab === 2 ? 'border-purple-200 dark:border-purple-600' :
            'border-orange-200 dark:border-orange-600'
          }`}>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">디바이스 유형 수</div>
            <div className={`text-2xl font-bold ${
              activeTab === 0 ? 'text-blue-700 dark:text-blue-300' :
              activeTab === 1 ? 'text-emerald-700 dark:text-emerald-300' :
              activeTab === 2 ? 'text-purple-700 dark:text-purple-300' :
              'text-orange-700 dark:text-orange-300'
            }`}>{statistics.uniqueDeviceTypes.toLocaleString()}</div>
          </div>
        </div>
      )}
      
      {/* 분석 서브 탭 - 다이어리 스타일 */}
      <div className="mb-8">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg">
          <div className="px-6 pt-4">
            <div className="flex space-x-1">
              {[
                { id: 0, label: '제품 현황', icon: '📊', theme: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-600', accent: 'from-blue-500 to-indigo-500' } },
                { id: 1, label: '제조사 분석', icon: '🏭', theme: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-600', accent: 'from-emerald-500 to-teal-500' } },
                { id: 2, label: '디바이스 유형 분석', icon: '📱', theme: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-600', accent: 'from-purple-500 to-violet-500' } },
                { id: 3, label: '데이터 테이블', icon: '📋', theme: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-600', accent: 'from-orange-500 to-amber-500' } }
              ].map((tab, index) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative px-5 py-3 font-medium text-sm whitespace-nowrap
                    transition-all duration-200 ease-in-out rounded-t-lg
                    focus:outline-none
                    ${activeTab === tab.id
                      ? `${tab.theme.bg} ${tab.theme.text} ${tab.theme.border} border-t border-l border-r border-b-0 shadow-md -mb-px z-10`
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 border border-transparent hover:border-gray-200 dark:hover:border-gray-500'
                    }
                    ${index === 0 ? 'ml-0' : ''}
                  `}
                  style={{
                    boxShadow: activeTab === tab.id 
                      ? '0 -2px 8px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)' 
                      : 'none'
                  }}
                >
                  <span className="mr-2 text-base">{tab.icon}</span>
                  <span className="font-semibold">{tab.label}</span>
                  
                  {/* 활성 탭 강조 선 */}
                  {activeTab === tab.id && (
                    <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r ${tab.theme.accent} rounded-full`}></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className={`
          border rounded-b-lg shadow-sm p-6 relative
          ${activeTab === 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-600' :
            activeTab === 1 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-600' :
            activeTab === 2 ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-600' :
            'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-600'
          }
        `}>
          {/* 활성 탭 위치의 상단 테두리 제거를 위한 가상 요소 */}
          <div 
            className={`absolute top-0 h-px z-20 ${
              activeTab === 0 ? 'bg-blue-50 dark:bg-blue-900/20' :
              activeTab === 1 ? 'bg-emerald-50 dark:bg-emerald-900/20' :
              activeTab === 2 ? 'bg-purple-50 dark:bg-purple-900/20' :
              'bg-orange-50 dark:bg-orange-900/20'
            }`}
            style={{
              left: `${activeTab * 150 + 24}px`,
              width: '150px',
              transform: 'translateY(-1px)'
            }}
          />
          {/* 제품 현황 */}
          {activeTab === 0 && (
            <div>
              <p className="mb-4 text-gray-700 dark:text-gray-300">
                이 탭에서는 수집된 Matter 인증 제품의 전반적인 현황을 확인할 수 있습니다. 
                상단의 날짜 범위 필터를 사용하여 특정 기간의 인증 데이터를 분석할 수 있습니다.
              </p>
              
              {statistics && statistics.certMonthData.length > 0 && (
                <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800 mb-4 border border-blue-200 dark:border-blue-600">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">월별 제품 인증 추세</h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">제품 유형 필터:</span>
                      <button
                        onClick={() => setSelectedDeviceTypes([])}
                        className={`px-3 py-1 text-xs rounded-full border ${
                          selectedDeviceTypes.length === 0
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
                        }`}
                      >
                        전체
                      </button>
                      <button
                        onClick={() => setIsDeviceTypeFilterExpanded(!isDeviceTypeFilterExpanded)}
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600 transition-colors flex items-center space-x-1"
                      >
                        <span>상세 필터</span>
                        <svg
                          className={`w-3 h-3 transition-transform ${
                            isDeviceTypeFilterExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {/* 제품 유형 선택 체크박스 - 접기/펼치기 */}
                  {isDeviceTypeFilterExpanded && (
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {deviceTypes.map((deviceType) => (
                          <label key={deviceType} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedDeviceTypes.includes(deviceType)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDeviceTypes(prev => [...prev, deviceType]);
                                } else {
                                  setSelectedDeviceTypes(prev => prev.filter(t => t !== deviceType));
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                              {deviceType}
                            </span>
                          </label>
                        ))}
                      </div>
                      {selectedDeviceTypes.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-gray-600 dark:text-gray-400 mr-2">선택된 유형:</span>
                            {selectedDeviceTypes.map(type => (
                              <span
                                key={type}
                                className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 px-2 py-1 rounded-full"
                              >
                                {type}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={selectedDeviceTypes.length > 0 ? statistics.certMonthDataByType : statistics.certMonthData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {selectedDeviceTypes.length > 0 ? (
                          selectedDeviceTypes.map((deviceType, index) => (
                            <Line
                              key={deviceType}
                              type="monotone"
                              dataKey={deviceType}
                              name={deviceType}
                              stroke={COLORS[index % COLORS.length]}
                              activeDot={{ r: 6 }}
                              strokeWidth={2}
                            />
                          ))
                        ) : (
                          <Line
                            type="monotone"
                            dataKey="value"
                            name="전체 인증 제품 수"
                            stroke="#8884d8"
                            activeDot={{ r: 8 }}
                            strokeWidth={2}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              
              {statistics && statistics.specVersionData.length > 0 && (
                <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-600">
                  <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">규격 버전별 제품 분포</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={statistics.specVersionData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" name="제품 수" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 제조사 분석 */}
          {activeTab === 1 && (
            <div>
              <p className="mb-4 text-gray-700 dark:text-gray-300">
                이 탭에서는 제조사별 Matter 인증 제품 분포를 분석할 수 있습니다.
                상단의 날짜 범위 필터를 사용하여 특정 기간에 인증받은 제품들만 분석할 수 있습니다.
              </p>
              
              {statistics && statistics.topManufacturers.length > 0 && (
                <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800 mb-4 border border-emerald-200 dark:border-emerald-600">
                  <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">상위 제조사 분포</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statistics.topManufacturers}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {statistics.topManufacturers.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">제조사</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">제품 수</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">비율</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {statistics.topManufacturers.map((item, index) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{item.name}</td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-200">{item.value}</td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-200">{((item.value / statistics.totalProducts) * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 디바이스 유형 분석 */}
          {activeTab === 2 && (
            <div>
              <p className="mb-4 text-gray-700 dark:text-gray-300">
                이 탭에서는 디바이스 유형별 Matter 인증 제품 분포를 분석할 수 있습니다.
                상단의 날짜 범위 필터를 사용하여 특정 기간에 인증받은 제품들만 분석할 수 있습니다.
              </p>
              
              {statistics && statistics.deviceTypeChartData.length > 0 && (
                <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800 mb-4 border border-purple-200 dark:border-purple-600">
                  <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">디바이스 유형 분포</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={statistics.deviceTypeChartData}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="value" name="제품 수" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">디바이스 유형</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">제품 수</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">비율</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {Object.entries(statistics.deviceTypeCounts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([type, count], index) => (
                              <tr key={type} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                                <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{type}</td>
                                <td className="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-200">{count}</td>
                                <td className="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-200">{((count / statistics.totalProducts) * 100).toFixed(1)}%</td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 데이터 테이블 */}
          {activeTab === 3 && (
            <div className="mb-4">
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <select
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 w-full md:w-64"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="all">모든 디바이스</option>
                  {deviceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                
                <input
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 flex-1"
                  placeholder="검색어 입력..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                
                <select
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 w-full md:w-32"
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                >
                  <option value={20}>20개</option>
                  <option value={50}>50개</option>
                  <option value={100}>100개</option>
                  <option value={200}>200개</option>
                  <option value={500}>500개</option>
                </select>
              </div>
              
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  총 {filteredProducts.length}개 제품 
                  {filteredProducts.length > 0 && (
                    <span className="text-gray-500 dark:text-gray-400">
                      ({startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredProducts.length)} 표시)
                    </span>
                  )}
                </p>
                
                {totalPages > 1 && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      이전
                    </button>
                    
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {currentPage} / {totalPages}
                    </span>
                    
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      다음
                    </button>
                  </div>
                )}
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full max-w-5xl divide-y divide-gray-200 dark:divide-gray-700 text-sm table-fixed">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24">인증날짜</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24">디바이스유형</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-20">제조사</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-36">모델명</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-28">Transport Interface</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedProducts.map((product, idx) => (
                      <tr key={product.id || idx} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 dark:text-gray-200">
                          {product.certificationDate 
                            ? new Date(product.certificationDate as string).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
                            : '-'
                          }
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 dark:text-gray-200">
                          {product.deviceType ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                              {product.deviceType}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 dark:text-gray-200 w-20 max-w-[5rem] truncate" title={product.manufacturer || '-'}>{product.manufacturer || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 dark:text-gray-200 truncate" title={product.model || '-'}>{product.model || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 dark:text-gray-200">{product.transportInterface || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {filteredProducts.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    조건에 맞는 제품이 없습니다.
                  </div>
                )}
              </div>
              
              {/* 하단 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center mt-4 space-x-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    처음
                  </button>
                  
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    이전
                  </button>
                  
                  {/* 페이지 번호 표시 */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageStart = Math.max(1, currentPage - 2);
                    const pageEnd = Math.min(totalPages, pageStart + 4);
                    const adjustedStart = Math.max(1, pageEnd - 4);
                    const pageNum = adjustedStart + i;
                    
                    if (pageNum > totalPages) return null;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-2 text-sm rounded transition-colors ${
                          currentPage === pageNum
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    다음
                  </button>
                  
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    마지막
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-md">
        <h3 className="text-sm font-medium mb-2">향후 기능 업데이트 예정</h3>
        <p className="text-xs">
          향후 업데이트에서는 다음과 같은 추가 분석 기능이 제공될 예정입니다:
        </p>
        <ul className="pl-5 mt-2 text-xs list-disc">
          <li className="mb-1">전송 인터페이스별 분석 (transportInterface 필드 활용)</li>
          <li className="mb-1">제품 버전 트렌드 (softwareVersion, hardwareVersion 필드 활용)</li>
          <li className="mb-1">제품군별 분석 (familyId, familySku 필드 활용)</li>
          <li className="mb-1">VID/PID 조합 분석 (제조사별 제품 라인업 시각화)</li>
          <li className="mb-1">Matter 규격 버전 채택 트렌드 (specificationVersion 필드 활용)</li>
          <li>어플리케이션 카테고리 기반 제품 간 호환성 분석 (applicationCategories 필드 활용)</li>
        </ul>
      </div>
    </>
  );
}
