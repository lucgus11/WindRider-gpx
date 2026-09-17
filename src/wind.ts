/**
 * Calcul vectoriel de l'impact du vent sur un segment du parcours.
 *
 * Open-Meteo fournit `wind_direction_10m` : la direction D'OÙ VIENT le vent
 * (convention météorologique, 0° = vent venant du Nord).
 *
 * On compare cette direction au cap de déplacement du cycliste (`travelBearing`) :
 * - Si le vent vient de la direction vers laquelle on roule  -> vent de face (headwind)
 * - Si le vent vient de la direction opposée (dans notre dos) -> vent de dos (tailwind)
 * - Entre les deux                                            -> vent de côté (crosswind)
 */

export type WindImpact = 'tailwind' | 'crosswind' | 'headwind';

/**
 * @param travelBearing Cap de déplacement du cycliste sur le segment (0-360°).
 * @param windDirectionFrom Direction d'où vient le vent, convention météo (0-360°).
 */
export function computeWindImpact(
  travelBearing: number,
  windDirectionFrom: number
): WindImpact {
  let diff = Math.abs(travelBearing - windDirectionFrom) % 360;
  if (diff > 180) diff = 360 - diff;

  if (diff <= 45) return 'headwind'; // le vent souffle depuis l'avant -> de face
  if (diff >= 135) return 'tailwind'; // le vent souffle depuis l'arrière -> de dos
  return 'crosswind';
}

export const WIND_COLORS: Record<WindImpact, string> = {
  headwind: '#e63946', // rouge
  crosswind: '#f4a300', // orange
  tailwind: '#2a9d3d' // vert
};

export const WIND_LABELS: Record<WindImpact, string> = {
  headwind: 'Vent de face',
  crosswind: 'Vent de côté',
  tailwind: 'Vent de dos'
};
