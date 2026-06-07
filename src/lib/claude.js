const API_BASE = '/api/claude'

async function callApi(action, params) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'API request failed')
  }

  return res.json()
}

export async function parseItemFromUrl(url) {
  return callApi('parseUrl', { url })
}

export async function analyzeImage(base64Image) {
  return callApi('analyzeImage', { imageData: base64Image })
}

export async function generateOutfit({ items, anchored, weather, timeOfDay, occasion }) {
  return callApi('generateOutfit', { items, anchored, weather, timeOfDay, occasion })
}

export async function getWeather(location, date) {
  return callApi('getWeather', { location, date })
}

export async function findSimilarItems(item, sources) {
  return callApi('findSimilar', { item, sources })
}

export async function generateTripOutfit({ destination, date, timeOfDay, items, usedIds }) {
  return callApi('generateTripOutfit', { destination, date, timeOfDay, items, usedIds })
}
