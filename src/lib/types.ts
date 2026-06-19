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
