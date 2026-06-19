import { Session, KPIs, DayStats } from './types'

export function calcKPIs(sessions: Session[]): KPIs {
  if (sessions.length === 0) {
    return { totalTrades: 0, winRate: 0, profitFactor: 0, avgCierre: 0, totalPts: 0, maxDD: 0, avgWin: 0, avgLoss: 0 }
  }

  const wins = sessions.filter(s => (s.cierre ?? 0) >= 0)
  const losses = sessions.filter(s => (s.cierre ?? 0) < 0)

  const grossProfit = wins.reduce((sum, s) => sum + (s.cierre ?? 0), 0)
  const grossLoss = Math.abs(losses.reduce((sum, s) => sum + (s.cierre ?? 0), 0))

  let peak = 0
  let maxDD = 0
  let cumulative = 0
  for (const s of sessions) {
    cumulative += s.cierre ?? 0
    if (cumulative > peak) peak = cumulative
    const dd = peak - cumulative
    if (dd > maxDD) maxDD = dd
  }

  return {
    totalTrades: sessions.length,
    winRate: (wins.length / sessions.length) * 100,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 999,
    avgCierre: sessions.reduce((sum, s) => sum + (s.cierre ?? 0), 0) / sessions.length,
    totalPts: sessions.reduce((sum, s) => sum + (s.cierre ?? 0), 0),
    maxDD,
    avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
  }
}

export function calcDayStats(sessions: Session[]): DayStats[] {
  const days = ['Dom', 'Lun', 'Mar']
  const dayMap: Record<string, string> = {
    'Sun': 'Dom', 'Mon': 'Lun', 'Tue': 'Mar',
    'Domingo': 'Dom', 'Lunes': 'Lun', 'Martes': 'Mar',
    'Dom': 'Dom', 'Lun': 'Lun', 'Mar': 'Mar',
  }

  return days.map(dia => {
    const daySessions = sessions.filter(s => {
      const mapped = dayMap[s.dia] || s.dia
      return mapped === dia
    })
    const wins = daySessions.filter(s => (s.cierre ?? 0) >= 0)
    const totalPts = daySessions.reduce((sum, s) => sum + (s.cierre ?? 0), 0)

    return {
      dia,
      trades: daySessions.length,
      wins: wins.length,
      winRate: daySessions.length > 0 ? (wins.length / daySessions.length) * 100 : 0,
      avgPts: daySessions.length > 0 ? totalPts / daySessions.length : 0,
      totalPts,
    }
  })
}

export function calcPeakDistribution(sessions: Session[]): { block: string; count: number; pct: number }[] {
  const blocks = [
    { label: '6PM-11PM', test: (h: number) => h >= 18 && h <= 23 },
    { label: '12AM-8AM', test: (h: number) => h >= 0 && h <= 8 },
    { label: '9AM', test: (h: number) => h === 9 },
    { label: '10AM', test: (h: number) => h === 10 },
    { label: '11AM', test: (h: number) => h === 11 },
    { label: '12PM', test: (h: number) => h === 12 },
    { label: '1PM', test: (h: number) => h === 13 },
    { label: '2PM+', test: (h: number) => h >= 14 && h <= 17 },
  ]

  const total = sessions.filter(s => s.hora_pico).length || 1

  return blocks.map(b => {
    const count = sessions.filter(s => {
      if (!s.hora_pico) return false
      const hour = parseInt(s.hora_pico.split(':')[0])
      return b.test(hour)
    }).length
    return { block: b.label, count, pct: Math.round((count / total) * 100) }
  })
}
