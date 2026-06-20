export interface Session {
  id?: string
  strategy: string
  fecha: string
  dia: string
  open_price: number | null
  baja: number | null
  cierre: number | null
  max_alta: number | null
  hora_pico: string | null
  hora_baja: string | null
  min_pico: number | null
  recuperacion: number | null
  rec_pct: number | null
  dev_max: number | null
  mfe_mae: number | null
  acumulado: number | null
  source: string
  notas?: string | null
  created_at?: string
}

export interface DayStats {
  dia: string
  trades: number
  wins: number
  winRate: number
  avgPts: number
  totalPts: number
}

export interface KPIs {
  totalTrades: number
  winRate: number
  profitFactor: number
  avgCierre: number
  totalPts: number
  maxDD: number
  avgWin: number
  avgLoss: number
}

export interface Streaks {
  currentStreak: number
  currentStreakType: 'win' | 'loss' | 'none'
  maxWinStreak: number
  maxLossStreak: number
}

export interface MaeMfeStats {
  avgRatio: number
  avgEfficiency: number
  countWithData: number
  avgMfe: number
  avgMae: number
}

export interface HourStat {
  hour: string
  trades: number
  avgPnl: number
  winRate: number
  totalPnl: number
}

export interface DayBucket {
  label: string   // ej: "<-400", "-400a-200", etc.
  count: number
  pct: number
}

export interface DayProfile {
  dia: string
  trades: number
  winRate: number
  totalPts: number
  avgPts: number
  median: number
  best: number
  worst: number
  buckets: DayBucket[]
}

export interface YearStat {
  year: string
  trades: number
  wins: number
  winRate: number
  totalPnl: number
  avgPnl: number
}

export interface PullbackBucket {
  label: string
  minPts: number
  maxPts: number | null
  trades: number
  wins: number
  winRate: number
  avgPnl: number
  totalPnl: number
}

export interface MonthStat {
  month: string       // 'YYYY-MM'
  label: string       // 'Jun 25'
  trades: number
  wins: number
  winRate: number
  totalPnl: number
  avgPnl: number
  rolling3: number | null  // promedio móvil 3 meses
}

export interface SkipDaySim {
  skipDay: string
  kpisWith: KPIs    // con ese día
  kpisWithout: KPIs // sin ese día
  tradeSavings: number
  pnlDelta: number
}

export interface PullbackSim {
  totalWithPullback: number      // trades que tuvieron retroceso
  recoveredCount: number         // retrocesos que cerraron positivos
  recoveryRate: number           // % recuperados
  avgRealPnl: number             // P&L promedio real
  avgSimPnl: number              // P&L promedio si entrabas en el MAE
  avgImprovement: number         // mejora promedio en $
  avgPullbackDepth: number       // profundidad promedio del retroceso ($)
  simWinRate: number             // win rate si entraras en el MAE
  simTotalPnl: number            // P&L total simulado
  realTotalPnl: number           // P&L total real (de los trades con pullback)
}
