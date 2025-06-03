import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, 
  Pie, Cell, ResponsiveContainer, LineChart, Line
} from 'recharts';
import { toUIMatterProducts, type UIMatterProduct } from '../../types/ui-types';

// 차트 색상 설정
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

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
  
  // 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const result = await window.electron.getProducts({ limit: 1000 });
        setProducts(toUIMatterProducts(result.products));
      } catch (error) {
        console.error('데이터 로드 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // 필터링된 제품 목록
  const filteredProducts = useMemo(() => {
    let filtered = [...products];
    
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
  }, [products, searchQuery, filterType]);
  
  // 통계 데이터 계산
  const statistics = useMemo(() => {
    if (!products.length) return null;
    
    // 제조사별 통계
    const manufacturerCounts = products.reduce((acc, product) => {
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
    const deviceTypeCounts = products.reduce((acc, product) => {
      const deviceType = product.deviceType || 'Unknown';
      acc[deviceType] = (acc[deviceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // 디바이스 유형 차트 데이터
    const deviceTypeChartData = Object.entries(deviceTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
    
    // 인증 날짜별 통계 (월별)
    const certificationByMonth = products.reduce((acc, product) => {
      if (!product.certificationDate) return acc;
      
      try {
        const date = new Date(product.certificationDate as string);
        if (!isNaN(date.getTime())) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          acc[monthKey] = (acc[monthKey] || 0) + 1;
        }
      } catch (e) {
        // 날짜 파싱 오류는 무시
      }
      
      return acc;
    }, {} as Record<string, number>);
    
    // 월별 데이터 정렬
    const sortedMonths = Object.keys(certificationByMonth)
      .sort((a, b) => a.localeCompare(b))
      .slice(-12); // 최근 12개월
      
    const certMonthData = sortedMonths.map(month => ({
      name: month,
      value: certificationByMonth[month] || 0
    }));
    
    // 규격 버전 분석
    const specVersionCounts = products.reduce((acc, product) => {
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
      totalProducts: products.length,
      uniqueManufacturers: Object.keys(manufacturerCounts).length,
      uniqueDeviceTypes: Object.keys(deviceTypeCounts).length,
      topManufacturers,
      deviceTypeChartData,
      certMonthData,
      deviceTypeCounts,
      specVersionData
    };
  }, [products]);
  
  // 디바이스 유형 목록 (필터용)
  const deviceTypes = useMemo(() => {
    const types = new Set<string>();
    products.forEach(p => {
      if (p.deviceType) types.add(p.deviceType);
    });
    return Array.from(types).sort();
  }, [products]);
  
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
      
      {/* 요약 통계 */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">총 제품 수</span>
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{statistics.totalProducts.toLocaleString()}</p>
            <span className="text-xs text-gray-500 dark:text-gray-400">수집된 총 제품 수</span>
          </div>
          
          <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">제조사 수</span>
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{statistics.uniqueManufacturers.toLocaleString()}</p>
            <span className="text-xs text-gray-500 dark:text-gray-400">유니크 제조사 수</span>
          </div>
          
          <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">디바이스 유형 수</span>
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{statistics.uniqueDeviceTypes.toLocaleString()}</p>
            <span className="text-xs text-gray-500 dark:text-gray-400">유니크 디바이스 유형 수</span>
          </div>
        </div>
      )}
      
      {/* 분석 탭 */}
      <div className="mb-8">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex -mb-px">
            <button
              className={`py-2 px-4 mr-2 font-medium text-sm border-b-2 ${
                activeTab === 0 ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              onClick={() => setActiveTab(0)}
            >
              제품 현황
            </button>
            <button
              className={`py-2 px-4 mr-2 font-medium text-sm border-b-2 ${
                activeTab === 1 ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              onClick={() => setActiveTab(1)}
            >
              제조사 분석
            </button>
            <button
              className={`py-2 px-4 mr-2 font-medium text-sm border-b-2 ${
                activeTab === 2 ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              onClick={() => setActiveTab(2)}
            >
              디바이스 유형 분석
            </button>
            <button
              className={`py-2 px-4 mr-2 font-medium text-sm border-b-2 ${
                activeTab === 3 ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              onClick={() => setActiveTab(3)}
            >
              데이터 테이블
            </button>
          </nav>
        </div>
        
        <div className="py-4">
          {/* 제품 현황 */}
          {activeTab === 0 && (
            <div>
              <p className="mb-4 text-gray-700 dark:text-gray-300">
                이 탭에서는 수집된 Matter 인증 제품의 전반적인 현황을 확인할 수 있습니다.
              </p>
              
              {statistics && statistics.certMonthData.length > 0 && (
                <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800 mb-4">
                  <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">월별 제품 인증 추세</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={statistics.certMonthData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="value" name="인증 제품 수" stroke="#8884d8" activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              
              {statistics && statistics.specVersionData.length > 0 && (
                <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800">
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
              </p>
              
              {statistics && statistics.topManufacturers.length > 0 && (
                <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800 mb-4">
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
              </p>
              
              {statistics && statistics.deviceTypeChartData.length > 0 && (
                <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800 mb-4">
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
              </div>
              
              <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">총 {filteredProducts.length}개 제품</p>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">제조사</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">모델</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">디바이스 유형</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">인증 ID</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">인증 날짜</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">버전</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredProducts.slice(0, 100).map((product, idx) => (
                      <tr key={product.id || idx} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.manufacturer || '-'}</td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.model || '-'}</td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                          {product.deviceType ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                              {product.deviceType}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.certificateId || '-'}</td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                          {product.certificationDate 
                            ? new Date(product.certificationDate as string).toLocaleDateString() 
                            : '-'
                          }
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{product.softwareVersion || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredProducts.length > 100 && (
                  <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
                    처음 100개 항목만 표시됩니다
                  </p>
                )}
              </div>
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
