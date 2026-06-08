const API_BASE = '/api/claude'

async function callApi(action, params) {
  let res
  try {
    res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
    })
  } catch (networkErr) {
    throw new Error(`Cannot reach /api/claude — ${networkErr.message}`)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `Server error (${res.status})`
    try {
      const json = JSON.parse(text)
      message = json.error || json.message || message
    } catch {}
    throw new Error(message)
  }

  return res.json()
}

export async function parseItemFromUrl(url) {
  return callApi('parseUrl', { url })
}

export async function analyzeImage(base64Image) {
  return callApi('analyzeImage', { imageData: base64Image })
}

export async function generateOutfit({ items, anchored, weather, timeOfDay, occasion, date, location }) {
  return callApi('generateOutfit', { items, anchored, weather, timeOfDay, occasion, date, location })
}

export async function getWeather(location, date, timeOfDay) {
  return callApi('getWeather', { location, date, timeOfDay })
}

export async function findSimilarItems(item, sources) {
  return callApi('findSimilar', { item, sources })
}

export async function generateTripOutfit({ destination, date, timeOfDay, items, usedIds }) {
  return callApi('generateTripOutfit', { destination, date, timeOfDay, items, usedIds })
}
