import { playMatch, type MatchSetup, type SubmittedAction } from '@pet-fight/game-engine'

export type ForfeitRecord = {
  player: 0 | 1
  winner: 'p1' | 'p2'
  reason: 'timeouts'
}

export type ServerTranscript = {
  setup: MatchSetup
  actions: SubmittedAction[]
  forfeit?: ForfeitRecord
}

export type ServerOutcome = 'p1' | 'p2' | 'draw'

/** Replay the stored actions. A forfeit replaces the engine outcome. */
export function replayOutcome(transcript: ServerTranscript): ServerOutcome {
  const state = playMatch(transcript.setup, transcript.actions)
  if (transcript.forfeit) return transcript.forfeit.winner
  if (state.outcome === 'ongoing') {
    throw new Error('Transcript does not finish the match')
  }
  return state.outcome
}
