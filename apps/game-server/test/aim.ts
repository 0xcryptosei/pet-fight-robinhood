import { RULES_V1, simulateThrow, type MatchState, type PlayerIndex, type Zone } from '@pet-fight/game-engine'

type Aimable = Pick<MatchState, 'wind' | 'fighters'>

const damaging: Zone[] = ['body', 'head', 'splash']

export function aim(state: Aimable, player: PlayerIndex, zone: Zone = 'body'): number {
  const self = state.fighters[player]
  const foe = state.fighters[(1 - player) as PlayerIndex]
  const order = [zone, ...damaging.filter((item) => item !== zone)]
  for (const wanted of order) {
    for (let tenth = 0; tenth <= 900; tenth += 1) {
      const angle = tenth * 100
      const shot = simulateThrow({
        originX: self.x + self.facing * RULES_V1.muzzleOffsetX,
        originY: RULES_V1.muzzleY,
        facing: self.facing,
        power: 1000,
        angle,
        wind: state.wind,
        defenderX: foe.x,
        defenderHead: RULES_V1.species[foe.species].head,
        defenderBody: RULES_V1.species[foe.species].body,
      })
      if (shot.zone === wanted) return angle
    }
  }
  throw new Error(`No damaging angle at wind ${state.wind}`)
}
