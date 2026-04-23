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
    text: 'Build France\'s hydrogen economy from the ground up. Prove that a molecular hydrogen backbone — a dumb pipe — is the missing protocol layer for the energy transition.\n\n"Build the pipe. The rest follows."',
    btn: 'Begin'
  },
  {
    title: 'Step 1: Build a Hydrogen Plant',
    text: 'Click "Solar Hydrogen Plant" in the build menu, then place it in a sunny southern region like Occitanie or PACA. Solar electricity is converted to hydrogen *inside the plant* at 70% efficiency — only molecules leave the facility.\n\n☀ Sunlight → ⚡ internal electricity → 🔬 electrolysis → 💧 H₂',
    btn: 'Next'
  },
  {
    title: 'Step 2: Draw the Pipe',
    text: 'Click "Pipeline", then click two regions to connect. The pipe carries hydrogen — not electricity — between regions. Line-packed pipe is the battery.\n\n"The pipe does not care who injects hydrogen or who withdraws it."',
    btn: 'Next'
  },
  {
    title: 'Step 3: Watch the Price Descend',
    text: 'As the backbone grows, price descends through a staircase of thresholds — each a type of customer that emerges on its own logic: industry needs cheap H₂, e-fuel soaks up high pressure, fuel-cell stations trust reliable supply, export terminals arrive when surplus is sustained.\n\nYour target: oil parity (€4.5/kg) → escape velocity.\n\nSpeed: 1×/2×/3× or 1/10/100. Space pauses.',
    btn: 'Start Playing!'
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
