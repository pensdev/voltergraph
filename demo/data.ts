import type { ChartData } from '../src/index.js';

/**
 * A season of rare furni trading. Values are in credits, the tradeable
 * currency — duckets buy catalogue furni and cannot be traded, which is why
 * the rare market is quoted in credits alone.
 */

export const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The Dragon Lamp collapse in June is the shape this chart exists to show:
 * a rare re-dropped in the catalogue floods the market and loses two thirds
 * of its trade value overnight, then claws back as stock is hoarded again.
 */
export const rareValues: ChartData = {
  labels: months,
  datasets: [
    { label: 'Throne', data: [210, 225, 240, 232, 255, 270, 262, 288, 305, 298, 320, 345] },
    { label: 'Dragon Lamp', data: [165, 172, 180, 178, 190, 120, 108, 115, 128, 140, 152, 165] },
    { label: 'HC Sofa', data: [88, 92, 95, 101, 104, 110, 108, 115, 122, 119, 128, 134] },
  ],
};

/** Trades cleared in the trading lounges this season. */
export const tradeVolume: ChartData = {
  labels: ['Throne', 'Dragon', 'Sofa', 'Decks', 'Duck', 'Petals'],
  datasets: [{ label: 'Trades', data: [1240, 980, 1520, 640, 410, 320] }],
};

/** Where a Habbo's credits actually go. */
export const creditSpend: ChartData = {
  labels: ['Rares', 'Catalogue', 'Habbo Club', 'Room decor', 'Badges'],
  datasets: [{ label: 'Credits', data: [42, 23, 15, 12, 8] }],
};

/** Week-on-week movement in trade value, in credits. */
export const weeklyChange: ChartData = {
  labels: ['Throne', 'Dragon', 'Sofa', 'Decks', 'Duck', 'Petals'],
  datasets: [{ label: 'Change', data: [18, -42, 7, -12, 25, -8] }],
};

/** Habbos in the hotel, sampled every two hours. */
export const hotelPopulation: ChartData = {
  labels: ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22'],
  datasets: [{ label: 'Habbos', data: [120, 80, 55, 40, 65, 140, 260, 420, 610, 780, 690, 380] }],
};

/** Randomizes the rare market, preserving the June crash. */
export function reshuffleRares(): ChartData {
  const walk = (start: number, drift: number, crashAt = -1) => {
    let v = start;
    return months.map((_, i) => {
      v = Math.max(20, v + (Math.random() - 0.35) * drift);
      if (i === crashAt) v *= 0.6;
      return Math.round(v);
    });
  };
  return {
    labels: months,
    datasets: [
      { label: 'Throne', data: walk(210, 40) },
      { label: 'Dragon Lamp', data: walk(165, 32, 5) },
      { label: 'HC Sofa', data: walk(88, 20) },
    ],
  };
}
