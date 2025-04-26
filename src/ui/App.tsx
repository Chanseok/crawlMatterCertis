import { useMemo, useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import { useStatistics } from './useStatistics'
import { Chart } from './Charts';

function App() {
  const [count, setCount] = useState(0);
  const statistics = useStatistics(10);
  const cpuUsage = useMemo(() => statistics.map(stat => stat.cpuUsage), [statistics]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          {/* Chart Section */}
          <div className="h-32 mb-8"> 
            <Chart data={cpuUsage} maxDataPoints={10}/>
          </div>
          
          {/* Logo Section */}
          <div className="flex justify-center mb-6">
            <a href="https://react.dev" target="_blank" className="hover:opacity-80 transition-opacity">
              <img src={reactLogo} className="h-24" alt="React logo" />
            </a>
          </div>
          
          {/* Title Section */}
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-6">Matter Certification Crawler</h1>
          
          {/* Card Section */}
          <div className="bg-gray-100 dark:bg-gray-700 rounded-md p-6 mb-6">
            <button 
              onClick={() => setCount((count) => count + 1)}
              className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors mb-4"
            >
              count is {count}
            </button>
            <p className="text-gray-700 dark:text-gray-300">
              Edit <code className="bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">src/App.tsx</code> and save to test HMR
            </p>
          </div>
          
          {/* Footer Section */}
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Click on the Vite and React logos to learn more
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
