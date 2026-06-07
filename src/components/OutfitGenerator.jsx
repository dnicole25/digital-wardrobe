import { useState, useCallback } from 'react'
import { generateOutfit, getWeather } from '../lib/claude'
import OutfitSlot from './OutfitSlot'

const OCCASIONS = ['casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const SLOTS = ['top', 'bottom', 'outerwear', 'shoes', 'bag', 'accessory']

function today() {
  return new Date().toISOString().split('T')[0]
}

export default function OutfitGenerator({
  wardrobeItems,
  anchored = new Set(),
  onSaveOutfit,
  onAnchorToggle,
  preAnchoredItem,
}) {
  const [location, setLocation] = useState('')
  const [weather, setWeather] = useState(null)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [date, setDate] = useState(today())
  const [timeOfDay, setTimeOfDay] = useState('day')
  const [occasion, setOccasion] = useState('casual')

  const [outfit, setOutfit] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const effectiveAnchored = preAnchoredItem
    ? new Set([...anchored, preAnchoredItem.id])
    : anchored

  const itemById = useCallback(id => wardrobeItems.find(i => i.id === id) || null, [wardrobeItems])

  async function handleGetWeather() {
    if (!location.trim()) return
    setLoadingWeather(true)
    try {
      const data = await getWeather(location, date)
      setWeather(data)
    } catch {
      setWeather(null)
    } finally {
      setLoadingWeather(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const simplified = wardrobeItems.map(({ id, name, category, color, occasions, seasons }) => ({
        id, name, category, color, occasions, seasons
      }))
      const anchoredList = [...effectiveAnchored]

      const result = await generateOutfit({
        items: simplified,
        anchored: anchoredList,
        weather,
        timeOfDay,
        occasion,
      })
      setOutfit(result)
    } catch (err) {
      console.error('Outfit generation failed:', err)
      alert('Failed to generate outfit. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleSlotChange(slot, item) {
    setOutfit(prev => ({ ...prev, [slot]: item ? item.id : null }))
  }

  async function handleSave() {
    if (!outfit || !onSaveOutfit) return
    setSaving(true)
    try {
      await onSaveOutfit({
        occasion,
        time_of_day: timeOfDay,
        date,
        notes: outfit.notes || '',
        outfit_slots: outfit,
      })
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="outfit-generator">
      {/* Location + Weather */}
      <div className="outfit-inputs">
        <div>
          <label className="label">Location</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="input-field"
              placeholder="City or location"
              value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGetWeather()}
            />
            <button
              className="btn-outline"
              onClick={handleGetWeather}
              disabled={loadingWeather || !location.trim()}
              style={{ flexShrink: 0 }}
            >
              {loadingWeather ? <span className="spin">◌</span> : 'Go'}
            </button>
          </div>
          {weather && (
            <div className="weather-display" style={{ marginTop: 12 }}>
              <div className="weather-temp">{weather.temp}°F</div>
              <div className="weather-condition">{weather.condition}</div>
              <div className="weather-rec">{weather.recommendation}</div>
            </div>
          )}
        </div>

        <div>
          <div className="form-group">
            <label className="label">Date</label>
            <input
              type="date"
              className="input-field"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Time of Day</label>
            <div className="time-toggle">
              <button
                className={`time-btn ${timeOfDay === 'day' ? 'active' : ''}`}
                onClick={() => setTimeOfDay('day')}
              >
                ☀ Day
              </button>
              <button
                className={`time-btn ${timeOfDay === 'night' ? 'active' : ''}`}
                onClick={() => setTimeOfDay('night')}
              >
                ☽ Night
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Occasion */}
      <div style={{ marginBottom: 20 }}>
        <label className="label">Occasion</label>
        <div className="occasion-tags">
          {OCCASIONS.map(o => (
            <button
              key={o}
              className={`tag ${occasion === o ? 'active' : ''}`}
              onClick={() => setOccasion(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {preAnchoredItem && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--ivory)', border: '1px solid var(--border)', borderRadius: 2, fontSize: 12, color: 'var(--taupe)' }}>
          ⚓ Anchored: <strong style={{ color: 'var(--charcoal)' }}>{preAnchoredItem.name}</strong>
        </div>
      )}

      {/* Generate button */}
      <button
        className="btn-gold"
        onClick={handleGenerate}
        disabled={generating || wardrobeItems.length === 0}
        style={{ marginBottom: 24 }}
      >
        {generating
          ? <><span className="spin">◌</span> <span className="pulse">Generating…</span></>
          : '✦ Generate Outfit'}
      </button>

      {/* Outfit grid */}
      {outfit && (
        <>
          <div className="outfit-grid">
            {SLOTS.map(slot => (
              <OutfitSlot
                key={slot}
                slotName={slot}
                item={outfit[slot] ? itemById(outfit[slot]) : null}
                allItems={wardrobeItems}
                onItemChange={item => handleSlotChange(slot, item)}
                onAnchorToggle={onAnchorToggle}
                isAnchored={effectiveAnchored.has(outfit[slot])}
              />
            ))}
          </div>

          {outfit.notes && (
            <p className="outfit-notes">"{outfit.notes}"</p>
          )}

          <div className="outfit-actions">
            {onSaveOutfit && (
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1 }}
              >
                {saving ? <span className="spin">◌</span> : '♥'} Save Outfit
              </button>
            )}
            <button
              className="btn-outline"
              onClick={handleGenerate}
              disabled={generating}
              style={{ flex: 1 }}
            >
              ↻ Regenerate
            </button>
          </div>
        </>
      )}
    </div>
  )
}
