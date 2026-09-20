# 🚴 WindRider GPX

PWA (Progressive Web App) pour cyclistes : importez un parcours **GPX**, indiquez votre **heure de départ** et votre **vitesse moyenne**, et visualisez sur une carte **OpenStreetMap/Leaflet** l'impact du vent segment par segment, avec le bulletin météo complet (Open-Meteo) pour chaque tronçon.

- 🟢 Vert = vent de dos · 🟠 Orange = vent de côté · 🔴 Rouge = vent de face
- Date **et** heure de départ personnalisables (jusqu'à ~15 jours à l'avance)
- 100% gratuit, sans clé API (Open-Meteo + fonds de carte OSM)
- Fonctionne hors-ligne une fois chargée (Service Worker / Workbox)
- Installable sur mobile et desktop (manifeste PWA)

## Stack technique

| Domaine        | Choix                                                   |
|-----------------|---------------------------------------------------------|
| Langage         | TypeScript strict                                       |
| Bundler         | Vite 5                                                   |
| Carte           | Leaflet + tuiles OpenStreetMap                           |
| PWA / offline   | `vite-plugin-pwa` (Workbox, génération auto du Service Worker) |
| Météo           | [Open-Meteo](https://open-meteo.com/) (API REST gratuite, sans clé) |
| Hébergement     | GitHub (code source) + Vercel (déploiement)              |

## Fonctionnement

1. **Parsing GPX** (`src/gpx.ts`) : lecture des `<trkpt>` (ou `<rtept>`) du fichier, calcul de la distance cumulée (formule de haversine, `src/geo.ts`).
2. **Découpage** : le tracé est segmenté automatiquement en tronçons de ~1 à 2 km (`splitIntoSegments`), en conservant tous les points GPX intermédiaires pour un rendu fidèle sur la carte.
3. **Calcul temporel** : pour chaque segment, l'heure de passage est déduite de `date + heure de départ + (distance cumulée / vitesse moyenne)`.
4. **Météo** (`src/weather.ts`) : appel à `https://api.open-meteo.com/v1/forecast` avec les coordonnées du point médian du segment et la **date choisie par l'utilisateur** ; sélection de la prévision horaire la plus proche de l'heure de passage calculée.
5. **Impact du vent** (`src/wind.ts`) : comparaison vectorielle entre le cap de déplacement du segment (bearing) et la direction d'où vient le vent (`wind_direction_10m`, convention météo) pour classer chaque segment en **face / côté / dos**.
6. **Affichage** (`src/main.ts`) : chaque segment est dessiné en `L.polyline` colorée ; un clic ouvre le panneau latéral avec le bulletin complet (heure, vent, rafales, pluie, température ressentie, humidité, UV).

> ⚠️ Open-Meteo fournit des prévisions horaires pour aujourd'hui et les ~16 prochains jours. L'app utilise toujours la **date du jour** combinée à l'heure de départ saisie.

## Prérequis

- [Node.js](https://nodejs.org/) ≥ 18
- npm (fourni avec Node.js)

## Installation et lancement en local

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer le serveur de développement
npm run dev
```

Ouvrez ensuite l'URL affichée (typiquement `http://localhost:5173`), chargez un fichier `.gpx` (un exemple est fourni dans `samples/exemple-parcours.gpx`), renseignez l'heure de départ et la vitesse, puis cliquez sur **"Analyser le parcours"**.

```bash
# Build de production (génère dist/ avec le Service Worker Workbox)
npm run build

# Prévisualiser le build de production en local
npm run preview
```

## 📦 Déploiement sur GitHub

```bash
git init
git add .
git commit -m "Initial commit - WindRider GPX"
git branch -M main
git remote add origin https://github.com/<votre-utilisateur>/windrider-gpx.git
git push -u origin main
```

> Remplacez `<votre-utilisateur>` par votre nom d'utilisateur GitHub, et créez au préalable un dépôt vide (sans README) nommé `windrider-gpx` sur github.com.

## 🚀 Déploiement sur Vercel

**Option A — Interface web (recommandé) :**

1. Rendez-vous sur [vercel.com](https://vercel.com) et connectez-vous avec votre compte GitHub.
2. Cliquez sur **"Add New… → Project"**, puis sélectionnez le dépôt `windrider-gpx`.
3. Vercel détecte automatiquement le framework **Vite** grâce au `vercel.json` fourni :
   - Build Command : `npm run build`
   - Output Directory : `dist`
4. Cliquez sur **"Deploy"**. Après quelques secondes, votre PWA est en ligne sur une URL `https://windrider-gpx-xxxx.vercel.app`.
5. Chaque `git push` sur `main` déclenche automatiquement un nouveau déploiement.

**Option B — CLI Vercel :**

```bash
npm install -g vercel
vercel login
vercel        # déploiement de preview
vercel --prod # déploiement en production
```

## Installer l'app (PWA)

Une fois déployée (HTTPS requis, ce que Vercel fournit automatiquement) :

- **Mobile (Android/Chrome)** : menu ⋮ → "Ajouter à l'écran d'accueil".
- **iOS/Safari** : bouton Partager → "Sur l'écran d'accueil".
- **Desktop (Chrome/Edge)** : icône d'installation dans la barre d'adresse.

Le Service Worker met en cache l'application (shell HTML/CSS/JS), les tuiles OpenStreetMap déjà consultées, et les dernières réponses météo (1h), permettant de consulter un parcours déjà analysé même sans connexion.

## Structure du projet

```
windrider-gpx/
├── index.html                # Page + formulaire + conteneurs carte/sidebar
├── vite.config.ts            # Config Vite + vite-plugin-pwa (manifeste, Workbox)
├── vercel.json                # Config de déploiement Vercel
├── package.json
├── tsconfig.json
├── public/
│   └── icons/                 # Icônes PWA (192px, 512px)
├── samples/
│   └── exemple-parcours.gpx   # Fichier GPX de test
└── src/
    ├── main.ts                # Orchestration : carte, formulaire, logique principale
    ├── geo.ts                 # Distance (haversine) et cap (bearing)
    ├── gpx.ts                 # Parsing GPX + découpage en segments 1-2 km
    ├── weather.ts              # Client API Open-Meteo (avec cache mémoire)
    ├── wind.ts                 # Calcul vectoriel face/côté/dos + couleurs/libellés
    ├── style.css
    └── vite-env.d.ts
```

## Limites connues / pistes d'amélioration

- Les appels météo sont faits segment par segment (avec cache par coordonnées arrondies + date) ; pour un très long parcours, cela peut représenter de nombreuses requêtes. Une pause de 200 ms est insérée tous les 10 segments pour rester raisonnable vis-à-vis de l'API gratuite Open-Meteo.
- Le champ date est borné à la fenêtre de prévision d'Open-Meteo (aujourd'hui → +15 jours environ) ; une date trop lointaine renverra une erreur de l'API.
- Le vent est évalué au point médian de chaque segment (~1-2 km) : suffisant pour du vent météo à cette échelle, mais on pourrait affiner en interpolant entre le vent en début et fin de segment.

## Licence

Libre d'utilisation pour votre usage personnel/associatif. Cartographie © contributeurs OpenStreetMap. Données météo © Open-Meteo.com.
