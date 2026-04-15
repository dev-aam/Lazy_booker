const API_URL = 'http://localhost:3000/api/search';
const INDIA_BUDGET_MIN = 500;
const INDIA_BUDGET_MAX = 200000;

const state = {
  step: 1,
  selectedLocation: null,
  results: [],
  filters: {
    stars: new Set([1, 2, 3, 4, 5]),
    sort: 'reviews'
  }
};

const el = {
  searchForm: document.getElementById('searchForm'),
  stepDisplay: document.getElementById('stepDisplay'),
  progressBar: document.getElementById('progressBar'),
  locationInput: document.getElementById('locationInput'),
  locationSuggestions: document.getElementById('locationSuggestions'),
  toStep2: document.getElementById('toStep2'),
  backTo1: document.getElementById('backTo1'),
  checkin: document.getElementById('checkin'),
  checkout: document.getElementById('checkout'),
  nightCount: document.getElementById('nightCount'),
  toStep3: document.getElementById('toStep3'),
  backTo2: document.getElementById('backTo2'),
  minPrice: document.getElementById('minPrice'),
  maxPrice: document.getElementById('maxPrice'),
  priceDisplay: document.getElementById('priceDisplay'),
  currency: document.getElementById('currency'),
  wizardCard: document.getElementById('wizardCard'),
  resultsSection: document.getElementById('resultsSection'),
  resultsGrid: document.getElementById('resultsGrid'),
  resultCount: document.getElementById('resultCount'),
  sortBy: document.getElementById('sortBy'),
  newSearchBtn: document.getElementById('newSearchBtn')
};

let suggestionDebounce;

const setStep = (step) => {
  state.step = step;
  document.querySelectorAll('.step').forEach((node) => {
    node.classList.toggle('active', Number(node.dataset.step) === step);
  });
  el.stepDisplay.textContent = String(step);
  el.progressBar.style.width = `${(step / 3) * 100}%`;
};

const toISODate = (date) => date.toISOString().split('T')[0];
const today = toISODate(new Date());
el.checkin.min = today;
el.checkout.min = today;
el.currency.value = 'INR';

const nightsBetween = (start, end) => {
  const ms = new Date(end) - new Date(start);
  return Math.round(ms / (24 * 60 * 60 * 1000));
};

const updateDateValidation = () => {
  const checkin = el.checkin.value;
  const checkout = el.checkout.value;
  el.checkout.min = checkin || today;

  if (!checkin || !checkout) {
    el.nightCount.textContent = 'Select valid dates.';
    el.toStep3.disabled = true;
    return;
  }

  const nights = nightsBetween(checkin, checkout);
  if (nights > 0) {
    el.nightCount.textContent = `${nights} night${nights > 1 ? 's' : ''}`;
    el.toStep3.disabled = false;
    return;
  }

  el.nightCount.textContent = 'Check-out must be after check-in.';
  el.toStep3.disabled = true;
};

const currencySymbol = (currency) => {
  const symbols = { INR: '₹' };
  return symbols[currency] ?? `${currency} `;
};

const updatePriceDisplay = () => {
  let min = Number(el.minPrice.value);
  let max = Number(el.maxPrice.value);

  if (min > max) {
    [min, max] = [max, min];
    el.minPrice.value = min;
    el.maxPrice.value = max;
  }

  el.priceDisplay.textContent = `${currencySymbol(el.currency.value)}${min} – ${currencySymbol(el.currency.value)}${max} / night`;
};

const sentimentFromScore = (score = 0) => {
  if (score >= 9) return 'Excellent';
  if (score >= 8) return 'Very Good';
  if (score >= 7) return 'Good';
  return 'Fair';
};

const truncate = (text, max = 120) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

const fetchCitySuggestions = async (query) => {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'in');
  url.searchParams.set('featuretype', 'city');

  const response = await fetch(url.toString(), {
    headers: { 'Accept-Language': 'en' }
  });

  if (!response.ok) throw new Error('Could not fetch city suggestions.');
  return response.json();
};

const renderSuggestions = (items) => {
  el.locationSuggestions.innerHTML = '';
  if (!items.length) return;

  items
    .filter((item) => item.address?.country_code === 'in')
    .forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item.display_name;
    li.addEventListener('click', () => {
      state.selectedLocation = {
        label: item.display_name,
        lat: item.lat,
        lon: item.lon
      };
      el.locationInput.value = item.display_name;
      el.locationSuggestions.innerHTML = '';
      el.toStep2.disabled = false;
    });
    el.locationSuggestions.appendChild(li);
  });
};

const showLoadingSkeletons = () => {
  el.resultCount.textContent = 'Searching hotels...';
  el.resultsGrid.innerHTML = '';
  const tpl = document.getElementById('skeletonTemplate');
  for (let i = 0; i < 6; i += 1) {
    el.resultsGrid.appendChild(tpl.content.cloneNode(true));
  }
};

const getFilteredResults = () => {
  const activeStars = state.filters.stars;
  const rows = state.results.filter((result) => activeStars.has(Number(result.stars ?? 0)));

  if (state.filters.sort === 'price') {
    return rows.sort((a, b) => a.pricePerNight - b.pricePerNight);
  }

  return rows.sort((a, b) => {
    if (b.reviewScore !== a.reviewScore) return b.reviewScore - a.reviewScore;
    return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
  });
};

const renderNoResults = () => {
  el.resultsGrid.innerHTML = `
    <section class="empty-state">
      <h3>No hotels found</h3>
      <p>Try broadening your budget, selecting nearby cities, or changing dates.</p>
    </section>
  `;
  el.resultCount.textContent = '0 results';
};

const renderResults = () => {
  const filtered = getFilteredResults();
  if (!filtered.length) return renderNoResults();

  el.resultCount.textContent = `${filtered.length} hotels found`;
  el.resultsGrid.innerHTML = '';

  filtered.forEach((hotel) => {
    const card = document.createElement('article');
    card.className = 'hotel-card';
    const snippets = (hotel.reviewSnippets || [])
      .slice(0, 3)
      .map((snippet) => `<li>${truncate(snippet)}</li>`)
      .join('');

    card.innerHTML = `
      <img loading="lazy" src="${hotel.image || 'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=600&q=60'}" alt="${hotel.name}" />
      <div class="hotel-body">
        <h3 class="hotel-title">${hotel.name} ${'★'.repeat(hotel.stars || 0)}</h3>
        <div class="meta">
          <span class="badge">${hotel.reviewScore.toFixed(1)}/10</span>
          <span class="badge">${hotel.reviewCount || 0} reviews</span>
          <span class="badge">${sentimentFromScore(hotel.reviewScore)}</span>
          <span class="badge">${currencySymbol(hotel.currency)}${hotel.pricePerNight} / night</span>
        </div>
        <p>${hotel.address || 'Address unavailable'}${hotel.distanceFromCenter ? ` • ${hotel.distanceFromCenter}` : ''}</p>
        <ul class="snippets">${snippets}</ul>
        <div class="card-footer">
          <span class="small">Powered by ${hotel.source}</span>
          <a href="${hotel.url}" target="_blank" rel="noreferrer noopener"><button type="button">View Deal</button></a>
        </div>
      </div>
    `;

    el.resultsGrid.appendChild(card);
  });
};

el.locationInput.addEventListener('input', () => {
  const query = el.locationInput.value.trim();
  state.selectedLocation = null;
  el.toStep2.disabled = true;

  clearTimeout(suggestionDebounce);
  if (query.length < 2) {
    renderSuggestions([]);
    return;
  }

  suggestionDebounce = setTimeout(async () => {
    try {
      const suggestions = await fetchCitySuggestions(query);
      renderSuggestions(suggestions);
    } catch (error) {
      el.locationSuggestions.innerHTML = '';
      console.error(error);
    }
  }, 320);
});

el.toStep2.addEventListener('click', () => setStep(2));
el.backTo1.addEventListener('click', () => setStep(1));
el.toStep3.addEventListener('click', () => setStep(3));
el.backTo2.addEventListener('click', () => setStep(2));

el.checkin.addEventListener('change', updateDateValidation);
el.checkout.addEventListener('change', updateDateValidation);
el.minPrice.addEventListener('input', updatePriceDisplay);
el.maxPrice.addEventListener('input', updatePriceDisplay);
el.currency.addEventListener('change', updatePriceDisplay);

el.sortBy.addEventListener('change', () => {
  state.filters.sort = el.sortBy.value;
  renderResults();
});

document.querySelectorAll('input[name="stars"]').forEach((node) => {
  node.addEventListener('change', () => {
    const stars = Number(node.value);
    if (node.checked) state.filters.stars.add(stars);
    else state.filters.stars.delete(stars);
    renderResults();
  });
});

el.newSearchBtn.addEventListener('click', () => {
  el.resultsSection.classList.add('hidden');
  el.wizardCard.classList.remove('hidden');
  setStep(1);
});

el.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const body = {
    location: state.selectedLocation?.label ?? el.locationInput.value,
    checkin: el.checkin.value,
    checkout: el.checkout.value,
    minPrice: Number(el.minPrice.value),
    maxPrice: Number(el.maxPrice.value),
    currency: el.currency.value
  };

  if (body.minPrice < INDIA_BUDGET_MIN || body.maxPrice > INDIA_BUDGET_MAX) {
    alert(`Budget must be between ₹${INDIA_BUDGET_MIN} and ₹${INDIA_BUDGET_MAX} per night.`);
    return;
  }

  el.wizardCard.classList.add('hidden');
  el.resultsSection.classList.remove('hidden');
  showLoadingSkeletons();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Search failed.');

    const payload = await response.json();
    state.results = payload.results || [];
    renderResults();
  } catch (error) {
    console.error(error);
    state.results = [];
    renderNoResults();
  }
});

updateDateValidation();
updatePriceDisplay();
setStep(1);
