import { COLOR, GRID } from './design-system';

export type IconName =
  | 'solarPlant'
  | 'windPlant'
  | 'nuclearPlant'
  | 'electrolyzer'
  | 'saltCavern'
  | 'pipeline'
  | 'pipeJunction'
  | 'steelPlant'
  | 'ammoniaPlant'
  | 'chemicalPlant'
  | 'efuelRefinery'
  | 'fuelCellStation'
  | 'exportTerminal'
  | 'pressureGauge'
  | 'pause'
  | 'play'
  | 'fastForward'
  | 'save'
  | 'load'
  | 'alert'
  | 'check'
  | 'clock'
  | 'soundOn'
  | 'soundOff';

interface IconDefinition {
  paths: string[];
  fills?: string[];
}

const ICONS: Record<IconName, IconDefinition> = {
  solarPlant: {
    paths: [
      'M4 18 L18 14 L21 17 L7 21 Z',
      'M7 17 L10 20 M10 16 L13 19 M13 15 L16 18 M16 14 L19 17',
      'M6 18.6 L20 14.6',
      'M5 11 H17',
      'M7 11 L5 18 M15 11 L18 15',
      'M5 5 A2 2 0 1 0 9 5 A2 2 0 1 0 5 5',
      'M7 1.8 V0.8 M7 9.2 V10.2 M2.8 5 H1.8 M12.2 5 H11.2 M4 2 L3.2 1.2 M10 8 L10.8 8.8 M10 2 L10.8 1.2 M4 8 L3.2 8.8'
    ]
  },
  windPlant: {
    paths: [
      'M12 9 L10 21 H14 L12 9',
      'M8 21 H16',
      'M12 9 L12 3',
      'M12 9 L17.5 12',
      'M12 9 L6.5 12',
      'M10.4 9 A1.6 1.6 0 1 0 13.6 9 A1.6 1.6 0 1 0 10.4 9',
      'M12 3 L13.2 5.2 M17.5 12 L15 12.1 M6.5 12 L9 12.1'
    ]
  },
  nuclearPlant: {
    paths: [
      'M8 20 C9 16 9.2 10 8.4 5 H15.6 C14.8 10 15 16 16 20 H8 Z',
      'M8.8 15 H15.2',
      'M9.1 10 H14.9',
      'M7 20 H17',
      'M6 8 C6.8 6.2 8.3 5.3 10.5 5',
      'M18 8 C17.2 6.2 15.7 5.3 13.5 5',
      'M9 5 C9 3 10 2 12 2 C14 2 15 3 15 5'
    ]
  },
  electrolyzer: {
    paths: [
      'M6 6 H15',
      'M6 9 H15',
      'M6 12 H15',
      'M6 15 H15',
      'M5 4 H16 V17 H5 Z',
      'M16 8 H20 V5',
      'M20 5 H22',
      'M16 14 H20 V18',
      'M20 18 H22',
      'M8 20 H13'
    ]
  },
  saltCavern: {
    paths: [
      'M3 6 H21',
      'M6 9 C5 11 5.5 14 7 15 C8 16 8 18 7.5 20',
      'M18 9 C19 11 18.5 14 17 15 C16 16 16 18 16.5 20',
      'M7 20 C9.5 22 14.5 22 16.5 20',
      'M7 9 C10 8 14 8 18 9',
      'M9 12 C10.5 11.5 13 11.5 15 12',
      'M9 16 C10.5 16.8 13 16.8 15 16'
    ]
  },
  pipeline: {
    paths: [
      'M3 8 H21',
      'M3 16 H21',
      'M6 8 V16',
      'M18 8 V16',
      'M9 12 H15',
      'M15 12 L13 10',
      'M15 12 L13 14'
    ]
  },
  pipeJunction: {
    paths: [
      'M12 3 L20 8 V16 L12 21 L4 16 V8 Z',
      'M12 8 L16 10.5 V13.5 L12 16 L8 13.5 V10.5 Z',
      'M12 3 V8',
      'M20 8 L16 10.5',
      'M20 16 L16 13.5',
      'M12 21 V16',
      'M4 16 L8 13.5',
      'M4 8 L8 10.5'
    ]
  },
  steelPlant: {
    paths: [
      'M4 20 H21',
      'M5 20 V12 L9 14 V11 L13 14 V10 L17 13 V20',
      'M7 20 V8 H10 V20',
      'M18 20 V7 H20 V20',
      'M11 18 H15',
      'M6 9 H11',
      'M18 9 H21'
    ]
  },
  ammoniaPlant: {
    paths: [
      'M8 5 H16',
      'M9 5 V18',
      'M15 5 V18',
      'M8 18 H16',
      'M8 8 H16',
      'M8 12 H16',
      'M8 16 H16',
      'M5 20 H19',
      'M16 9 H20 V6',
      'M16 14 H20 V17'
    ]
  },
  chemicalPlant: {
    paths: [
      'M8 20 V7 H14 V20',
      'M7 7 H15',
      'M9 10 H13',
      'M9 14 H13',
      'M9 18 H13',
      'M15 20 V12 L19 15 V20',
      'M4 20 V15 L8 12',
      'M5 6 C6.5 4.5 9.5 4.5 11 6'
    ]
  },
  efuelRefinery: {
    paths: [
      'M5 20 V8 H11 V20',
      'M4 8 H12',
      'M6 11 H10',
      'M6 15 H10',
      'M14 20 V10 H20 V20',
      'M14 12 H20',
      'M14 16 H20',
      'M11 14 H14',
      'M20 11 C22 12 22 15 20 16'
    ]
  },
  fuelCellStation: {
    paths: [
      'M6 7 H16 V17 H6 Z',
      'M8 9 H14',
      'M8 12 H14',
      'M8 15 H14',
      'M16 10 H20 V15',
      'M20 15 L18.5 17',
      'M5 20 H17',
      'M10 5 V3',
      'M12 5 V3'
    ]
  },
  exportTerminal: {
    paths: [
      'M3 18 H21',
      'M5 15 H18 L21 18',
      'M7 15 V11 H14 V15',
      'M9 11 V8 H17',
      'M17 8 V15',
      'M4 20 C6 21 8 21 10 20 C12 21 14 21 16 20 C18 21 20 21 22 20',
      'M6 12 L11 8',
      'M11 8 L14 11'
    ]
  },
  pressureGauge: {
    paths: [
      'M5 16 A7 7 0 1 1 19 16',
      'M12 16 L16 10',
      'M10.6 16 A1.4 1.4 0 1 0 13.4 16 A1.4 1.4 0 1 0 10.6 16',
      'M7 16 H5',
      'M19 16 H17',
      'M12 9 V7',
      'M8 11 L6.6 9.6',
      'M16 11 L17.4 9.6'
    ]
  },
  pause: {
    paths: ['M8 5 V19', 'M16 5 V19']
  },
  play: {
    paths: ['M8 5 L18 12 L8 19 Z']
  },
  fastForward: {
    paths: ['M5 6 L12 12 L5 18 Z', 'M12 6 L19 12 L12 18 Z']
  },
  save: {
    paths: [
      'M5 4 H17 L20 7 V20 H5 Z',
      'M8 4 V10 H16 V4',
      'M8 20 V15 H17 V20',
      'M10 7 H14'
    ]
  },
  load: {
    paths: [
      'M4 7 H10 L12 9 H20 V19 H4 Z',
      'M8 14 H16',
      'M11 11 L8 14 L11 17'
    ]
  },
  alert: {
    paths: [
      'M12 4 L21 20 H3 Z',
      'M12 9 V14',
      'M12 17 V17.5'
    ]
  },
  check: {
    paths: ['M5 12.5 L10 17 L19 7']
  },
  clock: {
    paths: [
      'M5 12 A7 7 0 1 0 19 12 A7 7 0 1 0 5 12',
      'M12 8 V12 L15 14'
    ]
  },
  soundOn: {
    paths: [
      'M4 10 H8 L13 6 V18 L8 14 H4 Z',
      'M16 9 C17.5 10.5 17.5 13.5 16 15',
      'M18 6 C21 9.5 21 14.5 18 18'
    ]
  },
  soundOff: {
    paths: [
      'M4 10 H8 L13 6 V18 L8 14 H4 Z',
      'M16 10 L21 15',
      'M21 10 L16 15'
    ]
  }
};

function drawPath(ctx: CanvasRenderingContext2D, d: string): void {
  ctx.stroke(new Path2D(d));
}

function drawIconAtOrigin(ctx: CanvasRenderingContext2D, icon: IconName): void {
  const definition = ICONS[icon];
  ctx.lineWidth = GRID.STROKE.REGULAR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of definition.paths) drawPath(ctx, d);
  for (const d of definition.fills ?? []) ctx.fill(new Path2D(d));
}

export function drawIconSolarPlant(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'solarPlant'); }
export function drawIconWindPlant(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'windPlant'); }
export function drawIconNuclearPlant(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'nuclearPlant'); }
export function drawIconElectrolyzer(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'electrolyzer'); }
export function drawIconSaltCavern(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'saltCavern'); }
export function drawIconPipeline(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'pipeline'); }
export function drawIconPipeJunction(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'pipeJunction'); }
export function drawIconSteelPlant(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'steelPlant'); }
export function drawIconAmmoniaPlant(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'ammoniaPlant'); }
export function drawIconChemicalPlant(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'chemicalPlant'); }
export function drawIconEfuelRefinery(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'efuelRefinery'); }
export function drawIconFuelCellStation(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'fuelCellStation'); }
export function drawIconExportTerminal(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'exportTerminal'); }
export function drawIconPressureGauge(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'pressureGauge'); }
export function drawIconPause(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'pause'); }
export function drawIconPlay(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'play'); }
export function drawIconFastForward(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'fastForward'); }
export function drawIconSave(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'save'); }
export function drawIconLoad(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'load'); }
export function drawIconAlert(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'alert'); }
export function drawIconCheck(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'check'); }
export function drawIconClock(ctx: CanvasRenderingContext2D): void { drawIconAtOrigin(ctx, 'clock'); }

export function drawIcon(ctx: CanvasRenderingContext2D, icon: IconName, cx: number, cy: number, size = 24, color: string = COLOR.AMBER_BASE): void {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  drawIconAtOrigin(ctx, icon);
  ctx.restore();
}

export function iconSvg(icon: IconName, className = 'bb-icon', title?: string): string {
  const definition = ICONS[icon];
  const titleNode = title ? `<title>${title}</title>` : '';
  const paths = definition.paths
    .map(d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${GRID.STROKE.REGULAR}" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  const fills = (definition.fills ?? [])
    .map(d => `<path d="${d}" fill="currentColor"/>`)
    .join('');
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="${title ? 'false' : 'true'}" focusable="false">${titleNode}${paths}${fills}</svg>`;
}

export function setDomIcon(el: Element, icon: IconName, title?: string): void {
  el.setAttribute('data-icon', icon);
  el.innerHTML = iconSvg(icon, 'bb-icon', title);
}

export function hydrateDomIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => {
    const icon = el.dataset.icon as IconName | undefined;
    if (!icon || !(icon in ICONS)) return;
    el.innerHTML = iconSvg(icon, 'bb-icon', el.title || undefined);
  });
}
