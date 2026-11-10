// Pure data types for the engine. No DOM, no Vue — keep it that way so the
// engine stays testable and can later move to a worker / server.

export type Row = 'front' | 'back'
export type Side = 'ally' | 'enemy'
export type Potential = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
export type GearSlot = 'weapon' | 'armor' | 'accessory'

export interface Stats {
  hp: number
  atk: number
  def: number
  /** seconds between basic attacks (lower = faster) */
  interval: number
  /** px range of basic attack */
  range: number
  /** px per second */
  speed: number
  crit: number
}

export type SkillKind = 'cleave' | 'fireball' | 'heal' | 'volley' | 'guard' | 'smite'

/**
 * A duelist's kit has three slots:
 *  1. passive — rolled at random per duelist (see data/passives.ts)
 *  2. basic   — class basic attack, fired on the attack timer; builds energy
 *  3. active  — class skill, fired the moment energy reaches 100
 */
export interface BasicDef {
  name: string
  /** multiplier on atk */
  power: number
}

export interface PassiveDef {
  id: string
  name: string
  desc: string
  /** fractional stat bonuses applied in computeStats (haste = attack speed) */
  stats?: Partial<Record<'hp' | 'atk' | 'def' | 'crit' | 'haste', number>>
  /** extra fraction of energy gained */
  energyGain?: number
  /** fraction of the energy bar filled at battle start */
  startEnergy?: number
  /** fraction of the energy bar refilled on a killing blow */
  killEnergy?: number
  /** chance for a basic attack to strike again */
  extraBasic?: number
  /** fraction of max HP regenerated per second */
  regen?: number
  /** fraction of incoming damage ignored */
  damageReduction?: number
  /** extra fraction of active power */
  activePower?: number
  /** once per battle, a lethal hit leaves the duelist at 1 HP */
  undying?: boolean
  /** fraction of basic-attack damage healed */
  lifesteal?: number
  /** fraction of damage taken reflected to the attacker */
  thorns?: number
  /** once per battle below 30% HP: heal this fraction of max HP */
  secondWind?: number
}

export interface SkillDef {
  id: string
  name: string
  kind: SkillKind
  /** multiplier on atk */
  power: number
  /** px radius for AoE, count for volley */
  area?: number
  hits?: number
}

export interface ClassDef {
  id: string
  name: string
  rank: 1 | 2 | 3 | 4 | 5
  cost: number
  row: Row
  ranged: boolean
  base: Stats
  /** additive growth per level for hp/atk/def */
  growth: { hp: number; atk: number; def: number }
  basic: BasicDef
  /** fired automatically when energy is full */
  active: SkillDef
  /** energy needed to cast the active: supports fill faster than tanks */
  energyMax: number
  /** class ids this can rank up into */
  upgradesTo: string[]
  /** sprite key + palette key used by the renderer */
  sprite: string
  palette: string
}

export interface Gear {
  id: string
  name: string
  slot: GearSlot
  rarity: Rarity
  hp: number
  atk: number
  def: number
}

export interface Duelist {
  id: string
  name: string
  classId: string
  level: number
  exp: number
  potential: Potential
  /** passive id (kit slot 1), rolled once */
  passive: string
  gear: Partial<Record<GearSlot, string>>
}

export interface Candidate {
  id: string
  name: string
  classId: string
  potential: Potential
  passive: string
  price: number
}

export interface EnemyTemplate {
  /** class id (for duelist-like enemies) or monster id */
  classId: string
  level: number
  potential?: Potential
  name?: string
}

export interface OutpostDef {
  id: string
  name: string
  /** enemy level range for frontier waves */
  levelMin: number
  levelMax: number
  /** monster pool for frontier waves */
  pool: string[]
  followersRequired: number
  duel: { guild: string; squad: EnemyTemplate[] }
  goldPerKill: number
  expPerKill: number
}

export type FacilityId = 'quarters' | 'tavern' | 'blacksmith' | 'classHall'

export interface Materials {
  ore: number
  tome: number
  bronzeBadge: number
}

export interface LaneState {
  index: number
  /** duelist ids, max TEAM_SIZE */
  squad: string[]
  mode: 'frontier' | 'duel' | 'idle'
  battle: BattleState | null
  /** seconds until next wave spawns / revive */
  cooldown: number
  wave: number
}

export interface GameState {
  version: number
  seed: number
  idCounter: number
  time: number // total simulated seconds
  lastSavedAt: number // epoch ms
  gold: number
  materials: Materials
  followers: number
  outpostIdx: number
  /** highest outpost whose duel has been beaten (exclusive) */
  duelsWon: number
  facilities: Record<FacilityId, number>
  duelists: Record<string, Duelist>
  gear: Record<string, Gear>
  candidates: Candidate[]
  lanes: LaneState[]
  log: LogEntry[]
  stats: { kills: number; waves: number; avgWaveSeconds: number }
}

export interface LogEntry {
  t: number
  text: string
  kind: 'info' | 'loot' | 'win' | 'loss'
}

// ---- Battle runtime ----

export interface Combatant {
  uid: number
  side: Side
  /** duelist id for allies */
  ref?: string
  name: string
  classId: string
  stats: Stats
  hp: number
  maxHp: number
  x: number
  energy: number
  energyMax: number
  atkTimer: number
  alive: boolean
  /** guard buff: damage taken multiplier & remaining seconds */
  guard: number
  guardT: number
  level: number
  passive?: string
  /** once-per-battle passive (Second Wind / Undying) already used */
  onceUsed: boolean
}

export type BattleEvent =
  | { t: 'attack'; src: number; dst: number; ranged: boolean }
  | { t: 'damage'; dst: number; amount: number; crit: boolean }
  | { t: 'heal'; dst: number; amount: number }
  | { t: 'skill'; src: number; name: string; x: number; area?: number; kind: SkillKind }
  | { t: 'passive'; src: number; name: string }
  | { t: 'death'; dst: number }

export interface BattleState {
  units: Combatant[]
  elapsed: number
  over: boolean
  winner: Side | null
  events: BattleEvent[]
  uidCounter: number
}
