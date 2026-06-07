import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS = 1024

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON found in response')
  return JSON.parse(match[0])
}

async function parseUrl({ url }) {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{
      role: 'user',
      content: `Given this product URL: ${url}
Infer as much as you can about this clothing/fashion item from the URL path and domain name alone.
Return JSON only: { "name": "", "category": "", "color": "", "source": "", "occasions": [], "seasons": [] }
Category must be one of: top, bottom, dress, outerwear, shoes, bag, jewelry, sunglasses, accessory, activewear, swimwear, other
Occasions from: casual, work, date, wedding, formal event, party, vacation
Seasons from: spring, summer, fall, winter`
    }]
  })
  return parseJSON(msg.content[0].text)
}

async function analyzeImage({ imageData }) {
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid image data')
  const mediaType = match[1]
  const base64 = match[2]

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 }
        },
        {
          type: 'text',
          text: `Analyze this clothing/fashion item image.
Return JSON only: { "name": "", "category": "", "color": "", "occasions": [], "seasons": [] }
Category must be one of: top, bottom, dress, outerwear, shoes, bag, jewelry, sunglasses, accessory, activewear, swimwear, other
Occasions from: casual, work, date, wedding, formal event, party, vacation
Seasons from: spring, summer, fall, winter`
        }
      ]
    }]
  })
  return parseJSON(msg.content[0].text)
}

async function generateOutfit({ items, anchored, weather, timeOfDay, occasion }) {
  const anchoredList = anchored?.length
    ? `MUST INCLUDE these item IDs: ${anchored.join(', ')}`
    : 'No anchored items.'

  const weatherStr = weather
    ? `Weather: ${weather.temp}°F, ${weather.condition}. Recommendation: ${weather.recommendation}`
    : 'Weather: unknown'

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{
      role: 'user',
      content: `You are a fashion stylist. Create a cohesive outfit from these wardrobe items.

Items: ${JSON.stringify(items)}
${anchoredList}
${weatherStr}
Time of day: ${timeOfDay || 'day'}
Occasion: ${occasion || 'casual'}

Return JSON only: { "top": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "accessory": "id or null", "notes": "brief styling note" }
Use null for slots you have no suitable item for. Only use IDs from the provided items list.`
    }]
  })
  return parseJSON(msg.content[0].text)
}

async function getWeather({ location, date }) {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{
      role: 'user',
      content: `What is the typical weather in ${location} on ${date}?
Return JSON only: { "temp": 72, "condition": "Sunny", "feels_like": 70, "recommendation": "light layers" }`
    }]
  })
  return parseJSON(msg.content[0].text)
}

async function findSimilar({ item, sources }) {
  const sourceList = sources?.length ? sources.join(', ') : 'any popular fashion retailers'
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{
      role: 'user',
      content: `I'm looking for items similar to: "${item.name}" (${item.category}, ${item.color}, from ${item.source || 'unknown brand'}).
My favorite brands/sites are: ${sourceList}.
Suggest 4 similar items.
Return JSON only as an array: [{ "name": "", "brand": "", "description": "", "priceRange": "", "searchUrl": "https://google.com/search?q=..." }]`
    }]
  })
  const result = parseJSON(msg.content[0].text)
  return Array.isArray(result) ? result : result.items || []
}

async function generateTripOutfit({ destination, date, timeOfDay, items, usedIds }) {
  const usedStr = usedIds?.length
    ? `Already used on this trip (prefer reuse for mix-and-match): ${usedIds.join(', ')}`
    : 'No items used yet on this trip.'

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{
      role: 'user',
      content: `You are a fashion stylist for a trip to ${destination}. Date: ${date}, Time: ${timeOfDay}.
Wardrobe: ${JSON.stringify(items)}
${usedStr}
Return JSON only: { "top": "id or null", "bottom": "id or null", "outerwear": "id or null", "shoes": "id or null", "bag": "id or null", "accessory": "id or null", "notes": "brief styling note" }
Only use IDs from the provided items list.`
    }]
  })
  return parseJSON(msg.content[0].text)
}

const handlers = { parseUrl, analyzeImage, generateOutfit, getWeather, findSimilar, generateTripOutfit }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, ...params } = req.body || {}

  if (!action || !handlers[action]) {
    return res.status(400).json({ error: `Unknown action: ${action}` })
  }

  try {
    const result = await handlers[action](params)
    return res.status(200).json(result)
  } catch (err) {
    console.error(`Claude API error [${action}]:`, err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
