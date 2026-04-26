import { playClick } from './audio';
import { $ } from './dom';
import { state } from './state';

interface TutorialStep {
  title: string;
  text: string;
  btn: string;
}

const STEPS: TutorialStep[] = [
  {
    title: 'The Backbone',
    text: 'France\'s energy transition needs more than electrons. Cheap renewable electricity solves only part of the problem — heavy industry, long-haul transport, and seasonal storage need molecules.\n\nYour job: build a national hydrogen backbone. A single dumb pipe carrying clean molecules from where they\'re produced to where they\'re needed.\n\n"Build the pipe. The rest follows."',
    btn: 'Begin'
  },
  {
    title: 'Plants produce molecules, not electrons',
    text: 'Each Hydrogen Plant bundles a generator with an integrated electrolyzer. Sunlight, wind, or nuclear heat is converted to hydrogen *inside the facility* — only molecules leave.\n\nPlace your first plant in a region matching its strength: solar in the south, wind on the coast, nuclear anywhere with a grid connection.\n\nThe pipe carries molecules. The map carries the network. Electrons stay home.',
    btn: 'Next'
  },
  {
    title: 'The pipe is the battery',
    text: 'Click Pipeline, then connect two regions. The backbone carries hydrogen between producers and consumers — and stores it via line-packing pressure when supply briefly exceeds demand.\n\nA dumb pipe. No central operator. No dispatch coordination. Producers inject, consumers withdraw, pressure absorbs the mismatch.\n\n"The pipe does not care who injects hydrogen or who withdraws it."',
    btn: 'Next'
  },
  {
    title: 'Pressure is life',
    text: 'Network pressure rises when production exceeds consumption, falls when consumption exceeds production. Watch it carefully.\n\nIf pressure drops to zero, the network has collapsed. Customers walk away. The game ends.\n\nKeep pressure healthy by building enough capacity to cover demand — including night, calm wind, and reactor refueling. Caverns help by storing surplus for shortage periods. The backbone only works if it stays pressurized.',
    btn: 'Next'
  },
  {
    title: 'Watch the staircase',
    text: 'As your network grows and the price of hydrogen descends, customers commit in tiers. Small distributed users first. Mid-scale industrial buyers as supply becomes reliable. Major anchor loads — steel mills, ammonia plants, export terminals — only once the network can demonstrably serve them.\n\nResearch lowers CAPEX and improves efficiency. The price band tightens. New thresholds become reachable. The flywheel turns.\n\nSpace to pause. 1×/10×/100× to scale time.',
    btn: 'Begin'
  }
];

/**
 * Wire up the tutorial's "Next" button and decide whether to show the
 * tutorial at all on boot. Called after state has been loaded, so it
 * respects a prior save's `tutorialDone` flag.
 */
export function initTutorial(): void {
  $('#tut-btn').addEventListener('click', nextStep);
  if (state.tutorialDone) {
    $('#tutorial').classList.remove('show');
    return;
  }
  showStep(0);
}

/**
 * Render a specific tutorial step in the overlay. Passing an idx ≥ STEPS.length
 * marks the tutorial complete and hides the overlay — that's how the
 * final "Start Playing!" button closes the tutorial.
 */
export function showStep(idx: number): void {
  state.tutorialStep = idx;
  if (idx >= STEPS.length) {
    state.tutorialDone = true;
    $('#tutorial').classList.remove('show');
    return;
  }
  const step = STEPS[idx];
  $('#tut-title').textContent = step.title;
  $('#tut-text').textContent = step.text;
  $('#tut-step').textContent = idx === 0 ? '' : `Step ${idx} of ${STEPS.length - 1}`;
  $('#tut-btn').textContent = step.btn;
}

/** Advance to the next tutorial step (wired to the "Next" button). */
export function nextStep(): void {
  playClick();
  showStep(state.tutorialStep + 1);
}
