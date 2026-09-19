export type CellKind = 'body' | 'ant' | 'leg' | 'fore' | 'hind' | 'tail'

export interface Cell {
  row: number
  col: number
  d: number
  st: boolean
  ch: string
  kind: CellKind
  vein: boolean
  iri: boolean
}

export const CELL_W = 5
export const CELL_H = 8
export const MAX_CELLS = 1700
export const COLS = 24
export const ROWS = 20
export const THRESHOLD = 0.05

export function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function gauss(dx: number, dy: number, sx: number, sy: number) {
  return Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy)))
}

/** Tilted elliptical lobe: 1 at centre, 0 at/ beyond the rim. */
function lobe(
  nx: number,
  ny: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
) {
  const u = nx - cx
  const v = ny - cy
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  const up = u * cs - v * sn
  const vp = u * sn + v * cs
  const dist = Math.hypot(up / rx, vp / ry)
  return dist >= 1 ? 0 : 1 - dist
}

interface WingSample {
  d: number
  kind: CellKind
  vein: boolean
  iri: boolean
}

/**
 * Swallowtail-like density field in normalized wing space.
 * nx ∈ [0,1] outward from the body, ny ∈ [-1,1] (negative = up / forewing).
 */
export function wingField(nx: number, ny: number): WingSample {
  const empty: WingSample = { d: 0, kind: 'fore', vein: false, iri: false }

  // ── silhouette: pointed forewing + round hindwing + swallowtail ──
  const fore = Math.max(
    lobe(nx, ny, 0.40, -0.38, 0.38, 0.58, 2.46), // main blade, tip up-out
    lobe(nx, ny, 0.76, -0.70, 0.20, 0.36, 2.28), // sharp apex
    lobe(nx, ny, 0.22, -0.20, 0.24, 0.34, 2.55), // root fill
  )
  const hind = Math.max(
    lobe(nx, ny, 0.36, 0.34, 0.40, 0.46, 0.70),
    lobe(nx, ny, 0.58, 0.26, 0.24, 0.30, 0.48),
  )
  const tail = Math.max(
    lobe(nx, ny, 0.30, 0.78, 0.085, 0.30, 0.20),
    lobe(nx, ny, 0.28, 0.98, 0.045, 0.13, 0.12),
  )

  // classic butterfly notch where forewing tornus meets hindwing
  const notch = gauss(nx - 0.62, ny - 0.02, 0.10, 0.07)
  const foreN = fore * (1 - 0.45 * notch)
  const hindN = hind * (1 - 0.28 * notch)

  let kind: CellKind = 'fore'
  let wing = foreN
  if (hindN > wing) {
    wing = hindN
    kind = 'hind'
  }
  if (tail > wing) {
    wing = tail
    kind = 'tail'
  }
  if (wing < THRESHOLD) return empty

  // scalloped trailing margin
  const ang = Math.atan2(ny, nx - 0.04)
  const rad = Math.hypot(nx - 0.04, ny)
  if (wing < 0.22 && ang > -0.55 && ang < 1.15) {
    wing += 0.05 * Math.sin(ang * 14)
    if (wing < THRESHOLD) return empty
  }

  // ── base scale density ──
  // Kept low so veins, eyespots and lunules still have headroom on the ramp:
  // everything below stacks additively and clamps at 1.
  let d = 0.26 + 0.34 * wing

  // dark rim
  if (wing < 0.16) d += 0.30

  // ── veins: radial from the root, plus two cross-arcs ──
  let vein = false
  const veinAngs =
    kind === 'fore'
      ? [-1.22, -0.98, -0.74, -0.50, -0.28, -0.08]
      : kind === 'hind'
        ? [0.12, 0.32, 0.52, 0.74, 0.96]
        : [1.18, 1.36]
  for (const va of veinAngs) {
    // constant screen-space thickness: the ray gets narrower in angle as it
    // travels out, so a vein stays ~one cell wide instead of fanning open.
    const width = (kind === 'tail' ? 0.030 : 0.016) / Math.max(0.28, rad)
    if (rad > 0.10 && Math.abs(ang - va) < width) {
      d += 0.42
      vein = true
    }
  }
  for (const cr of [0.30, 0.52, 0.72]) {
    if (Math.abs(rad - cr) < 0.012 && wing > 0.12) {
      d += 0.26
      vein = true
    }
  }

  // ── patterns ──
  if (kind === 'fore') {
    // discal cell near the root
    d += 0.18 * gauss(nx - 0.26, ny + 0.40, 0.12, 0.14)
    // dark median bar
    d += 0.40 * gauss(nx - 0.50, ny + 0.36, 0.055, 0.24)
    // apical dark patch (swallowtail / monarch tip)
    d += 0.48 * gauss(nx - 0.82, ny + 0.70, 0.16, 0.15)
    // subapical light spots
    d -= 0.32 * gauss(nx - 0.70, ny + 0.62, 0.05, 0.05)
    d -= 0.28 * gauss(nx - 0.78, ny + 0.50, 0.045, 0.045)
  }

  if (kind === 'hind' || kind === 'tail') {
    // primary eyespot — ring + pupil
    const er = Math.hypot(nx - 0.50, ny - 0.46)
    d += 0.90 * Math.exp(-((er - 0.085) * (er - 0.085)) / 0.0015)
    d += 0.55 * Math.exp(-(er * er) / 0.0010)
    // second smaller eyespot nearer the tail
    const er2 = Math.hypot(nx - 0.38, ny - 0.68)
    d += 0.55 * Math.exp(-((er2 - 0.055) * (er2 - 0.055)) / 0.0008)
  }

  // marginal lunules — light spots along the outer edge
  if (wing < 0.24 && wing > 0.07) {
    const spots = 0.5 + 0.5 * Math.sin(ang * 11.0 + 0.5)
    if (spots > 0.62) d -= 0.38
    else d += 0.16
  }

  // monarch-like lighter corridors between veins
  if (!vein) {
    const band = Math.abs(((rad * 2.8) % 1) - 0.5)
    if (band < 0.10) d -= 0.14
  }

  const iri = kind === 'hind' && nx > 0.28 && ny > 0.12 && ny < 0.52 && !vein

  return { d: clamp01(d), kind, vein, iri }
}

export function buildCells(): Cell[] {
  const cells: Cell[] = []

  const body: Array<[number, number, string, number]> = [
    [-11, 0, '@', 1],
    [-10, 0, '8', 0.96],
    [-10, -1, '(', 0.72],
    [-10, 1, ')', 0.72],
    [-9, -1, '#', 0.9],
    [-9, 0, '8', 1],
    [-9, 1, '#', 0.9],
    [-8, -1, '#', 0.92],
    [-8, 0, '@', 1],
    [-8, 1, '#', 0.92],
    [-7, -1, '#', 0.88],
    [-7, 0, '8', 1],
    [-7, 1, '#', 0.88],
    [-6, 0, '#', 0.86],
    [-5, 0, '8', 0.82],
    [-4, 0, '#', 0.78],
    [-3, 0, '8', 0.72],
    [-2, 0, '#', 0.66],
    [-1, 0, 'o', 0.55],
    [0, 0, 'o', 0.48],
    [1, 0, '.', 0.38],
  ]
  for (const [row, col, ch, d] of body) {
    cells.push({ row, col, d, st: true, ch, kind: 'body', vein: false, iri: false })
  }

  const ant: Array<[number, number, string]> = [
    [-12, -1, '/'],
    [-13, -2, '~'],
    [-14, -3, '-'],
    [-14, -4, '*'],
  ]
  for (const [r, c, ch] of ant) {
    cells.push({ row: r, col: c, d: 0.82, st: true, ch, kind: 'ant', vein: false, iri: false })
    cells.push({
      row: r,
      col: -c,
      d: 0.82,
      st: true,
      ch: ch === '/' ? '\\' : ch,
      kind: 'ant',
      vein: false,
      iri: false,
    })
  }

  const legs: Array<[number, number, string]> = [
    [0, -1, '/'],
    [1, -2, '/'],
    [2, -2, '.'],
    [0, 1, '\\'],
    [1, 2, '\\'],
    [2, 2, '.'],
    [1, -1, '|'],
    [2, -1, '/'],
    [1, 1, '|'],
    [2, 1, '\\'],
  ]
  for (const [r, c, ch] of legs) {
    cells.push({ row: r, col: c, d: 0.55, st: true, ch, kind: 'leg', vein: false, iri: false })
  }

  for (let row = -ROWS; row <= ROWS; row++) {
    for (let col = 1; col <= COLS; col++) {
      const nx = col / COLS
      const ny = row / ROWS
      const s = wingField(nx, ny)
      if (s.d <= 0) continue
      cells.push({ row, col, d: s.d, st: false, ch: '·', kind: s.kind, vein: s.vein, iri: s.iri })
      cells.push({
        row,
        col: -col,
        d: s.d,
        st: false,
        ch: '·',
        kind: s.kind,
        vein: s.vein,
        iri: s.iri,
      })
    }
  }

  if (cells.length > MAX_CELLS) {
    cells.sort((a, b) => b.d - a.d)
    cells.length = MAX_CELLS
  }
  return cells
}

const RAMP_DUMP = ' .:-=+*#@'

/** Plain-text top-view of the cell field — used by tests / silhouette dumps. */
export function paintCells(cells: Cell[]): string {
  let minR = Infinity
  let maxR = -Infinity
  let minC = Infinity
  let maxC = -Infinity
  for (const c of cells) {
    if (c.kind === 'leg') continue
    if (c.row < minR) minR = c.row
    if (c.row > maxR) maxR = c.row
    if (c.col < minC) minC = c.col
    if (c.col > maxC) maxC = c.col
  }
  const rows = maxR - minR + 1
  const cols = maxC - minC + 1
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(' '))
  for (const c of cells) {
    if (c.kind === 'leg') continue
    const ch = c.st ? c.ch : RAMP_DUMP[Math.round(clamp01(c.d) * (RAMP_DUMP.length - 1))]
    grid[c.row - minR][c.col - minC] = ch
  }
  return grid.map((r) => r.join('')).join('\n')
}
