import './style.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Correction des icônes de marqueur par défaut de Leaflet avec les bundlers modernes.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import { parseGpx, splitIntoSegments, type Segment } from './gpx';
import { getHourlyWeather, findClosestHour, type WeatherPoint } from './weather';
import { computeWindImpact, WIND_COLORS, WIND_LABELS, type WindImpact } from './wind';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

// --- Références DOM ---------------------------------------------------

const form = document.getElementById('ride-form') as HTMLFormElement;
const fileInput = document.getElementById('gpx-file') as HTMLInputElement;
const startTimeInput = document.getElementById('start-time') as HTMLInputElement;
const speedInput = document.getElementById('avg-speed') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const infoPanel = document.getElementById('info-panel') as HTMLDivElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;

// --- Carte Leaflet -------------------------------------------------------

const map = L.map('map').setView([46.6, 2.4], 6); // vue par défaut : France

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

let currentLayers: L.Layer[] = [];

function clearLayers(): void {
  currentLayers.forEach((layer) => map.removeLayer(layer));
  currentLayers = [];
}

// --- État / UI -------------------------------------------------------------

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatTooltip(
  passageTime: Date,
  weather: WeatherPoint | undefined,
  impact: WindImpact
): string {
  const t = formatTime(passageTime);
  if (!weather) return `${t} — météo indisponible`;
  return `${t} — ${WIND_LABELS[impact]} · ${Math.round(weather.windSpeed)} km/h`;
}

function showSegmentInfo(
  segment: Segment,
  passageTime: Date,
  weather: WeatherPoint | undefined,
  impact: WindImpact
): void {
  const t = formatTime(passageTime);

  if (!weather) {
    infoPanel.innerHTML = `
      <h3>Segment ${segment.index + 1}</h3>
      <p>Passage à ${t} — météo indisponible pour ce point.</p>
    `;
    return;
  }

  infoPanel.innerHTML = `
    <h3>
      Segment ${segment.index + 1}
      <span class="badge" style="background:${WIND_COLORS[impact]}">${WIND_LABELS[impact]}</span>
    </h3>
    <table class="weather-table">
      <tbody>
        <tr><td>Distance parcourue</td><td>${segment.startDist.toFixed(1)} km</td></tr>
        <tr><td>Heure de passage</td><td>${t}</td></tr>
        <tr><td>Température</td><td>${weather.temperature.toFixed(1)}°C (ressenti ${weather.apparentTemperature.toFixed(1)}°C)</td></tr>
        <tr><td>Vent</td><td>${Math.round(weather.windSpeed)} km/h — ${Math.round(weather.windDirection)}°</td></tr>
        <tr><td>Rafales</td><td>${Math.round(weather.windGusts)} km/h</td></tr>
        <tr><td>Risque de pluie</td><td>${Math.round(weather.precipitationProbability)}% (${weather.precipitation.toFixed(1)} mm)</td></tr>
        <tr><td>Humidité</td><td>${Math.round(weather.humidity)}%</td></tr>
        <tr><td>Indice UV</td><td>${weather.uvIndex.toFixed(1)}</td></tr>
      </tbody>
    </table>
  `;
}

// --- Traitement principal ---------------------------------------------------

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = fileInput.files?.[0];
  if (!file) {
    setStatus('Veuillez sélectionner un fichier GPX.', true);
    return;
  }

  const startTime = startTimeInput.value; // format "HH:MM"
  const speed = parseFloat(speedInput.value);
  if (!startTime || !speed || speed <= 0) {
    setStatus('Veuillez renseigner une heure de départ et une vitesse valides.', true);
    return;
  }

  submitBtn.disabled = true;
  clearLayers();
  infoPanel.innerHTML = '';
  setStatus('Lecture du fichier GPX...');

  try {
    const xmlText = await file.text();
    const points = parseGpx(xmlText);
    if (points.length < 2) {
      throw new Error('Le tracé GPX ne contient pas assez de points exploitables.');
    }

    const segments = splitIntoSegments(points, 1.5); // segments cibles ~1.5 km (1-2 km)
    setStatus(`Tracé découpé en ${segments.length} segments. Récupération de la météo...`);

    // Date/heure de départ : aujourd'hui à l'heure indiquée (Open-Meteo fournit
    // les prévisions horaires pour le jour même et les ~16 prochains jours).
    const [hours, minutes] = startTime.split(':').map(Number);
    const departure = new Date();
    departure.setHours(hours, minutes, 0, 0);
    const dateISO = departure.toISOString().slice(0, 10);

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30] });

    let done = 0;
    for (const segment of segments) {
      const hoursElapsed = segment.startDist / speed;
      const passageTime = new Date(departure.getTime() + hoursElapsed * 3600 * 1000);

      let weather: WeatherPoint | undefined;
      try {
        const hourly = await getHourlyWeather(
          segment.midpoint.lat,
          segment.midpoint.lon,
          dateISO
        );
        weather = findClosestHour(hourly, passageTime);
      } catch (err) {
        console.error(`Erreur météo pour le segment ${segment.index}`, err);
      }

      const impact: WindImpact = weather
        ? computeWindImpact(segment.bearing, weather.windDirection)
        : 'crosswind';
      const color = weather ? WIND_COLORS[impact] : '#9aa0a6';

      const latlngs = segment.points.map((p) => [p.lat, p.lon] as [number, number]);
      const polyline = L.polyline(latlngs, { color, weight: 5, opacity: 0.9 });
      polyline.addTo(map);
      currentLayers.push(polyline);

      polyline.bindTooltip(formatTooltip(passageTime, weather, impact), { sticky: true });
      polyline.on('click', () => showSegmentInfo(segment, passageTime, weather, impact));
      polyline.on('mouseover', () => polyline.setStyle({ weight: 8 }));
      polyline.on('mouseout', () => polyline.setStyle({ weight: 5 }));

      done++;
      setStatus(`Météo récupérée pour ${done}/${segments.length} segments...`);

      // Petite pause régulière pour rester poli avec l'API gratuite Open-Meteo.
      if (done % 10 === 0) await sleep(200);
    }

    setStatus(`Terminé : ${segments.length} segments affichés. Cliquez sur le tracé pour le détail météo.`);
    if (segments.length > 0) {
      const first = segments[0];
      const firstWeather = await getHourlyWeather(
        first.midpoint.lat,
        first.midpoint.lon,
        dateISO
      ).then((h) => findClosestHour(h, departure));
      const firstImpact = firstWeather
        ? computeWindImpact(first.bearing, firstWeather.windDirection)
        : 'crosswind';
      showSegmentInfo(first, departure, firstWeather, firstImpact);
    }
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
    setStatus(message, true);
  } finally {
    submitBtn.disabled = false;
  }
});
