/**
 * Client pour l'API Open-Meteo (https://open-meteo.com/) - gratuite, sans clé API.
 */

export interface WeatherPoint {
  time: string; // ISO local (selon timezone=auto)
  temperature: number; // °C
  apparentTemperature: number; // °C ressenti
  humidity: number; // %
  precipitationProbability: number; // %
  precipitation: number; // mm
  windSpeed: number; // km/h
  /** Direction D'OÙ vient le vent, convention météo (0° = vent venant du Nord). */
  windDirection: number;
  windGusts: number; // km/h
  uvIndex: number;
}

interface OpenMeteoResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    relative_humidity_2m: number[];
    precipitation_probability: number[];
    precipitation: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
    uv_index: number[];
  };
}

const HOURLY_PARAMS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation_probability',
  'precipitation',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'uv_index'
].join(',');

// Cache mémoire : évite de refaire un appel réseau pour des points proches/heure identique.
const weatherCache = new Map<string, Promise<WeatherPoint[]>>();

function cacheKey(lat: number, lon: number, dateISO: string): string {
  // On arrondit les coordonnées à ~1km pour mutualiser les appels de segments proches.
  return `${lat.toFixed(2)},${lon.toFixed(2)},${dateISO}`;
}

/** Récupère les prévisions horaires Open-Meteo pour une position et une date données. */
export async function getHourlyWeather(
  lat: number,
  lon: number,
  dateISO: string
): Promise<WeatherPoint[]> {
  const key = cacheKey(lat, lon, dateISO);

  if (!weatherCache.has(key)) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lon.toFixed(4));
    url.searchParams.set('hourly', HOURLY_PARAMS);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', dateISO);
    url.searchParams.set('end_date', dateISO);

    const promise = fetch(url.toString())
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Erreur API météo Open-Meteo (HTTP ${res.status})`);
        }
        return res.json() as Promise<OpenMeteoResponse>;
      })
      .then((data) => {
        const h = data.hourly;
        const points: WeatherPoint[] = h.time.map((t, i) => ({
          time: t,
          temperature: h.temperature_2m[i],
          apparentTemperature: h.apparent_temperature[i],
          humidity: h.relative_humidity_2m[i],
          precipitationProbability: h.precipitation_probability[i],
          precipitation: h.precipitation[i],
          windSpeed: h.wind_speed_10m[i],
          windDirection: h.wind_direction_10m[i],
          windGusts: h.wind_gusts_10m[i],
          uvIndex: h.uv_index[i]
        }));
        return points;
      });

    weatherCache.set(key, promise);
  }

  return weatherCache.get(key)!;
}

/** Trouve, dans une liste de prévisions horaires, celle la plus proche d'un instant donné. */
export function findClosestHour(
  points: WeatherPoint[],
  target: Date
): WeatherPoint | undefined {
  let closest: WeatherPoint | undefined;
  let minDiffMs = Infinity;

  for (const p of points) {
    const diff = Math.abs(new Date(p.time).getTime() - target.getTime());
    if (diff < minDiffMs) {
      minDiffMs = diff;
      closest = p;
    }
  }

  return closest;
}
