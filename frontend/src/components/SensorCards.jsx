const CARDS = [
  { key: 'temp', label: 'Temperature', unit: '°C' },
  { key: 'hum', label: 'Humidity', unit: '%' },
  { key: 'ax', label: 'Accel X', unit: 'g' },
  { key: 'ay', label: 'Accel Y', unit: 'g' },
  { key: 'az', label: 'Accel Z', unit: 'g' },
  { key: 'tilt', label: 'Tilt Angle', unit: '°' },
  { key: 'lat', label: 'Latitude', unit: '°' },
  { key: 'lng', label: 'Longitude', unit: '°' },
]

export function SensorCards({ reading }) {
  return (
    <section className="sensor-panel">
      {CARDS.map((c) => (
        <div className="sensor-card" key={c.key}>
          <span className="sensor-label">{c.label}</span>
          <span className="sensor-value">{reading ? reading[c.key] ?? '--' : '--'}</span>
          <span className="sensor-unit">{c.unit}</span>
        </div>
      ))}
    </section>
  )
}
