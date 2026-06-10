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
    ? `PREVIOUSLY WORN / ALREADY SHOWN — COMPLETELY OFF-LIMITS: The following item IDs MUST NOT appear anywhere in this outfit. This ban overrides weather, season, occasion, and all other rules. Using any of these IDs is a critical error that invalidates the entire outfit:\n${excludeIds.join(', ')}`
    : ''

  const varietyNote = `VARIETY: This wardrobe contains many items. Do not habitually default to the same pieces every time. For each slot, consider all qualifying items and deliberately choose from across the full range — including less-obvious picks, different colors, and combinations you have not suggested before. Avoid safe defaults; aim for a fresh, well-considered outfit.`

  const season = weather?.season || ''
  const timeLabel = timeOfDay === 'night' ? 'evening/night' : 'daytime'
  const weatherStr = weather
    ? `Temperature: ${weather.temp}°F (feels like ${weather.feels_like}°F), Conditions: ${weather.condition}. ${weather.recommendation}`
    : 'Weather: unknown'

  const seasonNote = season
    ? `Season: ${season}. ONLY select items whose seasons array includes "${season}" OR whose seasons array is empty (season-neutral pieces). Do NOT use any item whose seasons array is non-empty and does not contain "${season}" — for example, a cardigan tagged only for ["fall","winter"] must not appear in a summer outfit.`
    : date ? `Date: ${date}. Choose seasonally appropriate items based on the time of year.` : ''

  const occasionNote = occasion
    ? `Occasion: ${occasion}. ONLY select items whose occasions array includes "${occasion}" OR whose occasions array is empty (occasion-neutral). An item tagged for multiple occasions qualifies as long as "${occasion}" is one of them. MUST NOT select any item whose occasions array is non-empty and does not contain "${occasion}".`
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
${excludeNote}

Available wardrobe items:
${JSON.stringify(items)}
${anchoredList}
${varietyNote}

MANDATORY RULES — every rule below is non-negotiable. An outfit that violates any rule is incorrect and must be revised before returning.

RULE 1 — WEATHER: MUST select items appropriate for ${weather?.temp ? `${weather.temp}°F` : 'the current temperature'} and ${weather?.condition || 'the conditions'}. If rainy or snowy, MUST include outerwear and practical footwear. If sunny and warm, MUST use lighter fabrics.
RULE 2 — OCCASION: MUST NOT include any item whose occasions array is non-empty and does not contain "${occasion || 'the selected occasion'}". ONLY items whose occasions array includes the occasion, or whose occasions array is empty, are permitted.
RULE 3 — SEASON: MUST NOT include any item whose seasons array is non-empty and does not contain "${season || 'the current season'}". ONLY items whose seasons array includes the season, or whose seasons array is empty, are permitted.
RULE 4 — OFF-LIMITS ITEMS: The "PREVIOUSLY WORN / ALREADY SHOWN" IDs listed above MUST NOT appear in this outfit under any circumstances. Not for weather. Not for season. Not for any reason. If no qualifying replacement exists for a slot, leave that slot null rather than use an off-limits ID.
RULE 5 — INSPIRATION: If inspiration images are provided above, MUST reflect their aesthetic, colour palette, and silhouette in every selection.
RULE 6 — COLOR PALETTE: MUST build around 2–3 colors only. MUST NOT combine items whose colors clash or compete. Neutrals (black, white, ivory, beige, grey, navy, camel, tan) may pair with any color.
RULE 7 — PATTERN DISCIPLINE: MUST NOT pair two bold patterns of the same type (two stripes, two florals, two plaids, etc.). If any visible piece is patterned, every other visible piece MUST be a solid or a clearly different subtle pattern. MUST pick up a color from the pattern for any coordinating solid pieces.
RULE 8 — AESTHETIC CONSISTENCY: All pieces MUST share a similar formality and style. MUST NOT mix very casual items with very formal ones.
RULE 9 — ACCESSORIES: Bag, belt, and jewelry MUST connect to the outfit palette by matching a key color, a neutral tone, or a coordinating metal. MUST NOT select an accessory whose color is unrelated to the rest of the outfit.
RULE 10 — FINAL CHECK: Before returning, verify every selected item against every other item. If any item violates Rules 6–9, replace it. Do not return an outfit that fails any rule.

Return JSON only: { "dress": "id or null", "top": "id or null", "cardigan": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "jewelry": "id or null", "belt": "id or null", "accessory": "id or null", "notes": "one sentence noting weather suitability and style" }
Structure rules (also mandatory):
- MUST use EITHER dress OR top+bottom — never both. If dress is set, top and bottom must be null. If top or bottom is set, dress must be null.
- Cardigan: if paired with a top, the top MUST be a tank or sleeveless style. If paired with a dress, top and bottom MUST be null.
- MUST only populate slots that genuinely contribute to the outfit. Set slots to null when not needed.
- MUST only use IDs from the provided list.`

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

async function generateTripOutfit({ items, anchored, packingList, weather, occasion, timeOfDay, date, destination, season }) {
  const anchoredList = anchored?.length
    ? `ANCHORED ITEMS — MUST be included (place in their appropriate slots): ${anchored.join(', ')}`
    : 'No anchored items.'

  const packingStr = packingList?.length
    ? `PACKING LIST — items already selected for other days of this trip (prefer reusing these for efficient packing, but create a fresh-looking outfit by pairing differently):\n${packingList.join(', ')}`
    : 'No items packed yet for this trip.'

  const varietyNote = `VARIETY: This wardrobe contains many items. Do not habitually default to the same pieces every time. For each slot, consider all qualifying items and deliberately choose from across the full range — including less-obvious picks, different colors, and combinations you have not suggested before. Avoid safe defaults; aim for a fresh, well-considered outfit.`

  const timeLabel = timeOfDay === 'night' ? 'evening/night' : 'daytime'
  const weatherStr = weather
    ? `Temperature: ${weather.temp}°F (feels like ${weather.feels_like}°F), Conditions: ${weather.condition}. ${weather.recommendation || ''}`
    : 'Weather: unknown'

  const occasionNote = occasion
    ? `Occasion: ${occasion}. ONLY select items whose occasions array includes "${occasion}" OR whose occasions array is empty (occasion-neutral). MUST NOT select any item whose occasions array is non-empty and does not contain "${occasion}".`
    : ''

  const seasonNote = season
    ? `Season: ${season}. ONLY select items whose seasons array includes "${season}" OR whose seasons array is empty (season-neutral pieces). Do NOT use any item whose seasons array is non-empty and does not contain "${season}".`
    : ''

  const timeNote = timeOfDay === 'night'
    ? 'It is evening/night — temperatures will be cooler than the daytime high. Choose items suited for evening wear and account for the lower nighttime temperature.'
    : 'It is daytime — choose items suited for the daytime temperature and conditions, including sun protection if it is sunny.'

  const text = await callAnthropic([{
    role: 'user',
    content: `You are a fashion stylist creating a packing plan for a trip to ${destination}.
Date: ${date || 'unspecified'}, Time: ${timeLabel}
${weatherStr}
${occasionNote}
${seasonNote}
${timeNote}

${packingStr}

Available wardrobe items:
${JSON.stringify(items)}
${anchoredList}
${varietyNote}

MANDATORY RULES — every rule below is non-negotiable. An outfit that violates any rule is incorrect and must be revised before returning.

RULE 1 — WEATHER: MUST select items appropriate for ${weather?.temp ? `${weather.temp}°F` : 'the current temperature'} and ${weather?.condition || 'the conditions'}. If rainy or snowy, MUST include outerwear and practical footwear. If sunny and warm, MUST use lighter fabrics.
RULE 2 — OCCASION: MUST NOT include any item whose occasions array is non-empty and does not contain "${occasion || 'the selected occasion'}". ONLY items whose occasions array includes the occasion, or whose occasions array is empty, are permitted.
RULE 3 — SEASON: MUST NOT include any item whose seasons array is non-empty and does not contain "${season || 'the current season'}". ONLY items whose seasons array includes the season, or whose seasons array is empty, are permitted.
RULE 4 — PACKING EFFICIENCY: Items already in the packing list SHOULD be reused where they fit the weather, occasion, and season. When reusing, pair with different complementary pieces to create a distinct look. Do not duplicate an entire outfit.
RULE 5 — COLOR PALETTE: MUST build around 2–3 colors only. MUST NOT combine items whose colors clash or compete. Neutrals (black, white, ivory, beige, grey, navy, camel, tan) may pair with any color.
RULE 6 — PATTERN DISCIPLINE: MUST NOT pair two bold patterns of the same type (two stripes, two florals, two plaids, etc.). If any visible piece is patterned, every other visible piece MUST be a solid or a clearly different subtle pattern. MUST pick up a color from the pattern for any coordinating solid pieces.
RULE 7 — AESTHETIC CONSISTENCY: All pieces MUST share a similar formality and style. MUST NOT mix very casual items with very formal ones.
RULE 8 — ACCESSORIES: Bag, belt, and jewelry MUST connect to the outfit palette by matching a key color, a neutral tone, or a coordinating metal. MUST NOT select an accessory whose color is unrelated to the rest of the outfit.
RULE 9 — ANCHORED ITEMS: If anchored items are listed above, MUST include them in their appropriate slots.
RULE 10 — FINAL CHECK: Before returning, verify every selected item against every other item. If any item violates Rules 5–8, replace it. Do not return an outfit that fails any rule.

Return JSON only: { "dress": "id or null", "top": "id or null", "cardigan": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "jewelry": "id or null", "belt": "id or null", "accessory": "id or null", "notes": "one sentence noting weather suitability and style" }
Structure rules (also mandatory):
- MUST use EITHER dress OR top+bottom — never both. If dress is set, top and bottom must be null. If top or bottom is set, dress must be null.
- Cardigan: if paired with a top, the top MUST be a tank or sleeveless style. If paired with a dress, top and bottom MUST be null.
- MUST only populate slots that genuinely contribute to the outfit. Set slots to null when not needed.
- MUST only use IDs from the provided list.`
  }])
  return parseJSON(text)
}

// ── Bulk trip weather fetch via Open-Meteo ─────────────────────────────────

async function getTripWeatherFromClaude({ destination, startDate, endDate }) {
  const dates = []
  const current = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  const text = await callAnthropic([{
    role: 'user',
    content: `What is the typical weather in ${destination} from ${startDate} to ${endDate}?
Return a JSON object with one key per date. Each date key maps to an object with "day" and "night" sub-objects.
Format: { "${startDate}": { "day": { "temp": number, "feels_like": number, "condition": string, "season": string, "recommendation": string }, "night": { "temp": number, "feels_like": number, "condition": string, "season": string, "recommendation": string } }, ... }
List every date from ${startDate} to ${endDate} inclusive.
- temp/feels_like: typical temperature in °F
- condition: e.g. Sunny, Partly Cloudy, Rainy, Snowy
- season: meteorological season for ${destination} at this time of year
- recommendation: one short phrase about what to wear`
  }])
  const result = parseJSON(text)

  // Ensure all dates are present, fill nulls for any missing
  const out = {}
  for (const d of dates) {
    out[d] = result[d] || null
  }
  return out
}

async function getTripWeather({ destination, startDate, endDate }) {
  // 1. Geocode destination
  let lat, lon
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=en&format=json`
    )
    const geo = await geoRes.json()
    if (!geo.results?.length) throw new Error('Location not found')
    lat = geo.results[0].latitude
    lon = geo.results[0].longitude
  } catch {
    // Geocoding failed — fall back to Claude for all days
    return getTripWeatherFromClaude({ destination, startDate, endDate })
  }

  // 2. Determine date range coverage
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDaysOut = Math.floor((new Date(startDate + 'T00:00:00') - today) / 86400000)

  // If entire range is beyond 16 days, fall back to Claude
  if (startDaysOut > 16) {
    return getTripWeatherFromClaude({ destination, startDate, endDate })
  }

  // Collect all dates in the range
  const allDates = []
  const cur = new Date(startDate + 'T00:00:00')
  const endD = new Date(endDate + 'T00:00:00')
  while (cur <= endD) {
    allDates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }

  // Split: dates within Open-Meteo range vs beyond
  const inRangeDates = allDates.filter(d => {
    const daysOut = Math.floor((new Date(d + 'T00:00:00') - today) / 86400000)
    return daysOut <= 16
  })
  const outOfRangeDates = allDates.filter(d => {
    const daysOut = Math.floor((new Date(d + 'T00:00:00') - today) / 86400000)
    return daysOut > 16
  })

  // 3. Fetch Open-Meteo data for in-range dates in a single call
  const result = {}

  if (inRangeDates.length > 0) {
    const firstDate = inRangeDates[0]
    const lastDate = inRangeDates[inRangeDates.length - 1]

    // Historical vs forecast
    const firstDaysOut = Math.floor((new Date(firstDate + 'T00:00:00') - today) / 86400000)
    const baseUrl = firstDaysOut >= 0
      ? 'https://api.open-meteo.com/v1/forecast'
      : 'https://archive-api.open-meteo.com/v1/era5'

    try {
      const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,weathercode',
        temperature_unit: 'fahrenheit',
        timezone: 'auto',
        start_date: firstDate,
        end_date: lastDate,
      })

      const res = await fetch(`${baseUrl}?${params}`)
      if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`)
      const data = await res.json()
      const d = data.daily

      if (d?.time) {
        for (let i = 0; i < d.time.length; i++) {
          const dateStr = d.time[i]
          const dayTemp = Math.round(d.temperature_2m_max?.[i] ?? 70)
          const nightTemp = Math.round(d.temperature_2m_min?.[i] ?? 60)
          const dayFeels = Math.round(d.apparent_temperature_max?.[i] ?? dayTemp)
          const nightFeels = Math.round(d.apparent_temperature_min?.[i] ?? nightTemp)
          const condition = wmoToCondition(d.weathercode?.[i] ?? 0)
          const season = getSeason(dateStr, lat)

          result[dateStr] = {
            day: {
              temp: dayTemp,
              feels_like: dayFeels,
              condition,
              season,
              recommendation: weatherRecommendation(condition, dayTemp, 'day'),
            },
            night: {
              temp: nightTemp,
              feels_like: nightFeels,
              condition,
              season,
              recommendation: weatherRecommendation(condition, nightTemp, 'night'),
            },
          }
        }
      }
    } catch {
      // If Open-Meteo fails, fall back to Claude for all
      return getTripWeatherFromClaude({ destination, startDate, endDate })
    }
  }

  // 4. For out-of-range dates, use Claude seasonal estimate
  if (outOfRangeDates.length > 0) {
    try {
      const claudeResult = await getTripWeatherFromClaude({
        destination,
        startDate: outOfRangeDates[0],
        endDate: outOfRangeDates[outOfRangeDates.length - 1],
      })
      Object.assign(result, claudeResult)
    } catch {
      // Gracefully fill nulls
      for (const d of outOfRangeDates) {
        result[d] = null
      }
    }
  }

  // 5. Ensure all dates have entries (fill nulls for any gaps)
  for (const d of allDates) {
    if (!result[d]) result[d] = null
  }

  return result
}

async function generateWishlistOutfit({ anchoredItems, wardrobeItems, occasion, timeOfDay, excludeIds }) {
  const timeLabel = timeOfDay === 'night' ? 'evening/night' : 'daytime'

  const occasionNote = occasion
    ? `Occasion: ${occasion}. ONLY select wardrobe items whose occasions array includes "${occasion}" OR whose occasions array is empty (occasion-neutral). MUST NOT use any wardrobe item whose occasions array is non-empty and does not contain "${occasion}".`
    : ''

  const excludeNote = excludeIds?.length
    ? `FORBIDDEN — these wardrobe IDs were already shown and MUST NOT appear in this outfit. This is a hard rule — using any forbidden ID is an error: ${excludeIds.join(', ')}`
    : ''

  const varietyNote = `VARIETY: Do not habitually default to the same wardrobe pieces. For each slot, consider all qualifying items and deliberately choose from across the full range — including less-obvious picks, different colors, and combinations not suggested before.`

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
${varietyNote}

MANDATORY RULES — every rule below is non-negotiable. An outfit that violates any rule is incorrect and must be revised before returning.

RULE 1 — OCCASION: MUST NOT include any wardrobe item whose occasions array is non-empty and does not contain "${occasion || 'the selected occasion'}".
RULE 2 — FORBIDDEN IDs: MUST NOT reuse any forbidden wardrobe ID listed above.
RULE 3 — COLOR PALETTE: MUST build around 2–3 colors using the wishlist piece(s) as the color anchor. MUST NOT combine items whose colors clash or compete.
RULE 4 — PATTERN DISCIPLINE: MUST NOT pair two bold patterns of the same type. If any visible piece is patterned, every other visible piece MUST be solid or a clearly different subtle pattern. MUST pick up a color from the pattern for coordinating solids.
RULE 5 — AESTHETIC CONSISTENCY: All pieces MUST share a similar formality and style. MUST NOT mix very casual and very formal items.
RULE 6 — ACCESSORIES: Bag, belt, and jewelry MUST connect to the outfit palette. MUST NOT select an accessory whose color is unrelated to the rest of the outfit.
RULE 7 — FINAL CHECK: Before returning, verify every item against every other. Replace any item that violates Rules 3–6.

Return JSON only: { "dress": "id or null", "top": "id or null", "cardigan": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "jewelry": "id or null", "belt": "id or null", "accessory": "id or null", "notes": "brief styling note" }
Structure rules (also mandatory):
- The fixed wishlist slots above are non-negotiable — MUST use exactly those IDs in exactly those slots
- Every other populated slot MUST contain a wardrobe ID from: [${wardrobeIds.join(', ')}]
- MUST use EITHER dress OR top+bottom — never both. If dress is set, top and bottom must be null.
- Cardigan: if paired with a top, the top MUST be a tank or sleeveless style. If paired with a dress, top and bottom MUST be null.
- MUST only populate slots that genuinely contribute to the outfit. Set unused slots to null.`
  }])
  return parseJSON(text)
}

const handlers = { parseUrl, analyzeImage, generateOutfit, getWeather, findSimilar, generateTripOutfit, getTripWeather, generateWishlistOutfit }

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
