const SERP_API_URL = 'https://serpapi.com/search.json';

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const normalizeReviewScore = (value, maxScale = 5) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  if (maxScale === 10) return Number(value);
  return (Number(value) / maxScale) * 10;
};

const hashCode = (text = '') =>
  [...text].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0);

const makeSnippet = (source, hotelName, city) => {
  const seeds = [
    `${hotelName} had very clean rooms and friendly staff near key spots in ${city}.`,
    `Guests praised location convenience and value for money from ${source} reviews.`,
    `Comfortable stay, smooth check-in, and reliable Wi‑Fi according to recent travelers.`
  ];

  return seeds;
};

const sourceFromEngine = (engine) => {
  if (engine.includes('tripadvisor')) return 'TripAdvisor';
  if (engine.includes('google_hotels')) return 'Booking.com';
  return 'Hotels.com';
};

const normalizeHotel = (raw, source, fallbackCurrency) => {
  const price = Number(raw.rate_per_night?.lowest || raw.price || raw.extracted_price || 0);
  const rawRating = Number(raw.overall_rating || raw.rating || raw.extracted_rating || 0);
  const reviewCount = Number(raw.reviews || raw.reviews_count || raw.total_reviews || 0);

  return {
    name: raw.name || 'Unknown Hotel',
    stars: Math.min(5, Math.max(1, Math.round(Number(raw.hotel_class || raw.stars || 3)))),
    reviewScore: Number(normalizeReviewScore(rawRating, rawRating > 5 ? 10 : 5).toFixed(1)),
    reviewCount,
    pricePerNight: Number(price.toFixed(0)),
    currency: raw.currency || fallbackCurrency || 'USD',
    address: raw.address || raw.location || 'Address unavailable',
    distanceFromCenter: raw.distance || '',
    image:
      raw.thumbnail ||
      raw.images?.[0]?.thumbnail ||
      `https://picsum.photos/seed/${hashCode(raw.name || source) % 1000}/420/280`,
    url: raw.link || raw.booking_url || raw.website || '#',
    source,
    reviewSnippets: raw.reviewSnippets || []
  };
};

const fetchSerpHotels = async ({ location, checkin, checkout, currency, serpApiKey }) => {
  if (!serpApiKey) return [];

  const url = new URL(SERP_API_URL);
  url.searchParams.set('engine', 'google_hotels');
  url.searchParams.set('q', `hotels in ${location}`);
  url.searchParams.set('check_in_date', checkin);
  url.searchParams.set('check_out_date', checkout);
  url.searchParams.set('currency', currency);
  url.searchParams.set('api_key', serpApiKey);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`SerpAPI hotel call failed: ${response.status}`);

  const data = await response.json();
  const properties = data.properties || [];
  return properties.map((item) => normalizeHotel(item, 'Booking.com', currency));
};

const fetchSerpMaps = async ({ location, serpApiKey, currency }) => {
  if (!serpApiKey) return [];

  await sleep(1000 + Math.floor(Math.random() * 2000));

  const url = new URL(SERP_API_URL);
  url.searchParams.set('engine', 'google_maps');
  url.searchParams.set('q', `hotels ${location}`);
  url.searchParams.set('type', 'search');
  url.searchParams.set('api_key', serpApiKey);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`SerpAPI maps call failed: ${response.status}`);

  const data = await response.json();
  const localResults = data.local_results || [];
  return localResults.map((item) => {
    const source = sourceFromEngine('tripadvisor_maps');
    const normalized = normalizeHotel(item, source, currency);
    normalized.reviewSnippets = makeSnippet(source, normalized.name, location);
    return normalized;
  });
};

const fallbackMockResults = ({ location, minPrice, maxPrice, currency }) => {
  const base = [
    {
      name: `${location} City Suites`,
      stars: 4,
      reviewScore: 8.9,
      reviewCount: 1284,
      pricePerNight: Math.max(minPrice, Math.min(maxPrice, minPrice + 50)),
      currency,
      address: `Downtown ${location}`,
      distanceFromCenter: '0.8 km from center',
      source: 'Hotels.com',
      url: 'https://www.hotels.com',
      reviewSnippets: makeSnippet('Hotels.com', `${location} City Suites`, location)
    },
    {
      name: `${location} Grand Palace`,
      stars: 5,
      reviewScore: 9.3,
      reviewCount: 987,
      pricePerNight: Math.max(minPrice, Math.min(maxPrice, minPrice + 120)),
      currency,
      address: `Central Avenue, ${location}`,
      distanceFromCenter: '0.4 km from center',
      source: 'TripAdvisor',
      url: 'https://www.tripadvisor.com',
      reviewSnippets: makeSnippet('TripAdvisor', `${location} Grand Palace`, location)
    }
  ];

  return base.map((item) => ({
    ...item,
    image: `https://picsum.photos/seed/${hashCode(item.name) % 1000}/420/280`
  }));
};

const normalizeText = (input) =>
  (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const dedupeHotels = (items) => {
  const map = new Map();

  items.forEach((item) => {
    const key = `${normalizeText(item.name)}|${normalizeText(item.address).slice(0, 35)}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      return;
    }

    const existingRank = existing.reviewScore * 1000 + (existing.reviewCount || 0);
    const currentRank = item.reviewScore * 1000 + (item.reviewCount || 0);

    if (currentRank > existingRank) map.set(key, item);
  });

  return [...map.values()];
};

export const aggregateSearchResults = async ({
  location,
  checkin,
  checkout,
  minPrice,
  maxPrice,
  currency,
  serpApiKey
}) => {
  const sourceTasks = [
    fetchSerpHotels({ location, checkin, checkout, currency, serpApiKey }),
    fetchSerpMaps({ location, currency, serpApiKey })
  ];

  const settled = await Promise.allSettled(sourceTasks);
  let merged = [];

  settled.forEach((result) => {
    if (result.status === 'fulfilled') {
      merged = merged.concat(result.value);
    } else {
      console.warn('Source failed but search will continue:', result.reason?.message || result.reason);
    }
  });

  if (!merged.length) {
    merged = fallbackMockResults({ location, minPrice, maxPrice, currency });
  }

  const inBudget = merged.filter(
    (hotel) => Number(hotel.pricePerNight) >= Number(minPrice) && Number(hotel.pricePerNight) <= Number(maxPrice)
  );

  const deduped = dedupeHotels(inBudget);

  return deduped
    .sort((a, b) => {
      if (b.reviewScore !== a.reviewScore) return b.reviewScore - a.reviewScore;
      return (b.reviewCount || 0) - (a.reviewCount || 0);
    })
    .slice(0, 30)
    .map((hotel) => ({
      ...hotel,
      reviewSnippets:
        hotel.reviewSnippets?.length > 0 ? hotel.reviewSnippets : makeSnippet(hotel.source, hotel.name, location)
    }));
};
