const frostScores = {
  nova: 16, lance: 17, blizzard: 13, blink: 14, barrier: 13, orb: 12, comet: 11,
  frostChain: 13, iceBloom: 17, whiteout: 17, winterMoon: 16, absoluteZero: 21,
  rimeVolley: 15, frostBind: 15, glacierWall: 16, glacialCollapse: 20, frostGale: 15, auroraStrike: 18, chainLightning: 21,
};
const fireScores = {
  fireBlast: 17, pyro: 17, flamestrike: 15, livingBomb: 15, combustion: 12, fireBarrier: 14, blink: 14,
  emberFan: 15, flashpoint: 16, phoenix: 19, supernova: 21,
  cinderMarks: 15, emberBrand: 12, meteor: 18, cinderVortex: 16, infernoHeart: 20,
};
const areaSpells = {
  frost: ['nova', 'blizzard', 'orb', 'comet', 'iceBloom', 'whiteout', 'winterMoon', 'absoluteZero', 'glacialCollapse', 'frostGale', 'chainLightning'],
  fire: ['flamestrike', 'livingBomb', 'meteor', 'phoenix', 'emberFan', 'cinderVortex', 'supernova', 'infernoHeart'],
};
const areaPerk = /^(flamestrike|living-bomb|meteor|phoenix|ember-fan|cinder-vortex|supernova|inferno-heart|nova|blizzard|orb|whiteout|ice-bloom|glacial-collapse|absolute-zero|winter-moon)-(power|ignite|radius)$/;

export function buildChoice(game, style, rarities) {
  const cold = game.mageClass === 'frost', scores = cold ? frostScores : fireScores;
  const score = (choice) => {
    if (cold && style === 'blizzard' && choice.id === 'learn-blizzard') return 50;
    if (choice.id === 'heart' && game.hp < 64) return 28;
    if ('spell' in choice) {
      const spell = choice.spell;
      let value = scores[spell] ?? 0;
      if (game.spells.size >= 7) value -= 11;
      if (style === 'elemental' && rarities[spell] !== 'common') value += 4;
      if ((style === 'area' || style === 'blizzard') && areaSpells[game.mageClass].includes(spell)) value += 7;
      if (spell === 'pyro' && !game.spells.has('fireBlast')) value -= 7;
      return value;
    }
    const rate = game.level > 6 ? 12 : 7;
    if (style === 'blizzard' && ['storm', 'blizzard-power', 'reach'].includes(choice.id)) {
      const rank = game.perks[choice.id] ?? 0;
      return rank < (choice.id === 'storm' ? 5 : 7) ? 26 : 18;
    }
    if (choice.id === 'regeneration' && game.hp < 85) return 16;
    if (choice.id === 'status-time') return rate + (style === 'elemental' ? 4 : 1);
    if (choice.id === 'frost-bind-spread' || choice.id === 'frost-bind-reclaim') return rate + (style === 'elemental' ? 3 : 0);
    if (choice.id.startsWith('chain-lightning-') || choice.id === 'frost-chain-links') return rate + (style === 'elemental' ? 5 : 2);
    if (choice.id === 'glacier-wall-life' || choice.id === 'glacier-wall-size') return rate + (style === 'elemental' ? 3 : 0);
    if (choice.id === 'bomb-spread') return rate + (style === 'balanced' ? 2 : 4);
    if (style === 'area' && choice.id === 'reach') return (game.perks.reach ?? 0) < 7 ? 23 : 13;
    if (style === 'area' && game.level > 5 && (areaPerk.test(choice.id) || ['wide', 'storm', 'bomb-radius', 'vortex'].includes(choice.id))) {
      return (game.perks[choice.id] ?? 0) < 2 ? 19 : 15;
    }
    if (cold && choice.id === 'twins' && !game.perks.twins) return game.level < 10 ? 19 : 12;
    if (cold && choice.id === 'cold' && game.level < 8) return 12;
    if (['shards', 'kindling', 'haste', 'reach'].includes(choice.id)) return rate;
    if (['frozen-power', 'wide', 'blizzard-chill', 'flamestrike-ignite', 'fireball-ignite', 'bomb-radius'].includes(choice.id)) {
      return rate + (style === 'elemental' ? 3 : -1);
    }
    if (choice.id === (cold ? 'bolt-power' : 'fireball-power')) return game.level < 8 ? 14 : 9;
    if (choice.id === 'study' && game.level < 13) return 9;
    return ['heart', 'stride', 'precision', 'critical-force', 'magnet'].includes(choice.id) ? 7 : 5;
  };
  return game.choices.reduce((best, choice) => score(choice) > score(best) ? choice : best, game.choices[0]);
}

const sq = (x, z) => x * x + z * z;
const hazardDistance = (hazard, x, z) => {
  const dx = x - hazard.x, dz = z - hazard.z;
  if (!hazard.charge) return Math.hypot(dx, dz);
  const vx = hazard.charge.to.x - hazard.x, vz = hazard.charge.to.z - hazard.z;
  const lane = Math.max(0, Math.min(1, (dx * vx + dz * vz) / Math.max(.001, sq(vx, vz))));
  return Math.hypot(dx - vx * lane, dz - vz * lane);
};

export function useExpedition(game) {
  const npc = game.nearbyQuestNpc;
  if (npc) game.acceptQuest(npc.id);
  if (!game.gold) return false;
  const priorities = game.hp <= game.maxHp * .5 ? ['heart', 'haste', 'status-time'] : ['haste', 'status-time', 'regeneration'];
  return priorities.some((id) => game.buyCommonTalent(id));
}

export function expeditionTarget(game) {
  const heart = game.supplies.find((item) => item.kind === 'heart');
  if (heart && game.hp / game.maxHp <= .72 && sq(heart.x - game.player.x, heart.z - game.player.z) < 32 ** 2) {
    return { ...heart, weight: 1.15 };
  }
  const magnet = game.supplies.find((item) => item.kind === 'magnet');
  if (magnet && game.pickups.length >= 9 && sq(magnet.x - game.player.x, magnet.z - game.player.z) < 32 ** 2) {
    return { ...magnet, weight: .92 };
  }
  if (game.nextQuestSignal) return { ...game.nextQuestSignal, weight: 1.05 };
  const boss = game.questBoss;
  if (boss && sq(boss.x - game.player.x, boss.z - game.player.z) > 12 ** 2) return { ...boss, weight: .78 };
  const npc = game.closestQuestNpc;
  return npc && { ...npc, weight: .78 };
}

export function turnTowardThreat(game, dt) {
  const p = game.player;
  let distance = 14 ** 2, aim = p.heading;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) continue;
    const x = enemy.x - p.x, z = enemy.z - p.z, d = sq(x, z);
    if (d >= distance) continue;
    distance = d;
    aim = Math.atan2(x, z);
  }
  const turn = Math.atan2(Math.sin(aim - p.heading), Math.cos(aim - p.heading));
  p.heading += Math.max(-2.55 * dt, Math.min(2.55 * dt, turn));
}

export function steering(game, fieldX, fieldZ, target, camp) {
  const { x, z } = game.player;
  const enemies = game.enemies.filter((enemy) => sq(enemy.x - x, enemy.z - z) < 15 ** 2)
    .map((enemy) => {
      const dx = enemy.x - x, dz = enemy.z - z;
      const speed = (enemy.frozen > .65 ? 0 : enemy.speed * (enemy.slow ? 1 - (enemy.slowPower ?? .47) : 1)) /
        Math.max(.001, Math.hypot(dx, dz));
      return { dx, dz, vx: -dx * speed, vz: -dz * speed, radius: enemy.radius };
    });
  const hazards = game.hazards.filter((hazard) => hazard.delay <= hazard.windup && hazard.delay <= 1.45);
  let gem, gemScore = -Infinity;
  for (const pickup of game.pickups) {
    const d = Math.sqrt(sq(pickup.x - x, pickup.z - z));
    if (d > 18 || d < .43) continue;
    const value = Math.log1p(pickup.value) - .14 * d;
    if (value > gemScore) { gem = pickup; gemScore = value; }
  }
  let best = { x: 0, z: 0 }, bestScore = -Infinity;
  const horizon = .58, speed = game.moveSpeed;
  const periodic = (value, center, half) => value - Math.round((value - center) / (2 * half)) * 2 * half;
  const cx = periodic(camp?.x ?? 0, x, fieldX), cz = periodic(camp?.z ?? 0, z, fieldZ);
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI * 2 / 16 + .15 * game.time;
    const dx = Math.sin(angle), dz = Math.cos(angle);
    const px = x + dx * horizon * speed, pz = z + dz * horizon * speed;
    let score = (dx * (z - cz) - dz * (x - cx)) * (target ? .002 : .016);
    if (target) score += target.weight * (Math.hypot(x - target.x, z - target.z) - Math.hypot(px - target.x, pz - target.z));
    else score -= Math.max(0, Math.hypot(px - cx, pz - cz) - 21) * .17;
    if (gem) score += .34 * (Math.hypot(x - gem.x, z - gem.z) - Math.hypot(px - gem.x, pz - gem.z));
    for (const enemy of enemies) {
      // Avoid crossing an enemy on the way to a free endpoint, not just standing near it.
      const vx = enemy.vx - dx * speed, vz = enemy.vz - dz * speed;
      const t = Math.max(0, Math.min(horizon, -(enemy.dx * vx + enemy.dz * vz) / Math.max(.001, sq(vx, vz))));
      const closest = Math.hypot(enemy.dx + vx * t, enemy.dz + vz * t) - enemy.radius;
      const finish = Math.hypot(enemy.dx + vx * horizon, enemy.dz + vz * horizon) - enemy.radius;
      score -= Math.max(0, 1.35 - closest) ** 2 * 4 + Math.max(0, 2.5 - finish) ** 2 * .6;
    }
    for (const hazard of hazards) {
      const distance = hazard.delay * speed;
      const margin = hazardDistance(hazard, x + dx * distance, z + dz * distance) - hazard.radius;
      score -= Math.max(0, .75 - margin) ** 2 * 4.3;
    }
    if (score > bestScore) { bestScore = score; best = { x: dx, z: dz }; }
  }
  return best;
}
