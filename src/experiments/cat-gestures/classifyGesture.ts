export type CatGesture = 'pray' | 'pointUp' | 'shy' | 'fist' | 'shush' | 'shaka'
export type Lm = { x: number; y: number; z?: number }

const dist = (a: Lm, b: Lm) => Math.hypot(a.x - b.x, a.y - b.y)

function fingerExtended(hand: Lm[], tip: number, pip: number, mcp: number) {
  // Tip farther from wrist than PIP, and roughly "out"
  const wrist = hand[0]
  return (
    dist(hand[tip], wrist) > dist(hand[pip], wrist) * 1.02 &&
    dist(hand[tip], hand[mcp]) > dist(hand[pip], hand[mcp]) * 0.88
  )
}

function fingerCurled(hand: Lm[], tip: number, mcp: number) {
  return dist(hand[tip], hand[mcp]) < dist(hand[0], hand[mcp]) * 0.7
}

function isFist(hand: Lm[]) {
  return [8, 12, 16, 20].every((tip, i) => fingerCurled(hand, tip, [5, 9, 13, 17][i]))
}

function isIndexUp(hand: Lm[]) {
  // Index out; other fingers not extended (partial curl OK — more forgiving than strict curl).
  return (
    fingerExtended(hand, 8, 6, 5) &&
    !fingerExtended(hand, 12, 10, 9) &&
    !fingerExtended(hand, 16, 14, 13) &&
    !fingerExtended(hand, 20, 18, 17)
  )
}

function isShaka(hand: Lm[]) {
  const thumbOut = dist(hand[4], hand[17]) > dist(hand[5], hand[17]) * 0.85
  return (
    thumbOut &&
    fingerExtended(hand, 20, 18, 17) &&
    !fingerExtended(hand, 8, 6, 5) &&
    !fingerExtended(hand, 12, 10, 9) &&
    !fingerExtended(hand, 16, 14, 13)
  )
}

function isShy(a: Lm[], b: Lm[]) {
  return isIndexUp(a) && isIndexUp(b) && dist(a[8], b[8]) < 0.16
}

function isPray(a: Lm[], b: Lm[]) {
  if (!fingerExtended(a, 12, 10, 9) || !fingerExtended(b, 12, 10, 9)) return false
  return dist(a[0], b[0]) < 0.22 && dist(a[9], b[9]) < 0.18 && dist(a[8], b[8]) < 0.2
}

const MOUTH_RADIUS = 0.14

export function classifyGesture(hands: Lm[][], mouth: Lm | null): CatGesture | null {
  if (hands.length === 0) return null
  if (hands.length >= 2) {
    const [a, b] = hands
    if (isShy(a, b)) return 'shy'
    if (isPray(a, b)) return 'pray'
  }
  if (mouth) {
    for (const h of hands) {
      if (isIndexUp(h) && dist(h[8], mouth) < MOUTH_RADIUS) return 'shush'
    }
  }
  for (const h of hands) {
    if (isIndexUp(h)) return 'pointUp'
  }
  for (const h of hands) {
    if (isShaka(h)) return 'shaka'
  }
  for (const h of hands) {
    if (isFist(h)) return 'fist'
  }
  return null
}
