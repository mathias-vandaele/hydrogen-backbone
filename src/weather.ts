import { REGIONS } from './config';
import { state } from './state';

export function updateWeather(): void {
  const s = state;
  const t = s.timeOfDay; // 0-1
  const doy = s.dayOfYear; // 1-365

  // Seasonal multipliers
  const seasonalSolar = 0.45 + 0.55 * Math.max(0, Math.sin((doy - 80) * 2 * Math.PI / 365));
  const seasonalWind = 0.65 + 0.35 * Math.max(0, Math.sin((doy - 350) * 2 * Math.PI / 365 + Math.PI));

  // Time-of-day solar curve (bell curve centered at noon = 0.5)
  const solarCurve = Math.max(0, Math.sin(t * Math.PI));

  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    const noise = 0.85 + Math.random() * 0.3;
    rs.solarFactor = rc.solarBase * seasonalSolar * solarCurve * noise;
    rs.windFactor = rc.windBase * seasonalWind * (0.4 + Math.random() * 0.6);
  }
}

export function getSeason(doy: number): 'Winter' | 'Spring' | 'Summer' | 'Autumn' {
  if (doy < 80 || doy >= 355) return 'Winter';
  if (doy < 172) return 'Spring';
  if (doy < 264) return 'Summer';
  return 'Autumn';
}
