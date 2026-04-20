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
    title: 'Step 1: The Map',
    text: 'France is divided into 13 regions, each with unique strengths. Southern regions get more sun. Northern/coastal regions get more wind. Some have nuclear plants, industrial demand, or ports. Hover over regions to explore.',
    btn: 'Next'
  },
  {
    title: 'Step 2: Build Solar',
    text: 'Start by building a Solar Farm in a sunny southern region like Occitanie or Provence-Alpes-Côte d\'Azur. Click "Solar Farm" in the build menu, then click a region.\n\n"Solar electricity in southern Europe costs 20 €/MWh today."',
    btn: 'Next'
  },
  {
    title: 'Step 3: Add an Electrolyzer',
    text: 'Solar panels make electricity, but electricity is the wrong carrier for bulk energy. Build an Electrolyzer in the same region to convert electricity into hydrogen molecules at 70% efficiency.',
    btn: 'Next'
  },
  {
    title: 'Step 4: Build the Pipe',
    text: 'Draw pipelines between regions to create the hydrogen backbone. Click "Pipeline" in the build menu, then click two regions to connect. The pipe stores energy through line-packing — it IS the battery.\n\n"The pipe does not care who injects hydrogen or who withdraws it."',
    btn: 'Next'
  },
  {
    title: 'Step 5: Watch the Flywheel',
    text: 'As hydrogen flows and prices drop, customers will emerge: steel plants, ammonia factories, e-fuel refineries, and more. Their demand creates revenue. Revenue funds more solar and pipes. Costs fall via Wright\'s Law. The flywheel spins.\n\nUse speed controls (1×/10×/100×) to accelerate time. Right-click to cancel building. Press Space to pause.',
    btn: 'Start Playing!'
  }
];

export function initTutorial(): void {
  $('#tut-btn').addEventListener('click', nextStep);
  if (state.tutorialDone) {
    $('#tutorial').classList.remove('show');
    return;
  }
  showStep(0);
}

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

export function nextStep(): void {
  playClick();
  showStep(state.tutorialStep + 1);
}
