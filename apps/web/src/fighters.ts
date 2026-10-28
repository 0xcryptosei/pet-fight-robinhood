export const FIGHTERS = [{ id: 'dog', name: 'Dog', src: '/faces/dog.png' }] as const

export type FighterId = (typeof FIGHTERS)[number]['id']

export function fighterById(id: string | null | undefined) {
  return FIGHTERS.find((fighter) => fighter.id === id) ?? FIGHTERS[0]
}

export function rememberFighter(roomId: string, id: FighterId): void {
  sessionStorage.setItem(`petfight.fighter.${roomId}`, id)
}

export function rememberedFighter(roomId: string): FighterId {
  const stored = sessionStorage.getItem(`petfight.fighter.${roomId}`)
  return fighterById(stored).id
}
