import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function blueDotIcon() {
  return L.divIcon({
    className: 'custom-marker',
    html:
      '<div style="width:22px;height:22px;background:radial-gradient(circle,#4dd9ff 0%,#00c3ff 60%,#0091d5 100%);' +
      'border-radius:50%;border:3.5px solid #fff;box-shadow:0 0 16px rgba(0,195,255,.7),0 0 36px rgba(0,195,255,.35),0 2px 8px rgba(0,0,0,.4);"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function ambulanceIcon() {
  return L.divIcon({
    className: 'custom-marker',
    html: `<svg class="ambulance-marker" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="9" width="24" height="17" rx="3.5" fill="#fff" stroke="#e0e0e0" stroke-width=".5"/>
      <rect x="26" y="13" width="12" height="13" rx="2.5" fill="#fff" stroke="#e0e0e0" stroke-width=".5"/>
      <rect x="11" y="13" width="3" height="8" rx="1.2" fill="#00c3ff"/>
      <rect x="9" y="15.5" width="7.5" height="3" rx="1.2" fill="#00c3ff"/>
      <circle cx="11" cy="27.5" r="3" fill="#334" stroke="#fff" stroke-width="1.2"/>
      <circle cx="31" cy="27.5" r="3" fill="#334" stroke="#fff" stroke-width="1.2"/>
    </svg>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

export function TransportMap({ reading }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markerRef = useRef(null)
  const polylineRef = useRef(null)
  const pathRef = useRef([])
  const [indicator, setIndicator] = useState(() => localStorage.getItem('mapIndicator') || 'bluedot')
  const [fullscreen, setFullscreen] = useState(false)

  // Init map once
  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return
    const map = L.map(mapRef.current, { center: [19.076, 72.877], zoom: 14 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapInstance.current = map
    markerRef.current = L.marker([19.076, 72.877], { icon: blueDotIcon() }).addTo(map)
    polylineRef.current = L.polyline([], { color: '#00c3ff', weight: 3, opacity: 0.7, smoothFactor: 1 }).addTo(map)
    setTimeout(() => map.invalidateSize(), 300)

    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // Swap marker icon when indicator preference changes — this fully
  // removes and recreates the marker, same fix as the original
  // transport.js setIndicator(), which mattered because Leaflet
  // doesn't let you swap a divIcon's HTML in place reliably.
  useEffect(() => {
    if (!markerRef.current || !mapInstance.current) return
    const pos = markerRef.current.getLatLng()
    mapInstance.current.removeLayer(markerRef.current)
    markerRef.current = L.marker(pos, { icon: indicator === 'ambulance' ? ambulanceIcon() : blueDotIcon() }).addTo(
      mapInstance.current
    )
    localStorage.setItem('mapIndicator', indicator)
  }, [indicator])

  // New reading -> move marker, extend the trail
  useEffect(() => {
    if (!reading?.lat || !reading?.lng || !markerRef.current || !mapInstance.current) return
    const pos = [reading.lat, reading.lng]
    markerRef.current.setLatLng(pos)
    pathRef.current.push(pos)
    if (pathRef.current.length > 500) pathRef.current.shift()
    polylineRef.current.setLatLngs(pathRef.current)
    mapInstance.current.panTo(pos, { animate: true, duration: 0.5 })
  }, [reading?.lat, reading?.lng])

  useEffect(() => {
    const t = setTimeout(() => mapInstance.current?.invalidateSize(), 350)
    return () => clearTimeout(t)
  }, [fullscreen])

  return (
    <div className={`panel map-panel ${fullscreen ? 'fullscreen' : ''}`}>
      <div className="panel-header">
        <h2>Live GPS Tracking</h2>
        <div className="map-controls">
          <button onClick={() => setIndicator((i) => (i === 'ambulance' ? 'bluedot' : 'ambulance'))}>
            {indicator === 'ambulance' ? 'Ambulance' : 'Blue dot'}
          </button>
          <button onClick={() => setFullscreen((f) => !f)}>{fullscreen ? 'Minimize' : 'Fullscreen'}</button>
        </div>
      </div>
      <div ref={mapRef} className="map-container" />
    </div>
  )
}
