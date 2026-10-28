import { divFloor, mulDiv } from './integer'
import { cosMilli, sinMilli } from './trig'
import type { Zone } from './damage'
import { RULES_V1, type Box } from './rules/v1'

const T_SCALE = 1_000_000

export type DirectHit = {
  zone: 'head' | 'body'
  t: number
  x: number
  y: number
}

export function resolveDirectHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  head: Box,
  body: Box,
): DirectHit | null {
  const headT = enterT(x0, y0, x1, y1, head)
  const bodyT = enterT(x0, y0, x1, y1, body)
  if (headT === null && bodyT === null) return null
  const headFirst = headT !== null && (bodyT === null || headT < bodyT)
  const zone = headFirst ? 'head' : 'body'
  const t = headFirst ? headT! : bodyT!
  const point = pointAt(x0, y0, x1, y1, t)
  return { zone, t, x: point.x, y: point.y }
}

export function groundZone(
  impactX: number,
  impactY: number,
  bodyWorld: Box,
  splashRadius: number,
): Zone {
  if (distanceSquaredToBox(impactX, impactY, bodyWorld) <= splashRadius * splashRadius) {
    return 'splash'
  }
  return 'miss'
}

export type ShotResolution = {
  zone: Zone
  contactX: number
  contactY: number
  steps: number
}

export type ThrowInput = {
  originX: number
  originY: number
  facing: 1 | -1
  power: number
  angle: number
  wind: number
  defenderX: number
  defenderHead: Box
  defenderBody: Box
}

export function simulateThrow(input: ThrowInput): ShotResolution {
  const speed = mulDiv(RULES_V1.fullPowerSpeed, input.power, RULES_V1.scale)
  let vx = mulDiv(input.facing * speed, cosMilli(input.angle), RULES_V1.scale)
  let vy = mulDiv(speed, sinMilli(input.angle), RULES_V1.scale)
  let x = input.originX
  let y = input.originY
  const head = worldBox(input.defenderX, input.defenderHead)
  const body = worldBox(input.defenderX, input.defenderBody)

  for (let step = 1; step <= RULES_V1.maxSteps; step += 1) {
    const nx = x + mulDiv(vx, RULES_V1.timestepMs, 1000)
    const ny = y + mulDiv(vy, RULES_V1.timestepMs, 1000)
    const resolved = resolveStep(x, y, nx, ny, head, body)
    if (resolved) {
      return { ...resolved, steps: step }
    }
    x = nx
    y = ny
    vx += mulDiv(input.wind, RULES_V1.timestepMs, 1000)
    vy -= mulDiv(RULES_V1.gravity, RULES_V1.timestepMs, 1000)
  }

  return { zone: 'miss', contactX: x, contactY: y, steps: RULES_V1.maxSteps }
}

function resolveStep(
  x: number,
  y: number,
  nx: number,
  ny: number,
  head: Box,
  body: Box,
): { zone: Zone; contactX: number; contactY: number } | null {
  const direct = resolveDirectHit(x, y, nx, ny, head, body)
  const groundT = groundCrossingT(y, ny)
  const exitT = arenaExitT(x, y, nx, ny)

  if (
    direct &&
    (groundT === null || direct.t <= groundT) &&
    (exitT === null || direct.t <= exitT)
  ) {
    return { zone: direct.zone, contactX: direct.x, contactY: direct.y }
  }

  if (groundT !== null && (exitT === null || groundT <= exitT)) {
    const impact = pointAt(x, y, nx, ny, groundT)
    return {
      zone: groundZone(impact.x, 0, body, RULES_V1.splashRadius),
      contactX: impact.x,
      contactY: 0,
    }
  }

  if (exitT !== null) {
    const impact = pointAt(x, y, nx, ny, exitT)
    return { zone: 'miss', contactX: impact.x, contactY: impact.y }
  }

  return null
}

function groundCrossingT(y: number, ny: number): number | null {
  if (y <= 0) return 0
  if (ny > 0) return null
  const dy = ny - y
  if (dy === 0) return null
  const t = divFloor(-y * T_SCALE, dy)
  if (t < 0 || t > T_SCALE) return null
  return t
}

function arenaExitT(x: number, y: number, nx: number, ny: number): number | null {
  const candidates: number[] = []
  const dx = nx - x
  const dy = ny - y
  if (dx < 0 && nx < 0) {
    candidates.push(divFloor(-x * T_SCALE, dx))
  } else if (dx > 0 && nx > RULES_V1.arenaWidth) {
    candidates.push(divFloor((RULES_V1.arenaWidth - x) * T_SCALE, dx))
  }
  if (dy > 0 && ny > RULES_V1.arenaHeight) {
    candidates.push(divFloor((RULES_V1.arenaHeight - y) * T_SCALE, dy))
  }
  const inRange = candidates.filter((t) => t >= 0 && t <= T_SCALE)
  if (inRange.length === 0) return null
  return Math.min(...inRange)
}

function worldBox(originX: number, box: Box): Box {
  return {
    x0: originX + box.x0,
    x1: originX + box.x1,
    y0: box.y0,
    y1: box.y1,
  }
}

function enterT(x0: number, y0: number, x1: number, y1: number, box: Box): number | null {
  const dx = x1 - x0
  const dy = y1 - y0
  const xSlab = clipSlab(x0, dx, box.x0, box.x1, 0, T_SCALE)
  if (xSlab === null) return null
  const ySlab = clipSlab(y0, dy, box.y0, box.y1, xSlab[0], xSlab[1])
  if (ySlab === null) return null
  return ySlab[0]
}

function clipSlab(
  origin: number,
  delta: number,
  min: number,
  max: number,
  tMin: number,
  tMax: number,
): [number, number] | null {
  if (delta === 0) {
    if (origin < min || origin > max) return null
    return [tMin, tMax]
  }
  let tStart = divFloor((min - origin) * T_SCALE, delta)
  let tEnd = divFloor((max - origin) * T_SCALE, delta)
  if (tStart > tEnd) {
    const swap = tStart
    tStart = tEnd
    tEnd = swap
  }
  const nextMin = tStart > tMin ? tStart : tMin
  const nextMax = tEnd < tMax ? tEnd : tMax
  if (nextMin > nextMax) return null
  return [nextMin, nextMax]
}

function pointAt(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: number,
): { x: number; y: number } {
  return {
    x: x0 + divFloor((x1 - x0) * t, T_SCALE),
    y: y0 + divFloor((y1 - y0) * t, T_SCALE),
  }
}

function distanceSquaredToBox(x: number, y: number, box: Box): number {
  const nearestX = x < box.x0 ? box.x0 : x > box.x1 ? box.x1 : x
  const nearestY = y < box.y0 ? box.y0 : y > box.y1 ? box.y1 : y
  const dx = x - nearestX
  const dy = y - nearestY
  return dx * dx + dy * dy
}
