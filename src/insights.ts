// Manifesto-insight pop-ups that fire at meaningful player milestones.
// Each milestone fires at most once per session (flag gated in state), and
// only one insight can fire per call so players aren't spammed.

import { state } from './state';
import { showManifesto } from './ui';
import type { Insight } from './types';

interface Milestone {
  key: keyof typeof state.milestones;
  check: () => boolean;
  insight: Insight;
}

const MILESTONES: Milestone[] = [
  {
    key: 'firstCustomer',
    check: () => state.customers.some(c => c.active),
    insight: {
      title: 'Permissionless Consumption',
      text: 'Your first customer arrived on its own. Nobody coordinated this. The customer saw a price and a pipe, and connected. This is the protocol layer working: production and consumption meet in a market, not a plan. "The pipe does not care who injects hydrogen or who withdraws it."'
    }
  },
  {
    key: 'curtailment100',
    check: () => state.totalCurtailed > 100,
    insight: {
      title: 'The Curtailment Scandal',
      text: 'You just saved enough renewable electricity to equal a small town\'s daily consumption — electricity that today, without the backbone, is thrown away as "curtailment." The hydrogen network eliminates curtailment structurally: there is always somewhere for the electron to go.'
    }
  },
  {
    key: 'priceBelow3',
    check: () => state.spotPrice < 3.0 && state.priceHistory.length > 10,
    insight: {
      title: 'The Oil Price Ceiling Is Closing',
      text: 'H₂ below €3/kg. At this level, e-fuels become competitive with oil near $150/bbl — and keep falling. The fossil fuel industry does not need to be banned. It gets priced out. Quietly, permanently, by the flywheel you are spinning.'
    }
  },
  {
    key: 'tenPipes',
    check: () => state.pipes.length >= 10,
    insight: {
      title: 'The Backbone Is Emerging',
      text: 'Ten pipes. A topology is forming. Line-pack alone now stores gigawatt-hours of buffer capacity. The network becomes more than the sum of its links: pressure routes around failures, markets clear locally, permissionless injection finds permissionless withdrawal. This is the protocol layer. Build more pipe.'
    }
  }
];

/**
 * Called once per game-day from sim.ts. Walks the MILESTONES list,
 * fires the first unfired milestone whose predicate now holds, and marks
 * it so it never fires again this session. Returns early after one fire
 * to avoid dog-piling pop-ups on the same frame.
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
