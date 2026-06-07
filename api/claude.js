const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-3-5-sonnet-20241022'
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
Category must be one of: top, bottom, dress, outerwear, shoes, bag, jewelry, sunglasses, accessory, activewear, swimwear, other
Occasions from: casual, work, date, wedding, formal event, party, vacation
Seasons from: spring, summer, fall, winter`
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
Category must be one of: top, bottom, dress, outerwear, shoes, bag, jewelry, sunglasses, accessory, activewear, swimwear, other
Occasions from: casual, work, date, wedding, formal event, party, vacation
Seasons from: spring, summer, fall, winter`
      }
    ]
  }])
  return parseJSON(text)
}

async function generateOutfit({ items, anchored, weather, timeOfDay, occasion }) {
  const anchoredList = anchored?.length
    ? `MUST INCLUDE these item IDs: ${anchored.join(', ')}`
    : 'No anchored items.'
  const weatherStr = weather
    ? `Weather: ${weather.temp}°F, ${weather.condition}. Recommendation: ${weather.recommendation}`
    : 'Weather: unknown'

  const text = await callAnthropic([{
    role: 'user',
    content: `You are a fashion stylist. Create a cohesive outfit from these wardrobe items.

Items: ${JSON.stringify(items)}
${anchoredList}
${weatherStr}
Time of day: ${timeOfDay || 'day'}
Occasion: ${occasion || 'casual'}

Return JSON only: { "top": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "accessory": "id or null", "notes": "brief styling note" }
Use null for slots with no suitable item. Only use IDs from the provided items list.`
  }])
  return parseJSON(text)
}

async function getWeather({ location, date }) {
  const text = await callAnthropic([{
    role: 'user',
    content: `What is the typical weather in ${location} on ${date}?
Return JSON only: { "temp": 72, "condition": "Sunny", "feels_like": 70, "recommendation": "light layers" }`
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
Return JSON only: { "top": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "accessory": "id or null", "notes": "brief styling note" }
Only use IDs from the provided items list.`
  }])
  return parseJSON(text)
}

const handlers = { parseUrl, analyzeImage, generateOutfit, getWeather, findSimilar, generateTripOutfit }

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
