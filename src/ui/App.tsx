import { useMemo, useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import { useStatistics } from './useStatistics'
import { Chart } from './Charts';
import { Chart } from './Charts';

function App() {
  const [count, setCount] = useState(0);
  const statistics = useStatistics(10);
  const cpuUsage = useMemo(() => statistics.map(stat => stat.cpuUsage), [statistics]);
  const cpuUsage = useMemo(() => statistics.map(stat => stat.cpuUsage), [statistics]);

  // console.log(statistics);
  // console.log(statistics);

  return (
    <div className="App">
      <div style={{ height: 120 }}> 
        <Chart data={cpuUsage} maxDataPoints={10}/>
      </div>
    <div className="App">
      <div style={{ height: 120 }}> 
        <Chart data={cpuUsage} maxDataPoints={10}/>
      </div>
      <div>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </div>
    </div>
  )
}

export default App
