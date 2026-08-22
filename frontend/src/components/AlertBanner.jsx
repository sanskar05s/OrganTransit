export function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null
  return <div className="alert-banner">{alerts.map((a) => a.message).join(' | ')}</div>
}
