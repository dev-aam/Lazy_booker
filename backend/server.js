import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { aggregateSearchResults } from './scraper.js';
import { getCacheKey, getCachedResult, setCachedResult } from './cache.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

const validateRequest = ({ location, checkin, checkout, minPrice, maxPrice, currency }) => {
  if (!location || !checkin || !checkout || !currency) {
    return 'location, checkin, checkout, and currency are required.';
  }

  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);
  if (Number.isNaN(checkinDate.valueOf()) || Number.isNaN(checkoutDate.valueOf())) {
    return 'Invalid checkin/checkout date format.';
  }

  if (checkoutDate <= checkinDate) {
    return 'checkout must be after checkin.';
  }

  if (Number(minPrice) > Number(maxPrice)) {
    return 'minPrice must be less than or equal to maxPrice.';
  }

  return null;
};

app.post('/api/search', async (req, res) => {
  const validationError = validateRequest(req.body || {});
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const params = {
    ...req.body,
    minPrice: Number(req.body.minPrice),
    maxPrice: Number(req.body.maxPrice)
  };

  const cacheKey = getCacheKey(params);
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return res.json({
      cache: 'HIT',
      results: cached
    });
  }

  try {
    const results = await aggregateSearchResults({
      ...params,
      serpApiKey: process.env.SERPAPI_KEY
    });

    setCachedResult(cacheKey, results);

    return res.json({
      cache: 'MISS',
      results
    });
  } catch (error) {
    console.error('Search failed:', error);
    return res.status(500).json({ error: 'Search failed. Please try again shortly.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Lazy Booker API listening on port ${port}`);
});
