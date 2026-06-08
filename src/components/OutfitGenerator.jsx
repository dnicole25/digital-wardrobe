import { useState, useCallback, useEffect, useRef } from 'react'
import { generateOutfit, getWeather } from '../lib/claude'
import OutfitSlot from './OutfitSlot'

const OCCASIONS = ['casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const SLOTS = ['dress', 'top', 'cardigan', 'bottom', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'accessory']

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

  const itemById = useCallback(id => wardrobeItems.find(i => i.id === id) || null, [wardrobeItems])

  // Only anchor IDs that exist in wardrobeItems — wishlist IDs can't be included in generation
  const anchoredWardrobeIds = [...anchored].filter(id => wardrobeItems.some(i => i.id === id))

  const fetchedForRef = useRef(null)

  async function handleGetWeather(loc, dt, tod) {
    const l = (loc ?? location).trim()
    if (!l) return
    const d = dt ?? date
    const t = tod ?? timeOfDay
    setLoadingWeather(true)
    try {
      const data = await getWeather(l, d, t)
      setWeather(data)
      fetchedForRef.current = { location: l, date: d, timeOfDay: t }
    } catch {
      setWeather(null)
    } finally {
      setLoadingWeather(false)
    }
  }

  useEffect(() => {
    if (!fetchedForRef.current) return
    const prev = fetchedForRef.current
    if (prev.date !== date || prev.timeOfDay !== timeOfDay) {
      handleGetWeather(prev.location, date, timeOfDay)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, timeOfDay])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const simplified = wardrobeItems.map(({ id, name, category, color, occasions, seasons }) => ({
        id, name, category, color, occasions, seasons
      }))
      const anchoredList = anchoredWardrobeIds

      // On regenerate, tell Claude which non-anchored items were just shown so it picks fresh alternatives
      const excludeIds = outfit
        ? Object.values(outfit).filter(id => id && typeof id === 'string' && !anchored.has(id))
        : []

      const result = await generateOutfit({
        items: simplified,
        anchored: anchoredList,
        excludeIds,
        weather,
        timeOfDay,
        occasion,
        date,
        location: location.trim() || undefined,
      })

      // Preserve anchored slots, but respect dress/top+bottom exclusivity in the new result
      setOutfit(prev => {
        if (!prev) return result
        const next = { ...result }
        const resultHasDress = result.dress != null
        for (const slot of SLOTS) {
          if (resultHasDress && (slot === 'top' || slot === 'bottom')) continue
          if (!resultHasDress && slot === 'dress') continue
          if (prev[slot] && anchored.has(prev[slot])) {
            next[slot] = prev[slot]
          }
        }
        return next
      })
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
              onKeyDown={e => e.key === 'Enter' && handleGetWeather(location)}
            />
            <button
              className="btn-outline"
              onClick={() => handleGetWeather()}
              disabled={loadingWeather || !location.trim()}
              style={{ flexShrink: 0 }}
            >
              {loadingWeather ? <span className="spin">◌</span> : 'Go'}
            </button>
          </div>
          {weather && (
            <div className="weather-display" style={{ marginTop: 12 }}>
              <div className="weather-temp">{weather.temp}°F</div>
              <div className="weather-condition">{weather.condition}{weather.season ? ` · ${weather.season}` : ''}</div>
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
        <div style={{ marginBottom: 8, padding: '8px 14px', background: 'var(--ivory)', border: '1px solid var(--border)', borderRadius: 2, fontSize: 12, color: 'var(--taupe)' }}>
          Building outfit around: <strong style={{ color: 'var(--charcoal)' }}>{preAnchoredItem.name}</strong>
        </div>
      )}

      {anchoredWardrobeIds.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: 'var(--ivory)', border: '1px solid var(--border)', borderRadius: 2, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--taupe)', marginRight: 2 }}>⚓ Must include:</span>
          {anchoredWardrobeIds.map(id => {
            const item = wardrobeItems.find(i => i.id === id)
            return item ? (
              <span key={id} className="anchored-chip">
                {item.name}
                {onAnchorToggle && (
                  <button className="anchored-chip-remove" onClick={() => onAnchorToggle(id)} title="Unanchor">×</button>
                )}
              </span>
            ) : null
          })}
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

      {/* Outfit grid — only render slots Claude actually filled */}
      {outfit && (() => {
        const hasDress = outfit.dress != null
        const displaySlots = SLOTS.filter(slot => {
          if ((slot === 'top' || slot === 'bottom') && hasDress) return false
          return outfit[slot] != null
        })
        return (
        <>
          <div className="outfit-grid">
            {displaySlots.map(slot => (
              <OutfitSlot
                key={slot}
                slotName={slot}
                item={itemById(outfit[slot])}
                allItems={wardrobeItems}
                onItemChange={item => handleSlotChange(slot, item)}
                onAnchorToggle={onAnchorToggle}
                isAnchored={anchored.has(outfit[slot])}
                onClearSlot={() => handleSlotChange(slot, null)}
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
        )
      })()}
    </div>
  )
}
