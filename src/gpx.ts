/**
 * Parsing d'un fichier GPX et découpage du tracé en segments de 1 à 2 km.
 */
import { type LatLon, haversineDistance, bearing } from './geo';

export interface TrackPoint extends LatLon {
  ele?: number;
  /** Distance cumulée depuis le premier point du tracé, en kilomètres. */
  cumDist: number;
}

export interface Segment {
  index: number;
  /** Points GPX composant ce segment (au moins 2). */
  points: TrackPoint[];
  /** Distance cumulée au début du segment (km depuis le départ). */
  startDist: number;
  /** Distance cumulée à la fin du segment (km depuis le départ). */
  endDist: number;
  /** Longueur du segment (km). */
  length: number;
  /** Cap moyen de déplacement sur le segment (degrés, 0-360). */
  bearing: number;
  /** Point représentatif du segment, utilisé pour la requête météo. */
  midpoint: LatLon;
}

/** Parse le contenu XML d'un fichier .gpx et retourne la liste des points de trace. */
export function parseGpx(xmlText: string): TrackPoint[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  if (doc.querySelector('parsererror')) {
    throw new Error("Le fichier GPX n'a pas pu être analysé (XML invalide).");
  }

  let nodes = Array.from(doc.getElementsByTagName('trkpt'));
  if (nodes.length === 0) {
    // Certains GPX exportent un itinéraire (route) plutôt qu'une trace (track)
    nodes = Array.from(doc.getElementsByTagName('rtept'));
  }
  if (nodes.length === 0) {
    throw new Error('Aucun point de trace (trkpt/rtept) trouvé dans ce fichier GPX.');
  }

  return buildTrackPoints(nodes);
}

function buildTrackPoints(nodes: Element[]): TrackPoint[] {
  const points: TrackPoint[] = [];
  let cumDist = 0;
  let prev: LatLon | null = null;

  for (const node of nodes) {
    const lat = parseFloat(node.getAttribute('lat') ?? '');
    const lon = parseFloat(node.getAttribute('lon') ?? '');
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const eleNode = node.getElementsByTagName('ele')[0];
    const ele = eleNode ? parseFloat(eleNode.textContent ?? '') : undefined;

    if (prev) {
      cumDist += haversineDistance(prev, { lat, lon });
    }

    points.push({ lat, lon, ele: Number.isNaN(ele!) ? undefined : ele, cumDist });
    prev = { lat, lon };
  }

  return points;
}

/**
 * Découpe la trace en segments d'environ `targetKm` kilomètres (1 à 2 km).
 * Chaque segment conserve les points GPX intermédiaires (pour un tracé fidèle sur la carte).
 */
export function splitIntoSegments(points: TrackPoint[], targetKm = 1.5): Segment[] {
  if (points.length < 2) return [];

  const segments: Segment[] = [];
  let segStartIdx = 0;

  for (let i = 1; i < points.length; i++) {
    const distFromSegStart = points[i].cumDist - points[segStartIdx].cumDist;
    const isLastPoint = i === points.length - 1;

    if (distFromSegStart >= targetKm || isLastPoint) {
      const segPoints = points.slice(segStartIdx, i + 1);
      if (segPoints.length >= 2) {
        const start = segPoints[0];
        const end = segPoints[segPoints.length - 1];
        const midIdx = Math.floor(segPoints.length / 2);

        segments.push({
          index: segments.length,
          points: segPoints,
          startDist: start.cumDist,
          endDist: end.cumDist,
          length: end.cumDist - start.cumDist,
          bearing: bearing(start, end),
          midpoint: { lat: segPoints[midIdx].lat, lon: segPoints[midIdx].lon }
        });
      }
      segStartIdx = i;
    }
  }

  return segments;
}
