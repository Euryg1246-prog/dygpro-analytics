import { Session, KPIs, DayStats, Streaks, MaeMfeStats, HourStat, PullbackSim, DayProfile, SkipDaySim } from './types'

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

// ─── Rachas ───────────────────────────────────────────────────────────────────
export function calcStreaks(sessions: Session[]): Streaks {
  if (sessions.length === 0) {
    return { currentStreak: 0, currentStreakType: 'none', maxWinStreak: 0, maxLossStreak: 0 }
  }

  let maxWinStreak = 0
  let maxLossStreak = 0
  let tempStreak = 0
  let tempType: 'win' | 'loss' = 'win'

  for (const s of sessions) {
    const type: 'win' | 'loss' = (s.cierre ?? 0) >= 0 ? 'win' : 'loss'
    if (type === tempType) {
      tempStreak++
    } else {
      tempStreak = 1
      tempType = type
    }
    if (type === 'win') maxWinStreak = Math.max(maxWinStreak, tempStreak)
    else maxLossStreak = Math.max(maxLossStreak, tempStreak)
  }

  return {
    currentStreak: tempStreak,
    currentStreakType: tempType,
    maxWinStreak,
    maxLossStreak,
  }
}

// ─── MAE / MFE ────────────────────────────────────────────────────────────────
export function calcMaeMfe(sessions: Session[]): MaeMfeStats {
  const withData = sessions.filter(s => s.max_alta !== null && s.baja !== null && s.cierre !== null)

  if (withData.length === 0) {
    return { avgRatio: 0, avgEfficiency: 0, countWithData: 0, avgMfe: 0, avgMae: 0 }
  }

  const avgMfe = withData.reduce((sum, s) => sum + (s.max_alta ?? 0), 0) / withData.length
  const avgMae = withData.reduce((sum, s) => sum + Math.abs(s.baja ?? 0), 0) / withData.length

  const ratios = withData.filter(s => s.mfe_mae !== null).map(s => s.mfe_mae!)
  const avgRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0

  // Eficiencia: cuánto del MFE capturaste al cerrar
  const efficiencies = withData
    .filter(s => (s.max_alta ?? 0) > 0)
    .map(s => Math.min(((s.cierre ?? 0) / (s.max_alta ?? 1)) * 100, 100))
  const avgEfficiency = efficiencies.length > 0
    ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
    : 0

  return { avgRatio, avgEfficiency, countWithData: withData.length, avgMfe, avgMae }
}

// ─── P&L por hora de entrada ──────────────────────────────────────────────────
export function calcHourStats(sessions: Session[]): HourStat[] {
  const hourMap: Record<string, { pnl: number[]; wins: number }> = {}

  for (const s of sessions) {
    if (!s.hora_baja || s.cierre === null) continue
    const hour = s.hora_baja.substring(0, 2) + ':00'
    if (!hourMap[hour]) hourMap[hour] = { pnl: [], wins: 0 }
    hourMap[hour].pnl.push(s.cierre)
    if (s.cierre >= 0) hourMap[hour].wins++
  }

  return Object.entries(hourMap)
    .map(([hour, data]) => ({
      hour,
      trades: data.pnl.length,
      avgPnl: Math.round(data.pnl.reduce((a, b) => a + b, 0) / data.pnl.length),
      winRate: Math.round((data.wins / data.pnl.length) * 100),
      totalPnl: Math.round(data.pnl.reduce((a, b) => a + b, 0)),
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour))
}

// ─── Meta semanal ─────────────────────────────────────────────────────────────
export function calcWeeklyPnl(sessions: Session[]): number {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  monday.setHours(0, 0, 0, 0)
  const weekStart = monday.toISOString().slice(0, 10)

  return sessions
    .filter(s => s.fecha >= weekStart)
    .reduce((sum, s) => sum + (s.cierre ?? 0), 0)
}

// ─── Simulación entrada en pullback (MAE) ────────────────────────────────────
export function calcPullbackSim(sessions: Session[]): PullbackSim {
  // Solo trades con retroceso real (baja < 0) y cierre conocido
  const withPullback = sessions.filter(s => s.baja !== null && (s.baja ?? 0) < 0 && s.cierre !== null)

  if (withPullback.length === 0) {
    return {
      totalWithPullback: 0, recoveredCount: 0, recoveryRate: 0,
      avgRealPnl: 0, avgSimPnl: 0, avgImprovement: 0,
      avgPullbackDepth: 0, simWinRate: 0, simTotalPnl: 0, realTotalPnl: 0,
    }
  }

  // Si hubieras entrado en el MAE: simPnl = cierre - baja (baja es negativo, lo resta → suma)
  const simResults = withPullback.map(s => ({
    real: s.cierre!,
    sim: s.cierre! - s.baja!,   // e.g. +300 - (-200) = +500
    depth: Math.abs(s.baja!),
  }))

  const recoveredCount = withPullback.filter(s => (s.cierre ?? 0) > 0).length
  const simWins = simResults.filter(r => r.sim > 0).length

  const realTotalPnl = Math.round(simResults.reduce((a, r) => a + r.real, 0))
  const simTotalPnl  = Math.round(simResults.reduce((a, r) => a + r.sim, 0))

  return {
    totalWithPullback: withPullback.length,
    recoveredCount,
    recoveryRate: Math.round((recoveredCount / withPullback.length) * 100),
    avgRealPnl: Math.round(simResults.reduce((a, r) => a + r.real, 0) / simResults.length),
    avgSimPnl:  Math.round(simResults.reduce((a, r) => a + r.sim, 0)  / simResults.length),
    avgImprovement: Math.round(simResults.reduce((a, r) => a + r.depth, 0) / simResults.length),
    avgPullbackDepth: Math.round(simResults.reduce((a, r) => a + r.depth, 0) / simResults.length),
    simWinRate: Math.round((simWins / simResults.length) * 100),
    simTotalPnl,
    realTotalPnl,
  }
}

export function calcTodayPnl(sessions: Session[]): number {
  const today = new Date().toISOString().slice(0, 10)
  return sessions
    .filter(s => s.fecha === today)
    .reduce((sum, s) => sum + (s.cierre ?? 0), 0)
}

// ─── Perfil de distribución por día ──────────────────────────────────────────
export function calcDayProfiles(sessions: Session[]): DayProfile[] {
  const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const BUCKETS = [
    { label: '< -400', test: (v: number) => v < -400 },
    { label: '-400 a -200', test: (v: number) => v >= -400 && v < -200 },
    { label: '-200 a 0', test: (v: number) => v >= -200 && v < 0 },
    { label: '0 a 200', test: (v: number) => v >= 0 && v < 200 },
    { label: '200 a 400', test: (v: number) => v >= 200 && v < 400 },
    { label: '> 400', test: (v: number) => v >= 400 },
  ]

  const normalize = (dia: string) => {
    const map: Record<string, string> = {
      'Sun': 'Dom', 'Mon': 'Lun', 'Tue': 'Mar', 'Wed': 'Mié', 'Thu': 'Jue', 'Fri': 'Vie', 'Sat': 'Sáb',
      'Domingo': 'Dom', 'Lunes': 'Lun', 'Martes': 'Mar', 'Miércoles': 'Mié', 'Jueves': 'Jue', 'Viernes': 'Vie', 'Sábado': 'Sáb',
    }
    return map[dia] ?? dia
  }

  return DAYS.map(dia => {
    const pnls = sessions
      .filter(s => normalize(s.dia) === dia && s.cierre !== null)
      .map(s => s.cierre!)

    if (pnls.length === 0) return null

    const sorted = [...pnls].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]

    const wins = pnls.filter(v => v >= 0)
    const total = pnls.reduce((a, b) => a + b, 0)

    const buckets = BUCKETS.map(b => {
      const count = pnls.filter(b.test).length
      return { label: b.label, count, pct: Math.round((count / pnls.length) * 100) }
    })

    return {
      dia,
      trades: pnls.length,
      winRate: Math.round((wins.length / pnls.length) * 100),
      totalPts: Math.round(total),
      avgPts: Math.round(total / pnls.length),
      median: Math.round(median),
      best: Math.round(sorted[sorted.length - 1]),
      worst: Math.round(sorted[0]),
      buckets,
    }
  }).filter(Boolean) as DayProfile[]
}

// ─── Simulación: ¿Qué pasa si saltas un día? ─────────────────────────────────
export function calcSkipDaySim(sessions: Session[], skipDay: string): SkipDaySim {
  const normalize = (dia: string) => {
    const map: Record<string, string> = {
      'Sun': 'Dom', 'Mon': 'Lun', 'Tue': 'Mar', 'Wed': 'Mié', 'Thu': 'Jue', 'Fri': 'Vie', 'Sat': 'Sáb',
      'Domingo': 'Dom', 'Lunes': 'Lun', 'Martes': 'Mar', 'Miércoles': 'Mié', 'Jueves': 'Jue', 'Viernes': 'Vie', 'Sábado': 'Sáb',
    }
    return map[dia] ?? dia
  }

  const without = sessions.filter(s => normalize(s.dia) !== skipDay)
  const kpisWith    = calcKPIs(sessions)
  const kpisWithout = calcKPIs(without)

  return {
    skipDay,
    kpisWith,
    kpisWithout,
    tradeSavings: sessions.length - without.length,
    pnlDelta: kpisWithout.totalPts - kpisWith.totalPts,
  }
}
