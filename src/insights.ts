// Manifesto-insight pop-ups that fire at meaningful player milestones.
// v4 Priority 1 also applies here — the same anti-puddle principle
// protecting the climactic triggers must protect the insight pop-ups,
// since they all speak with the manifesto's voice and any of them
// firing too cheaply undermines the thesis. Each milestone now carries
// a minimum-day floor AND a volume floor so short-term spikes can't
// trigger a pop-up.

import { state } from './state';
import { showManifesto } from './ui';
import type { Insight } from './types';

interface Milestone {
  key: keyof typeof state.milestones;
  check: () => boolean;
  insight: Insight;
}

const EARLIEST_INSIGHT_DAY = 90;
const PRICE_INSIGHT_MIN_PRODUCTION_KG = 5_000;

const MILESTONES: Milestone[] = [
  {
    key: 'firstCustomer',
    // First-customer insight is the gentlest — fires as soon as a customer
    // exists AND at least 30 days have passed so an immediate grace-window
    // emergence doesn't also dog-pile the pop-up.
    check: () => state.gameDay >= 30 && state.customers.some(c => c.active),
    insight: {
      title: 'Permissionless Consumption',
      text: 'Your first customer arrived on its own. Nobody coordinated this. The customer saw a price and a pipe, and connected. This is the protocol layer working: production and consumption meet in a market, not a plan. "The pipe does not care who injects hydrogen or who withdraws it."'
    }
  },
  {
    key: 'priceBelow3',
    // Replaces the v3 "€3/kg" trigger — gated on actual spot price plus
    // a production floor plus the day floor.
    check: () =>
      state.gameDay >= EARLIEST_INSIGHT_DAY &&
      state.spotPrice < 3.0 &&
      state.priceHistory.length > 30 &&
      totalDailyProduction() >= PRICE_INSIGHT_MIN_PRODUCTION_KG,
    insight: {
      title: 'The Oil Price Ceiling Is Closing',
      text: 'H₂ below €3/kg and a real market behind it. At this level, e-fuels become competitive with oil — and keep falling. The fossil fuel industry does not need to be banned. It gets priced out. Quietly, permanently, by the flywheel you are spinning.'
    }
  },
  {
    key: 'tenPipes',
    // Network-topology insight. Ten pipes already required some scale,
    // but keep the day floor so a chain-built opening doesn't fire it
    // before the backbone has settled into actually-transporting.
    check: () => state.gameDay >= EARLIEST_INSIGHT_DAY && state.pipes.length >= 10,
    insight: {
      title: 'The Backbone Is Emerging',
      text: 'Ten pipes. A topology is forming. Line-pack alone now stores gigawatt-hours of buffer capacity. The network becomes more than the sum of its links: pressure routes around failures, markets clear locally, permissionless injection finds permissionless withdrawal. This is the protocol layer. Build more pipe.'
    }
  }
];

/**
 * Daily bookkeeping: walk the MILESTONES list, fire the first unfired
 * milestone whose (day-floored, volume-floored) predicate holds, and
 * mark it so it never fires again this session. At most one pop-up
 * per call.
 */
export function checkInsights(): void {
  for (const m of MILESTONES) {
    if (state.milestones[m.key]) continue;
    if (m.check()) {
      state.milestones[m.key] = true;
      showManifesto(m.insight);
      state.insightIndex++;
      state.lastInsightDay = state.gameDay;
      return;
    }
  }
}

function totalDailyProduction(): number {
  let kg = 0;
  for (const b of state.buildings) kg += b.production;
  return kg;
}
