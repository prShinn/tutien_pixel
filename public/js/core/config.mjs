// ESM-owned gameplay configuration. Legacy feature scripts receive read/write
// access through the compatibility bridge installed by bootstrap.js.
export const CFG = {
  TS: 1,
  ACTOR_W: 14,
  ACTOR_H: 18,
  ACTOR_FOOT_OFFSET: 3,
  DS: 3,
  INV_MAX: 40,
  ATK_CD: 42,
  BASIC_ATTACK_RANGE: 24,
  ATTACK_RANGE_PADDING: 2,
  SKILL_RANGE_SCALE: 6,
  PLAYER_COLLISION_RADIUS: 0.45,
  PLAYER_MOVE_SPEED: 44,
  REMOTE_MOVE_SPEED: 56,
  INTERACTION_RANGE: 24,
  NET_SNAP_DISTANCE: 48,
  REGEN_HP: 0,
  REGEN_MP: 0,
  MON_AGGRO: 40,
  MON_LEASH: 72,
  MON_ATTACK_RANGE: 18,
  MON_RESPAWN: 420,
  REALMS: [],
  ROOTS: [],
  MONSTERS: [],
  ITEMS: {},
  SKILLS: {},
  SHOP_SELL: [],
};

let linhCan = {};

export function getLinhCan() {
  return linhCan;
}

export function setLinhCan(value) {
  linhCan = value;
}
