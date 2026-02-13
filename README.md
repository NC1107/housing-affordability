# Housing Affordability Tool

Find affordable homes nationwide based on your income and commute preferences. Search by income to see affordability nationwide, or enter a work address to explore housing options within your commute zone.

**Live Demo:** [https://nc1107.github.io/housing-affordability/](https://nc1107.github.io/housing-affordability/)

## Features

### 🏠 Income-Based Search
- Search affordable housing nationwide based on your income
- Drill down by state to see detailed ZIP-level data
- Interactive affordability tiers (affordable, stretch, unaffordable)
- Comprehensive affordability calculator with down payment, interest rate, DTI ratios

### 🚗 Commute-Based Search
- Draw isochrone maps showing areas reachable within X minutes
- Support for driving and public transit modes
- Adjustable travel time (5–60 minutes)
- See housing prices within your commute zone

### 📊 Housing Data
- **7.5MB bundled static data** - no database required
- Median home values by ZIP (Zillow ZHVI)
- Median market rent by ZIP (Zillow ZORI)
- ZIP code boundaries for all 50 states
- Updated monthly from Zillow data

### 📱 Mobile-Friendly
- Responsive design with collapsible sidebar
- Optimized for phone and tablet access
- Works offline (except address search)

## Quick Start

1. **Get a free Geoapify API key** (optional - only needed for address search):
   - Visit: https://myprojects.geoapify.com/register
   - Income-based search works 100% without an API key

2. **Set up your API key** (optional):
   ```bash
   cp .env.example .env
   # Paste your key into .env
   ```

3. **Install and run:**
   ```bash
   npm install
   npm run dev
   ```

4. **Open:** http://localhost:5173

## Tech Stack

- **Frontend:** React 18 + Vite 6 + TypeScript 5
- **Styling:** Tailwind CSS 4
- **Maps:** Leaflet 1.9 + React Leaflet 4
- **Geospatial:** Turf.js for polygon operations
- **APIs:** Geoapify (geocoding, isochrones), Census Bureau (ZIP boundaries)

## Data Sources

| Source | Data | Updated |
|--------|------|---------|
| Zillow ZHVI | Median home values by ZIP | Monthly |
| Zillow ZORI | Median market rent by ZIP | Monthly |
| Census Gazetteer | ZIP code centroids (lat/lon) | Decennial |
| Census TIGER/Line | ZIP (ZCTA) boundaries GeoJSON | Annual |

## Updating Housing Data

To refresh housing data with the latest Zillow numbers:

```bash
npm run fetch-data
```

This downloads:
- Latest Zillow ZHVI (home values) CSV
- Latest Zillow ZORI (rents) CSV
- Census ZIP code centroids
- Processes into optimized JSON bundles in `public/data/`

## Deployment

This app is configured for GitHub Pages deployment at a subdirectory path.

**Current setup:** Deploys to `https://nc1107.github.io/housing-affordability/`

The `vite.config.ts` uses conditional base paths:
- **Development:** `base: '/'` (runs at localhost:5173)
- **Production:** `base: '/housing-affordability/'` (GitHub Pages subdirectory)

To deploy to your own GitHub Pages:

1. Create a new repository (e.g., `housing-affordability`)
2. Update `base` in `vite.config.ts` if using different subdirectory
3. Set up GitHub Actions workflow (see `.github/workflows/deploy.yml`)
4. Push to trigger automatic deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## API Credits

**Geoapify free tier:** 3,000 credits/day

Each isochrone request costs approximately `minutes / 5` credits:
- 15 min = ~3 credits
- 30 min = ~6 credits
- 60 min = ~12 credits

Income-based search uses **zero API credits** - only address search requires the API.

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Type check
npm run build

# Preview production build
npm run build && npx vite preview
```

## License

MIT

## Credits

Built with data from:
- [Zillow Research](https://www.zillow.com/research/data/) (ZHVI/ZORI)
- [US Census Bureau](https://www.census.gov/geographies/mapping-files.html) (ZIP boundaries)
- [Geoapify](https://www.geoapify.com/) (geocoding & isochrones)
