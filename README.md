# Commute Map

Find homes within your commute zone. Enter a work address, and the map highlights everywhere reachable within your chosen travel time. Housing prices and rent data are shown for ZIP codes in the area.

## Quick Start

1. **Get a free Geoapify API key** (no credit card required):
   https://myprojects.geoapify.com/register

2. **Set up your API key:**
   ```
   cp .env.example .env
   ```
   Then paste your key into `.env`.

3. **Install and run:**
   ```
   npm install
   npm run dev
   ```

## Housing Data

Housing data comes from Zillow (ZHVI home values + ZORI rents) and is bundled as static JSON. To refresh it:

```
npm run fetch-data
```

This downloads the latest Zillow CSVs and Census ZIP code centroids (~33k ZCTAs) into `public/data/`.

### Data Sources

| Source | Data | Updated |
|--------|------|---------|
| Zillow ZHVI | Median home values by ZIP | Monthly |
| Zillow ZORI | Median market rent by ZIP | Monthly |
| Census Gazetteer | ZIP code centroids (lat/lon) | Decennial |

## Features

- Isochrone map (areas reachable within X minutes)
- Driving and public transit modes
- Adjustable travel time (5–60 min)
- Median home value and rent for the commute zone
- Sortable ZIP code breakdown table

## API Credits

Geoapify free tier: 3,000 credits/day. Each isochrone costs approximately `minutes / 5` credits. At 30 min, that's ~6 credits per request.

## Tech Stack

React + Vite + TypeScript, Tailwind CSS, Leaflet, Turf.js, Geoapify API.
