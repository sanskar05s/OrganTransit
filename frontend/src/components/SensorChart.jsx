import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export function SensorChart({ readings }) {
  const data = {
    labels: readings.map((r) => new Date(r.ts).toLocaleTimeString()),
    datasets: [
      {
        label: 'Temperature (\u00b0C)',
        data: readings.map((r) => r.temp),
        borderColor: '#00c3ff',
        backgroundColor: 'rgba(0,195,255,.08)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#00c3ff',
      },
      {
        label: 'Humidity (%)',
        data: readings.map((r) => r.hum),
        borderColor: '#00e676',
        backgroundColor: 'rgba(0,230,118,.08)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#00e676',
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { labels: { color: '#8ea4bf', font: { family: 'Inter', size: 11 }, boxWidth: 14 } },
      tooltip: { backgroundColor: '#132e4a', titleColor: '#f0f4f8', bodyColor: '#8ea4bf', cornerRadius: 8 },
    },
    scales: {
      x: { ticks: { color: '#8ea4bf', font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.04)' } },
      y: { ticks: { color: '#8ea4bf', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
    },
  }

  return (
    <div className="panel chart-panel">
      <div className="panel-header">
        <h2>Sensor History</h2>
      </div>
      <div className="chart-container">
        {readings.length === 0 ? (
          <p className="chart-empty">No readings yet.</p>
        ) : (
          <Line data={data} options={options} />
        )}
      </div>
    </div>
  )
}
