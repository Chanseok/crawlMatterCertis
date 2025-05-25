
import { observer } from 'mobx-react-lite';
import { useDatabaseStore } from '../hooks/useDatabaseStore';
import { useCrawlingStore } from '../hooks/useCrawlingStore';

export const AnalysisTab = observer(() => {
  const { summary } = useDatabaseStore();
  const { statusSummary } = useCrawlingStore();

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">데이터 분석</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 데이터베이스 통계 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">데이터베이스 현황</h3>
          {summary ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>총 제품 수:</span>
                <span className="font-semibold">{summary.totalProducts?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>마지막 업데이트:</span>
                <span className="font-semibold">
                  {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">데이터를 로딩 중...</p>
          )}
        </div>

        {/* 크롤링 통계 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">크롤링 현황</h3>
          {statusSummary ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>사이트 총 페이지:</span>
                <span className="font-semibold">{statusSummary.siteTotalPages || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>사이트 제품 수:</span>
                <span className="font-semibold">{statusSummary.siteProductCount?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>차이:</span>
                <span className={`font-semibold ${statusSummary.diff > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                  {statusSummary.diff > 0 ? `+${statusSummary.diff}` : statusSummary.diff}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">데이터를 로딩 중...</p>
          )}
        </div>

        {/* 추가 분석 섹션 */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4">상세 분석</h3>
          <div className="text-gray-600">
            <p>제품 데이터에 대한 상세 분석 기능이 여기에 표시됩니다.</p>
            <p className="mt-2">향후 업데이트에서 차트와 그래프가 추가될 예정입니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
});