const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1024

async function callAnthropic(messages) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Anthropic API error ${res.status}`)
  }

  const data = await res.json()
  return data.content[0].text
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON found in Claude response')
  return JSON.parse(match[0])
}

async function parseUrl({ url }) {
  const text = await callAnthropic([{
    role: 'user',
    content: `Given this product URL: ${url}
Infer as much as you can about this clothing/fashion item from the URL path and domain name alone.
Return JSON only: { "name": "", "category": "", "color": "", "source": "", "occasions": [], "seasons": [] }
Rules:
- "name" should be the item description only (e.g. "Floral Midi Dress"), never include the brand name in the name field
- "source" should be the brand or store name (e.g. "Zara", "Net-a-Porter") inferred from the domain
- Category must be one of: top, bottom, dress, outerwear, cardigan, shoes, bag, jewelry, belt, sunglasses, accessory, activewear, swimwear, other
- Occasions from: casual, work, date, wedding, formal event, party, vacation
- Seasons from: spring, summer, fall, winter`
  }])
  return parseJSON(text)
}

async function analyzeImage({ imageData }) {
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid image data')
  const mediaType = match[1]
  const base64 = match[2]

  const text = await callAnthropic([{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      {
        type: 'text',
        text: `Analyze this clothing/fashion item image.
Return JSON only: { "name": "", "category": "", "color": "", "occasions": [], "seasons": [] }
Category must be one of: top, bottom, dress, outerwear, shoes, bag, jewelry, belt, sunglasses, accessory, activewear, swimwear, other
Occasions from: casual, work, date, wedding, formal event, party, vacation
Seasons from: spring, summer, fall, winter`
      }
    ]
  }])
  return parseJSON(text)
}

function buildInspirationContext(inspiration) {
  if (!inspiration?.length) return { text: '', imageInputs: [] }

  // Uploaded inspiration images passed as vision inputs (up to 4)
  const imageInputs = inspiration
    .filter(i => i.image_url)
    .slice(0, 4)
    .map(i => ({ type: 'image', source: { type: 'url', url: i.image_url } }))

  const text = imageInputs.length
    ? `\n${imageInputs.length} style inspiration image(s) are included above — use the aesthetic, colour palette, silhouette, and styling cues from those images to inform the outfit.`
    : ''

  return { text, imageInputs }
}

async function generateOutfit({ items, anchored, excludeIds, weather, timeOfDay, occasion, date, location, inspiration }) {
  const anchoredList = anchored?.length
    ? `MUST INCLUDE these item IDs: ${anchored.join(', ')}`
    : 'No anchored items.'

  const excludeNote = excludeIds?.length
    ? `REGENERATION — these items were just shown. Pick DIFFERENT items for variety (do not reuse these IDs unless they are anchored): ${excludeIds.join(', ')}`
    : ''

  const season = weather?.season || ''
  const timeLabel = timeOfDay === 'night' ? 'evening/night' : 'daytime'
  const weatherStr = weather
    ? `Temperature: ${weather.temp}°F (feels like ${weather.feels_like}°F), Conditions: ${weather.condition}. ${weather.recommendation}`
    : 'Weather: unknown'

  const seasonNote = season
    ? `Season: ${season}. ONLY select items whose seasons array includes "${season}" OR whose seasons array is empty (season-neutral pieces). Do NOT use any item whose seasons array is non-empty and does not contain "${season}" — for example, a cardigan tagged only for ["fall","winter"] must not appear in a summer outfit.`
    : date ? `Date: ${date}. Choose seasonally appropriate items based on the time of year.` : ''

  const occasionNote = occasion
    ? `Occasion: ${occasion}. STRONGLY prefer items whose occasions array includes "${occasion}". An item tagged for multiple occasions (e.g. ["work","casual"]) qualifies as long as "${occasion}" is one of them. Only exclude an item if its occasions array is non-empty AND does not contain "${occasion}" at all — items with an empty occasions array are neutral and may be used as a fallback.`
    : ''

  const timeNote = timeOfDay === 'night'
    ? 'It is evening/night — temperatures will be cooler than the daytime high. Choose items suited for evening wear and account for the lower nighttime temperature.'
    : 'It is daytime — choose items suited for the daytime temperature and conditions, including sun protection if it is sunny.'

  const { text: inspirationText, imageInputs } = buildInspirationContext(inspiration)

  const promptText = `You are a fashion stylist. Create a cohesive, weather-appropriate outfit.

Location: ${location || 'unspecified'}
Date: ${date || 'unspecified'}
Time: ${timeLabel}
${weatherStr}
${occasionNote}
${seasonNote}
${timeNote}
${inspirationText}

Available wardrobe items:
${JSON.stringify(items)}
${anchoredList}
${excludeNote}

Instructions:
1. Select items appropriate for ${weather?.temp ? `${weather.temp}°F` : 'the temperature'} and ${weather?.condition || 'the conditions'}
2. ONLY select items whose occasions array includes "${occasion || 'the selected occasion'}", OR items with an empty occasions array (neutral pieces). An item tagged for multiple occasions qualifies as long as the selected occasion is one of them.
3. ONLY select items whose seasons array includes "${season || 'the current season'}", OR items with an empty seasons array (season-neutral). An item tagged for multiple seasons qualifies as long as the current season is one of them. EXCLUDE any item whose seasons array is non-empty and does not include the current season.
4. If rainy or snowy conditions, include outerwear and practical footwear
5. If sunny and warm, choose lighter fabrics and layers
6. Reflect the style aesthetic from any inspiration boards or images provided
7. STYLE COHERENCE — apply every rule below before finalising:
   a. COLOR PALETTE: Build around 2–3 colors max. Use the color field of each item. Neutrals (black, white, ivory, beige, grey, navy, camel, tan) pair with almost anything. Do not combine items whose colors clash or compete with each other.
   b. PATTERN DISCIPLINE: Infer patterns from the item name (e.g. "striped", "floral", "plaid", "printed", "checked"). NEVER pair two bold patterns of the same type — no two striped pieces, no two florals, no two plaids. If one visible piece is patterned, every other visible piece must be a solid color or a completely different, subtle pattern. Always pick up a color from the pattern for any coordinating solids.
   c. AESTHETIC CONSISTENCY: All pieces must share a similar formality and style. Do not mix very casual items with very formal ones (e.g. a graphic tee with a pencil skirt, or athletic sneakers with a cocktail dress).
   d. ACCESSORIES MUST RELATE: Bag, belt, and jewelry must connect to the outfit palette — matching a key color, a neutral tone, or a metal that ties the look together. Do not select an accessory whose color is unrelated to anything else in the outfit.
   e. FINAL CHECK: Before returning, review whether every selected item works with every other item on color, pattern, and style. If any item conflicts, replace it with one that fits.

Return JSON only: { "dress": "id or null", "top": "id or null", "cardigan": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "jewelry": "id or null", "belt": "id or null", "accessory": "id or null", "notes": "one sentence noting weather suitability and style" }
Rules:
- Use EITHER dress OR top+bottom — never both. If dress is set, top and bottom must be null. If top or bottom is set, dress must be null.
- Cardigan layers over a top or dress: if cardigan is set with a top, the top must be a tank or sleeveless style. If cardigan is set with a dress, top and bottom must be null.
- Only populate slots that genuinely contribute to the outfit. Set slots to null when that item type is not needed.
- Only use IDs from the provided list.`

  const content = imageInputs.length
    ? [...imageInputs, { type: 'text', text: promptText }]
    : promptText

  const text = await callAnthropic([{ role: 'user', content }])
  return parseJSON(text)
}

// ── Real weather via Open-Meteo (no API key required) ──────────────────────

const WMO_CONDITIONS = {
  0: 'Sunny', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Foggy',
  51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  56: 'Freezing Drizzle', 57: 'Heavy Freezing Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  66: 'Freezing Rain', 67: 'Heavy Freezing Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
  80: 'Rain Showers', 81: 'Rain Showers', 82: 'Heavy Rain Showers',
  85: 'Snow Showers', 86: 'Heavy Snow Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with Hail', 99: 'Severe Thunderstorm',
}

function wmoToCondition(code) {
  return WMO_CONDITIONS[code] || 'Partly Cloudy'
}

function getSeason(dateStr, latitude) {
  const month = new Date(dateStr + 'T12:00:00Z').getUTCMonth() + 1
  const north = latitude >= 0
  if (north) {
    if (month >= 3 && month <= 5) return 'spring'
    if (month >= 6 && month <= 8) return 'summer'
    if (month >= 9 && month <= 11) return 'fall'
    return 'winter'
  } else {
    if (month >= 3 && month <= 5) return 'fall'
    if (month >= 6 && month <= 8) return 'winter'
    if (month >= 9 && month <= 11) return 'spring'
    return 'summer'
  }
}

function weatherRecommendation(condition, temp, timeOfDay) {
  const c = condition.toLowerCase()
  if (c.includes('thunder')) return 'waterproof jacket, closed-toe shoes, and an umbrella'
  if (c.includes('snow') || c.includes('freezing')) return 'warm coat, waterproof boots, and layers'
  if (c.includes('rain') || c.includes('drizzle')) return 'light rain jacket and practical footwear'
  if (c.includes('fog')) return 'light layers and comfortable shoes'
  if (temp < 32) return 'heavy coat, gloves, scarf, and warm layers'
  if (temp < 45) return 'warm coat and layers'
  if (temp < 60) return 'jacket or light coat'
  if (temp < 70) return 'light layers or a cardigan'
  if (temp >= 85) return 'light breathable fabrics and sun protection'
  return timeOfDay === 'night' ? 'light layers for the evening' : 'light, comfortable layers'
}

async function fetchRealWeather(lat, lon, date, timeOfDay) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date + 'T00:00:00')
  const daysOut = Math.floor((target - today) / 86400000)

  // Open-Meteo forecast covers today through ~16 days ahead
  // ERA5 historical archive covers everything before today
  const baseUrl = daysOut >= 0
    ? 'https://api.open-meteo.com/v1/forecast'
    : 'https://archive-api.open-meteo.com/v1/era5'

  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,weathercode',
    temperature_unit: 'fahrenheit',
    timezone: 'auto',
    start_date: date, end_date: date,
  })

  const res = await fetch(`${baseUrl}?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`)
  const data = await res.json()
  if (!data.daily?.temperature_2m_max?.[0] == null) throw new Error('No data')

  const d = data.daily
  const isNight = timeOfDay === 'night'
  const temp = Math.round(isNight ? d.temperature_2m_min[0] : d.temperature_2m_max[0])
  const feels_like = Math.round(
    isNight
      ? (d.apparent_temperature_min?.[0] ?? d.temperature_2m_min[0])
      : (d.apparent_temperature_max?.[0] ?? d.temperature_2m_max[0])
  )
  const condition = wmoToCondition(d.weathercode[0])
  return { temp, feels_like, condition }
}

async function getWeather({ location, date, timeOfDay }) {
  // Step 1 — geocode location
  let lat, lon
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
    )
    const geo = await geoRes.json()
    if (!geo.results?.length) throw new Error('Location not found')
    lat = geo.results[0].latitude
    lon = geo.results[0].longitude
  } catch {
    return getWeatherFromClaude({ location, date, timeOfDay })
  }

  // Step 2 — check if date is within Open-Meteo range (historical + 16-day forecast)
  // Dates more than 16 days in the future fall back to Claude seasonal estimate
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysOut = Math.floor((new Date(date + 'T00:00:00') - today) / 86400000)
  if (daysOut > 16) {
    return getWeatherFromClaude({ location, date, timeOfDay })
  }

  // Step 3 — fetch real weather
  try {
    const { temp, feels_like, condition } = await fetchRealWeather(lat, lon, date, timeOfDay)
    const season = getSeason(date, lat)
    const recommendation = weatherRecommendation(condition, temp, timeOfDay)
    return { temp, feels_like, condition, season, recommendation }
  } catch {
    return getWeatherFromClaude({ location, date, timeOfDay })
  }
}

async function getWeatherFromClaude({ location, date, timeOfDay }) {
  const timeContext = timeOfDay === 'night' ? 'evening and overnight' : 'daytime'
  const text = await callAnthropic([{
    role: 'user',
    content: `What is the typical weather in ${location} on ${date} during ${timeContext} hours?
Return JSON only: { "temp": 72, "condition": "Sunny", "feels_like": 70, "season": "summer", "recommendation": "light layers" }
- temp: typical ${timeContext} temperature in °F
- condition: e.g. Sunny, Partly Cloudy, Rainy, Snowy
- feels_like: accounting for humidity or wind
- season: meteorological season for ${location} at this time of year
- recommendation: one short phrase about what to wear`
  }])
  return parseJSON(text)
}

async function findSimilar({ item, sources }) {
  const sourceList = sources?.length ? sources.join(', ') : 'any popular fashion retailers'
  const text = await callAnthropic([{
    role: 'user',
    content: `I'm looking for items similar to: "${item.name}" (${item.category}, ${item.color}, from ${item.source || 'unknown brand'}).
My favorite brands/sites are: ${sourceList}.
Suggest 4 similar items.
Return JSON only as an array: [{ "name": "", "brand": "", "description": "", "priceRange": "", "searchUrl": "https://google.com/search?q=..." }]`
  }])
  const result = parseJSON(text)
  return Array.isArray(result) ? result : result.items || []
}

async function generateTripOutfit({ destination, date, timeOfDay, items, usedIds }) {
  const usedStr = usedIds?.length
    ? `Already used on this trip (prefer reuse for mix-and-match): ${usedIds.join(', ')}`
    : 'No items used yet on this trip.'

  const text = await callAnthropic([{
    role: 'user',
    content: `You are a fashion stylist for a trip to ${destination}. Date: ${date}, Time: ${timeOfDay}.
Wardrobe: ${JSON.stringify(items)}
${usedStr}

STYLE COHERENCE — apply every rule below before finalising:
a. COLOR PALETTE: Build around 2–3 colors max. Use item color fields. Neutrals (black, white, ivory, beige, grey, navy, camel) pair with almost anything. Do not combine items whose colors clash.
b. PATTERN DISCIPLINE: Infer patterns from item names (striped, floral, plaid, printed, checked). NEVER pair two bold patterns of the same type. If one visible piece is patterned, all others must be solid or a completely different subtle pattern. Pick up a color from the pattern for coordinating solids.
c. AESTHETIC CONSISTENCY: All pieces must share a similar formality and style. Do not mix very casual and very formal items.
d. ACCESSORIES MUST RELATE: Bag, belt, and jewelry colors must connect to the outfit palette.
e. FINAL CHECK: Review every selected item against every other. Replace any item that conflicts in color, pattern, or style.

Return JSON only: { "dress": "id or null", "top": "id or null", "cardigan": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "jewelry": "id or null", "belt": "id or null", "accessory": "id or null", "notes": "brief styling note" }
Rules:
- Use EITHER dress OR top+bottom — never both. If dress is set, top and bottom must be null.
- Cardigan layers over a top or dress: if cardigan is set with a top, the top must be a tank or sleeveless style. If cardigan is set with a dress, top and bottom must be null.
- Only populate slots that genuinely contribute to the outfit. Set unused slots to null.
- Only use IDs from the provided items list.`
  }])
  return parseJSON(text)
}

async function generateWishlistOutfit({ anchoredItems, wardrobeItems, occasion, timeOfDay, excludeIds }) {
  const timeLabel = timeOfDay === 'night' ? 'evening/night' : 'daytime'

  const occasionNote = occasion
    ? `Occasion: ${occasion}. Prefer wardrobe items whose occasions array includes "${occasion}". An item qualifies if "${occasion}" is anywhere in its occasions array. Items with an empty occasions array are neutral and may be used.`
    : ''

  const excludeNote = excludeIds?.length
    ? `REGENERATION — these items were just shown. Pick DIFFERENT wardrobe items for variety (do not reuse these IDs): ${excludeIds.join(', ')}`
    : ''

  // Build a clear slot assignment for each anchored wishlist item
  const wishlistSlotLines = anchoredItems.map(i => `  • Slot "${i.category}" → MUST use id "${i.id}" (${i.name})`).join('\n')
  const wishlistIds = anchoredItems.map(i => i.id)
  const wardrobeIds = wardrobeItems.map(i => i.id)

  const text = await callAnthropic([{
    role: 'user',
    content: `You are a fashion stylist. Create a complete, cohesive outfit built around specific wishlist pieces.

Time: ${timeLabel}
${occasionNote}

STEP 1 — Place these wishlist pieces in their exact slots. These are FIXED. Do not move them or use their IDs anywhere else:
${wishlistSlotLines}

STEP 2 — Fill ALL remaining slots using ONLY the wardrobe IDs listed below. You MUST NOT use any wishlist ID (${wishlistIds.join(', ')}) in any slot other than the one assigned above.

Wardrobe items available (use ONLY these IDs for non-wishlist slots):
${JSON.stringify(wardrobeItems)}
${excludeNote}

STYLE COHERENCE — apply every rule below before finalising:
a. COLOR PALETTE: Build around 2–3 colors max. Use the wishlist piece(s) as the color anchor and select wardrobe items whose colors coordinate with them. Do not combine items whose colors clash or compete.
b. PATTERN DISCIPLINE: Infer patterns from item names (e.g. "striped", "floral", "plaid", "printed"). NEVER pair two bold patterns of the same type. If one visible piece is patterned, every other visible piece must be a solid or a completely different, subtle pattern. Pick up a color from the pattern for coordinating solids.
c. AESTHETIC CONSISTENCY: All pieces must share a similar formality and style. Do not mix very casual items with very formal ones.
d. ACCESSORIES MUST RELATE: Bag, belt, and jewelry must connect to the outfit palette — matching a key color, a neutral, or a metal that ties the look together.
e. FINAL CHECK: Review every selected item against every other. If any item conflicts in color, pattern, or style, replace it.

Return JSON only: { "dress": "id or null", "top": "id or null", "cardigan": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "jewelry": "id or null", "belt": "id or null", "accessory": "id or null", "notes": "brief styling note" }
Rules:
- The fixed wishlist slots above are non-negotiable — use exactly those IDs in exactly those slots
- Every other populated slot must contain a wardrobe ID from: [${wardrobeIds.join(', ')}]
- Use EITHER dress OR top+bottom — never both. If dress is set, top and bottom must be null.
- Cardigan layers over a tank/sleeveless top or over a dress. If cardigan is set with a dress, top and bottom must be null.
- Only populate slots that genuinely contribute to the outfit. Set unused slots to null.`
  }])
  return parseJSON(text)
}

const handlers = { parseUrl, analyzeImage, generateOutfit, getWeather, findSimilar, generateTripOutfit, generateWishlistOutfit }

export default async function handler(req, res) {
  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, hasApiKey: !!process.env.ANTHROPIC_API_KEY })
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in environment variables' })
  }

  // Parse body — Vercel auto-parses JSON but handle raw as fallback
  let body = req.body
  if (!body || typeof body === 'string') {
    try {
      const raw = typeof body === 'string' ? body : await new Promise((resolve, reject) => {
        let data = ''
        req.on('data', chunk => { data += chunk })
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })
      body = raw ? JSON.parse(raw) : {}
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' })
    }
  }

  const { action, ...params } = body || {}

  if (!action || !handlers[action]) {
    return res.status(400).json({ error: `Unknown action: ${action}` })
  }

  try {
    const result = await handlers[action](params)
    return res.status(200).json(result)
  } catch (err) {
    console.error(`Claude API error [${action}]:`, err.message)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
