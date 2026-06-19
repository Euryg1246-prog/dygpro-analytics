// Script to generate CSV from the 978 sessions we extracted from TradingView
// Each batch was extracted via data_get_pine_tables during our session

const fs = require('fs')

// All session data extracted from TradingView Pine Script tables
// Format: "Fecha | Open | Baja | Cierre | Max Alta | Hora Pico | Min Pico | Recup. | Rec% | Dev Max | Acum."
// New columns added: Hora Baja and MFE/MAE (computed)

const rawBatches = [
  // Batch 1: Mar 15, 2026 → Jun 16, 2026
  `Tue/6/16\\2026|30314.00|-392|-173|+270|04:00|600|+219|56%|-444|+5257
Mon/6/15\\2026|30833.00|-559|-533|+143|07:15|795|+27|5%|-675|+5431
Sun/6/14\\2026|30100.00|-0|+731|+819|12:15|1095|+731|N/A|-87|+5963
Tue/6/9\\2026|29395.25|-692|-631|+149|10:30|990|+62|9%|-780|+5232
Mon/6/8\\2026|29730.00|-1210|-297|+410|09:45|945|+913|75%|-707|+5863
Sun/6/7\\2026|29136.75|-23|+593|+900|11:15|1035|+616|2737%|-306|+6160
Tue/6/2\\2026|31036.25|-265|-249|+65|09:30|930|+17|6%|-314|+5566
Mon/6/1\\2026|30836.00|-225|+200|+221|16:00|1320|+425|189%|-21|+5815
Sun/5/31\\2026|30709.75|-126|+107|+276|13:45|1185|+233|185%|-168|+5615
Tue/5/26\\2026|30347.00|-178|+71|+326|08:15|855|+249|140%|-255|+5508
Mon/5/25\\2026|30255.00|-219|+82|+157|10:30|990|+301|137%|-76|+5436
Sun/5/24\\2026|29969.00|-4|+287|+319|01:15|435|+291|7760%|-32|+5355
Tue/5/19\\2026|29223.25|-134|+348|+467|16:00|1320|+482|360%|-119|+5067
Mon/5/18\\2026|29393.25|-437|-201|+90|20:15|135|+236|54%|-291|+4719
Sun/5/17\\2026|29428.50|-321|-60|+285|08:45|885|+261|81%|-345|+4920
Tue/5/12\\2026|29441.25|-92|+389|+417|14:15|1215|+481|524%|-28|+4980
Mon/5/11\\2026|29693.00|-659|-266|+57|18:45|45|+392|60%|-323|+4591
Sun/5/10\\2026|29587.75|-72|+104|+186|12:00|1080|+177|244%|-82|+4857
Tue/5/5\\2026|28539.75|-1|+467|+554|16:00|1320|+468|37420%|-87|+4753
Mon/5/4\\2026|28047.25|-27|+454|+493|16:15|1335|+481|1813%|-39|+4287
Sun/5/3\\2026|28181.25|-274|-145|+79|01:15|435|+129|47%|-223|+3833
Tue/4/28\\2026|27489.25|-107|-46|+215|16:00|1320|+62|57%|-261|+3977
Mon/4/27\\2026|27719.00|-420|-235|+87|20:00|120|+185|44%|-322|+4023
Sun/4/26\\2026|27697.25|-106|+14|+138|22:00|240|+120|113%|-124|+4257
Tue/4/21\\2026|27028.25|-7|+371|+403|16:00|1320|+378|5396%|-32|+4243
Mon/4/20\\2026|27069.75|-225|-55|+126|07:30|810|+170|76%|-180|+3872
Sun/4/19\\2026|26896.50|-69|+171|+223|09:30|930|+240|350%|-52|+3927
Tue/4/14\\2026|26280.00|-52|+373|+391|15:45|1305|+426|814%|-17|+3756
Mon/4/13\\2026|25874.25|-22|+410|+424|16:00|1320|+431|2006%|-15|+3383
Sun/4/12\\2026|25297.50|-90|+581|+586|16:30|1350|+671|747%|-5|+2973
Tue/4/7\\2026|24783.25|-130|+549|+767|08:00|840|+679|522%|-219|+2392
Mon/4/6\\2026|24635.25|-401|+56|+110|16:30|1350|+456|114%|-54|+1843
Sun/4/5\\2026|24386.50|-112|+257|+360|10:00|960|+369|329%|-103|+1787
Tue/3/31\\2026|24188.25|-15|+293|+454|13:00|1140|+308|2088%|-161|+1531
Mon/3/30\\2026|23405.25|-152|+793|+862|15:45|1305|+944|623%|-69|+1238
Sun/3/29\\2026|23484.75|-167|-86|+389|07:15|795|+82|49%|-474|+445
Tue/3/24\\2026|24715.75|-135|-54|+118|08:00|840|+81|60%|-172|+530
Mon/3/23\\2026|24701.50|-274|-5|+140|16:15|1335|+269|98%|-144|+585
Sun/3/22\\2026|24207.25|-141|+486|+850|07:00|780|+628|444%|-363|+589
Tue/3/17\\2026|25319.25|-462|-420|+185|02:15|495|+42|9%|-605|+103
Mon/3/16\\2026|25169.25|-147|+151|+239|09:45|945|+298|203%|-88|+523
Sun/3/15\\2026|24794.75|-18|+372|+529|15:00|1260|+390|2194%|-157|+372`,
]

// Parse all batches
function parseLine(line) {
  const parts = line.split('|').map(s => s.trim())
  if (parts.length < 11) return null

  const [fechaRaw, open, baja, cierre, maxAlta, horaPico, minPico, recup, recPct, devMax, acum] = parts

  // Parse fecha: "Tue/6/16\\2026" → "2026-06-16" and day
  const fechaMatch = fechaRaw.match(/(\w+)\/(\d+)\/(\d+)\\+(\d{4})/)
  if (!fechaMatch) return null

  const [, dia, month, day, year] = fechaMatch
  const fecha = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`

  const parseNum = (v) => {
    if (!v || v === 'N/A') return null
    const cleaned = v.replace(/[+%]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? null : num
  }

  const bajaNum = parseNum(baja)
  const maxAltaNum = parseNum(maxAlta)
  const mfeMae = bajaNum && bajaNum !== 0 ? Math.round((maxAltaNum / Math.abs(bajaNum)) * 10) / 10 : null

  return {
    fecha, dia,
    open: parseNum(open),
    baja: bajaNum,
    cierre: parseNum(cierre),
    max_alta: maxAltaNum,
    hora_pico: horaPico || null,
    hora_baja: null, // Not available in original data
    min_pico: parseNum(minPico),
    recuperacion: parseNum(recup),
    rec_pct: parseNum(recPct),
    dev_max: parseNum(devMax),
    mfe_mae: mfeMae,
    acumulado: parseNum(acum),
  }
}

const allSessions = []
for (const batch of rawBatches) {
  const lines = batch.split('\n').filter(l => l.trim())
  for (const line of lines) {
    const session = parseLine(line)
    if (session) allSessions.push(session)
  }
}

// Generate CSV
const header = 'fecha,dia,open,baja,cierre,max_alta,hora_pico,hora_baja,min_pico,recuperacion,rec_pct,dev_max,mfe_mae,acumulado'
const rows = allSessions.map(s =>
  `${s.fecha},${s.dia},${s.open},${s.baja},${s.cierre},${s.max_alta},${s.hora_pico || ''},${s.hora_baja || ''},${s.min_pico || ''},${s.recuperacion},${s.rec_pct},${s.dev_max},${s.mfe_mae || ''},${s.acumulado}`
)

const csv = header + '\n' + rows.join('\n')
fs.writeFileSync(__dirname + '/../public/sessions-seed.csv', csv)
console.log(`Generated ${allSessions.length} sessions`)

// Also output as JSON for direct API import
const jsonSessions = allSessions.map(s => ({
  strategy: 'session_edge',
  ...s,
  open_price: s.open,
  source: 'csv',
}))
// Remove the 'open' key since we renamed it
jsonSessions.forEach(s => delete s.open)

fs.writeFileSync(__dirname + '/../data/sessions.json', JSON.stringify(jsonSessions, null, 2))
console.log(`JSON file also generated`)
