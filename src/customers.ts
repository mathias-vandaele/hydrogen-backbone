import { playChaChing, playCustomer } from './audio';
import { noteThresholdCrossing } from './chart';
import {
  CHURN_DAILY_PROBABILITY,
  CUSTOMER_TYPES,
  FIRST_CUSTOMER_GRACE_MAX_DAYS,
  FIRST_CUSTOMER_GRACE_MIN_DAYS,
  GLOBAL_EMERGENCE_COOLDOWN_DAYS,
  MAX_PRESSURE,
  REGIONS,
  TICKS_PER_DAY,
  getRegionConfig
} from './config';
import { getCenter } from './map';
import { triggerRegionFlash } from './renderer';
import { state } from './state';
import { showToast } from './ui';
import type { CustomerType, CustomerTypeConfig, EmergenceGate, PendingCustomer, SlotKind } from './types';

/**
 * Per-day emergence driver (runs once per game day). Does four things in
 * order:
 *
 *   1. Updates per-region reliability counters and the global surplus
 *      streak, because several emergence gates depend on sustained
 *      conditions rather than single-tick snapshots.
 *   2. Evaluates each (customer type × region) pair's emergence gate. If
 *      the gate fires and the region has a free slot of the right kind
 *      and the global emergence cooldown has elapsed, a PendingCustomer
 *      is enqueued with an investment lag before materialization.
 *   3. Advances pending customers: cancels those whose price signal has
 *      reversed (EMA climbed back above 110% of the threshold), and
 *      materializes those whose lag has elapsed.
 *   4. Rolls per-customer churn — each live customer has a small daily
 *      probability of shutting down, freeing its regional slot.
 *
 * This is the mechanic that proves the manifesto's thesis: with an
 * investment lag, the price signal propagates through multiple thresholds
 * before the first customer lands — so the backbone's price discovery
 * dominates the static threshold clamp. Plus each gate embodies a distinct
 * manifesto argument (see EmergenceGate in types.ts).
 */
export function checkEmergence(): void {
  const s = state;
  if (s.tick % TICKS_PER_DAY !== 0) return;

  updateRegionReliability();
  updateSurplusStreak();
  rollFirstCustomerGrace();
  evaluateEmergenceGates();
  advancePendingCustomers();
  rollChurn();
}

/**
 * Priority-4 grace window. The scarcity model (v4) can starve the player
 * if no customer ever lands before the budget runs out. Mitigation:
 * once the first pipeline has been placed and FIRST_CUSTOMER_GRACE_MIN_DAYS
 * have elapsed, roll a daily probability (ramping up to 100% by
 * FIRST_CUSTOMER_GRACE_MAX_DAYS) for a customer to appear via the
 * pending queue. Subsequent customers still use the full lagged
 * commitment rules. A no-op once any live or pending customer exists.
 */
function rollFirstCustomerGrace(): void {
  const s = state;
  if (s.firstPipelineBuiltDay === null) return;
  if (s.customers.length > 0 || s.pendingCustomers.length > 0) return;
  const daysSincePipe = s.gameDay - s.firstPipelineBuiltDay;
  if (daysSincePipe < FIRST_CUSTOMER_GRACE_MIN_DAYS) return;
  const windowSize = Math.max(1, FIRST_CUSTOMER_GRACE_MAX_DAYS - FIRST_CUSTOMER_GRACE_MIN_DAYS);
  const ramp = Math.min(1, (daysSincePipe - FIRST_CUSTOMER_GRACE_MIN_DAYS) / windowSize);
  // Scale daily probability so the expected spawn lands in the window.
  const prob = 0.05 + ramp * 0.45;
  if (Math.random() > prob) return;

  // Pick a price-gated customer type that has a free slot anywhere.
  // Preference order: steel → ammonia → chemical. These three always
  // target industrial slots so the bias is predictable.
  const preferred: CustomerType[] = ['steel', 'ammonia', 'chemical'];
  for (const type of preferred) {
    const cfg = CUSTOMER_TYPES[type];
    const regionId = pickEligibleRegion(type, cfg);
    if (!regionId) continue;
    const targetDemand = Math.round(cfg.demandMin + Math.random() * (cfg.demandMax - cfg.demandMin));
    s.pendingCustomers.push({
      id: `grace-${type}-${s.gameDay}`,
      type,
      regionId,
      committedOnDay: s.gameDay,
      commitsOnDay: s.gameDay + Math.min(cfg.investmentLagDays, 20), // shorter lag for grace
      cancelled: false,
      targetDemand
    });
    s.lastCustomerEmergenceDay = s.gameDay;
    return;
  }
}

/**
 * Increment each region's `reliabilityDays` if it's currently pipe-connected
 * and producing hydrogen; otherwise reset. Feeds the `supplyReliability`
 * gate (fuel cell stations) — they only commit once the backbone has
 * proven reliable for N days, modelling the permissionless-distributed-
 * consumption argument.
 */
function updateRegionReliability(): void {
  for (const rc of REGIONS) {
    const rs = state.regions[rc.id];
    if (rs.pipeConnections > 0 && rs.supply > 0) rs.reliabilityDays++;
    else rs.reliabilityDays = 0;
  }
}

/**
 * Advance or reset the national surplus streak — consecutive days where
 * total supply ÷ total demand ≥ export gate's minSurplusRatio. Feeds the
 * `domesticSurplus` gate (export terminals), which only fires once
 * France is reliably producing more than it needs.
 */
function updateSurplusStreak(): void {
  const s = state;
  let supply = 0;
  let demand = 0;
  for (const rc of REGIONS) {
    supply += s.regions[rc.id].supply;
    demand += s.regions[rc.id].demand;
  }
  const ratio = demand > 0 ? supply / demand : (supply > 0 ? Infinity : 0);
  // Min target across any export-gated customer type.
  const minRatio = Math.min(
    ...Object.values(CUSTOMER_TYPES)
      .filter(c => c.emergenceGate.kind === 'domesticSurplus')
      .map(c => (c.emergenceGate as { minSurplusRatio: number }).minSurplusRatio)
  );
  if (ratio >= minRatio) s.surplusStreakDays++;
  else s.surplusStreakDays = 0;
}

/**
 * For each customer type, check whether its emergence gate fires and — if
 * so — pick the best eligible region and enqueue a PendingCustomer. One
 * new pending customer max per GLOBAL_EMERGENCE_COOLDOWN_DAYS across the
 * whole map, enforced at the top of the function: this rate-limit is
 * what prevents the threshold-clamp cascade from 1/2/3 thresholds firing
 * simultaneously.
 */
function evaluateEmergenceGates(): void {
  const s = state;
  if (s.gameDay - s.lastCustomerEmergenceDay < GLOBAL_EMERGENCE_COOLDOWN_DAYS) return;

  // Snapshot of pressure-normalized value used by pressureRelief gate
  const pressureNorm = s.networkPressure / MAX_PRESSURE;

  // Evaluate types in a randomized order so no single type wins every roll.
  const types = (Object.keys(CUSTOMER_TYPES) as CustomerType[])
    .slice()
    .sort(() => Math.random() - 0.5);

  for (const type of types) {
    const cfg = CUSTOMER_TYPES[type];
    if (!gateFires(cfg.emergenceGate, pressureNorm)) continue;

    // Record the first time each gate's threshold was crossed downward
    // (used by chart annotations). Only meaningful for priceThreshold gates.
    if (cfg.emergenceGate.kind === 'priceThreshold' && s.thresholdCrossings[type] === null) {
      s.thresholdCrossings[type] = s.gameDay;
      noteThresholdCrossing(type);
    }

    const regionId = pickEligibleRegion(type, cfg);
    if (!regionId) continue;

    // Don't double-book: if this type already has a pending customer in
    // this region, skip (the existing one will materialize in due course).
    if (s.pendingCustomers.some(p => !p.cancelled && p.type === type && p.regionId === regionId)) {
      continue;
    }

    const targetDemand = cfg.demandMin + Math.random() * (cfg.demandMax - cfg.demandMin);
    const p: PendingCustomer = {
      id: `${type}-${regionId}-${s.gameDay}-${Math.floor(Math.random() * 1e6)}`,
      type,
      regionId,
      committedOnDay: s.gameDay,
      commitsOnDay: s.gameDay + cfg.investmentLagDays,
      cancelled: false,
      targetDemand: Math.round(targetDemand)
    };
    s.pendingCustomers.push(p);
    s.lastCustomerEmergenceDay = s.gameDay;
    return; // One commit per cooldown window.
  }
}

/**
 * Resolve an EmergenceGate against current state. Returns true when the
 * gate's sustained condition holds on today's snapshot.
 */
function gateFires(gate: EmergenceGate, pressureNorm: number): boolean {
  const s = state;
  switch (gate.kind) {
    case 'priceThreshold':
      // Use EMA (not spot) so single-tick dips don't fire commitments.
      return s.priceEMA <= gate.threshold;
    case 'pressureRelief':
      return pressureNorm >= gate.minPressure;
    case 'supplyReliability':
      // At least one region must have met the uptime threshold.
      return REGIONS.some(rc => s.regions[rc.id].reliabilityDays >= gate.minUptimeDays);
    case 'domesticSurplus':
      return s.surplusStreakDays >= gate.minSurplusDays;
  }
}

/**
 * Choose the region where a pending customer of the given type should
 * land. Considers slot availability, pipe connectivity, port requirement,
 * and a weak bias toward regions with the right bonuses — industrial
 * demand for steel/ammonia/chemical, reliability for fuelcell, port
 * proximity for export, etc. Returns null if no eligible region exists.
 */
function pickEligibleRegion(_type: CustomerType, cfg: CustomerTypeConfig): string | null {
  const s = state;
  const eligible: Array<{ id: string; score: number }> = [];

  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (rs.pipeConnections < cfg.minPipeConnections) continue;
    if (cfg.requiresPort && !rc.hasPort) continue;

    // Slot availability: count live + pending customers of this slotKind
    // against the region's capacity for that kind.
    if (!hasFreeSlot(rc.id, cfg.slotKind)) continue;

    // Soft bias score per gate
    let score = 1;
    if (cfg.emergenceGate.kind === 'priceThreshold') score *= Math.max(0.2, rc.industryDemand);
    if (cfg.emergenceGate.kind === 'supplyReliability') score *= 1 + (rs.reliabilityDays / 120);
    if (cfg.emergenceGate.kind === 'domesticSurplus' && rc.hasPort) score *= 1.5;
    if (cfg.emergenceGate.kind === 'pressureRelief') score *= rs.pressure / 40;

    eligible.push({ id: rc.id, score: Math.max(0.05, score) });
  }

  if (eligible.length === 0) return null;

  // Weighted pick so high-bonus regions win more often without being
  // deterministic — early-game trajectories stay varied across sessions.
  const total = eligible.reduce((s2, e) => s2 + e.score, 0);
  let r = Math.random() * total;
  for (const e of eligible) {
    r -= e.score;
    if (r <= 0) return e.id;
  }
  return eligible[0].id;
}

/**
 * Returns true when the region has a free slot of the given kind, counting
 * both live active customers and pending customers targeting the region.
 */
export function hasFreeSlot(regionId: string, kind: SlotKind): boolean {
  const rc = getRegionConfig(regionId);
  if (!rc) return false;
  const cap = slotCapacity(rc, kind);
  if (cap <= 0) return false;
  const liveOrPending = state.customers.filter(c => c.active && c.regionId === regionId && CUSTOMER_TYPES[c.type].slotKind === kind).length
    + state.pendingCustomers.filter(p => !p.cancelled && p.regionId === regionId && CUSTOMER_TYPES[p.type].slotKind === kind).length;
  return liveOrPending < cap;
}

function slotCapacity(rc: ReturnType<typeof getRegionConfig> & object, kind: SlotKind): number {
  switch (kind) {
    case 'industrial': return rc.industrialSlots;
    case 'distributed': return rc.distributedSlots;
    case 'port': return rc.portSlots;
    case 'efuel': return rc.efuelSlots;
  }
}

/**
 * Walk pending customers in reverse so splice is safe. Cancel those whose
 * EMA has risen back above 110% of the committing threshold — investment
 * withdraws when the price signal reverses. Materialize those whose
 * lag window has elapsed.
 */
function advancePendingCustomers(): void {
  const s = state;
  for (let i = s.pendingCustomers.length - 1; i >= 0; i--) {
    const p = s.pendingCustomers[i];
    if (p.cancelled) { s.pendingCustomers.splice(i, 1); continue; }

    const cfg = CUSTOMER_TYPES[p.type];
    if (cfg.emergenceGate.kind === 'priceThreshold') {
      // Cancel if signal reverses
      if (s.priceEMA > cfg.emergenceGate.threshold * 1.10) {
        p.cancelled = true;
        s.pendingCustomers.splice(i, 1);
        continue;
      }
    }

    if (s.gameDay >= p.commitsOnDay) {
      materializePending(p);
      s.pendingCustomers.splice(i, 1);
    }
  }
}

/**
 * Promote a PendingCustomer into a live Customer: slot takes effect,
 * ramp begins at 0, the region flashes and the ping plays.
 */
function materializePending(p: PendingCustomer): void {
  const s = state;
  const cfg = CUSTOMER_TYPES[p.type];
  const rc = getRegionConfig(p.regionId);
  if (!rc) return;
  const center = getCenter(p.regionId);
  const angle = Math.random() * Math.PI * 2;
  const radius = 20 + Math.random() * 25;

  s.customers.push({
    id: s.nextCustomerId++,
    regionId: p.regionId,
    type: p.type,
    name: cfg.name,
    demand: p.targetDemand,
    maxPrice: cfg.priceThreshold,
    satisfaction: 1.0,
    x: center[0] + Math.cos(angle) * radius,
    y: center[1] + Math.sin(angle) * radius,
    appearedDay: s.gameDay,
    active: true,
    unsatisfiedDays: 0,
    scale: 0,
    ramp: 0
  });

  playCustomer();
  playChaChing();
  triggerRegionFlash(p.regionId);
  showToast(`${cfg.icon} New ${cfg.name} in ${rc.name}!`);
}

/**
 * Daily churn: live customers have a small random chance of shutting
 * down, simulating demand softening / competitor wins / retrofits. Also
 * fires a regional flash on exit so the player notices the change.
 */
function rollChurn(): void {
  const s = state;
  for (const c of s.customers) {
    if (!c.active) continue;
    // Don't churn in the first 60 days — brand-new customers shouldn't
    // instantly vanish.
    if (s.gameDay - c.appearedDay < 60) continue;
    if (Math.random() < CHURN_DAILY_PROBABILITY) {
      c.active = false;
      const rc = getRegionConfig(c.regionId);
      showToast(`${c.name} shut down in ${rc?.name ?? c.regionId}`);
    }
  }
}

/**
 * Per-tick customer animation + ramp advancement. Pop-in scale animates
 * every tick; the demand ramp (0→1 over rampDurationDays game days)
 * advances at the day boundary. Stickiness: we no longer remove customers
 * for low satisfaction — the rollChurn function handles attrition.
 */
export function updateCustomers(): void {
  const s = state;

  // Pop-in scale animation every tick (ignore if already full-size).
  for (const c of s.customers) {
    if (!c.active) continue;
    if (c.scale < 1) c.scale = Math.min(1, c.scale + 0.05);
  }

  if (s.tick % TICKS_PER_DAY !== 0) return;

  // Advance ramps at the day boundary.
  for (const c of s.customers) {
    if (!c.active) continue;
    const cfg = CUSTOMER_TYPES[c.type];
    if (c.ramp < 1 && cfg.rampDurationDays > 0) {
      c.ramp = Math.min(1, c.ramp + 1 / cfg.rampDurationDays);
    }
    // Light bookkeeping: track consecutive unsatisfied days for UI only.
    if (c.satisfaction < 0.3) c.unsatisfiedDays++;
    else c.unsatisfiedDays = Math.max(0, c.unsatisfiedDays - 1);
  }
}

/**
 * Legacy direct-spawn path, kept for any debug or test hook that needs to
 * place a customer without going through the pending queue. Not used by
 * the emergence model — which goes through `materializePending`.
 */
export function spawnCustomer(regionId: string, type: CustomerType, demand: number): void {
  const s = state;
  const cfg = CUSTOMER_TYPES[type];
  const rc = getRegionConfig(regionId);
  if (!rc) return;
  const center = getCenter(regionId);
  const angle = Math.random() * Math.PI * 2;
  const radius = 20 + Math.random() * 25;
  s.customers.push({
    id: s.nextCustomerId++,
    regionId,
    type,
    name: cfg.name,
    demand: Math.round(demand),
    maxPrice: cfg.priceThreshold,
    satisfaction: 1.0,
    x: center[0] + Math.cos(angle) * radius,
    y: center[1] + Math.sin(angle) * radius,
    appearedDay: s.gameDay,
    active: true,
    unsatisfiedDays: 0,
    scale: 0,
    ramp: 1
  });
  playCustomer();
  playChaChing();
  triggerRegionFlash(regionId);
  showToast(`${cfg.icon} New ${cfg.name} in ${rc.name}!`);
}
