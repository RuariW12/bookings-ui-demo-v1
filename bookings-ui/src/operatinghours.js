// operatingHours.js
const OPERATING_HOURS = {
  'CLD-HQ':   { open: '09:00', close: '19:00' }, // 9am – 7pm ET
  'CLD-CTC':  { open: '21:00', close: '05:00' }, // 9pm – 5am ET (overnight)
  'CLD-EMEA': { open: '03:00', close: '12:00' }, // 3am – 12pm ET
}

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function windowFor(region) {
  const hours = OPERATING_HOURS[region]
  if (!hours) return null
  const openMin = toMin(hours.open)
  let closeMin = toMin(hours.close)
  if (closeMin <= openMin) closeMin += 1440 // crosses midnight
  return { openMin, closeMin }
}

export function formatSlot(minOfDay) {
  const wall = ((minOfDay % 1440) + 1440) % 1440
  let h = Math.floor(wall / 60)
  const m = wall % 60
  const ampm = h < 12 ? 'AM' : 'PM'
  h = h % 12 === 0 ? 12 : h % 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

export function allowedStartTimes(region, durationMin, completionBound, stepMin = 30) {
  const win = windowFor(region)
  if (!win) return []
  const { openMin, closeMin } = win
  const lastStart = completionBound ? closeMin - durationMin : closeMin - stepMin
  const out = []
  for (let t = openMin; t <= lastStart; t += stepMin) {
    out.push({ value: t % 1440, label: formatSlot(t) })
  }
  return out
}

export function isStartAllowed(region, startMin, durationMin, completionBound) {
  const win = windowFor(region)
  if (!win) return false
  const { openMin, closeMin } = win
  const s = startMin < openMin ? startMin + 1440 : startMin
  return completionBound
    ? s >= openMin && s + durationMin <= closeMin
    : s >= openMin && s < closeMin
}

export { OPERATING_HOURS }