import { useState, useMemo } from 'react'
import { generateTripOutfit, getTripWeather } from '../lib/claude'

const SLOT_KEYS = ['dress', 'top', 'cardigan', 'bottom', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'accessory']

const SLOT_CATEGORY_MAP = {
  dress: ['dress'],
  top: ['top'],
  cardigan: ['cardigan'],
  bottom: ['bottom'],
  outerwear: ['outerwear'],
  shoes: ['shoes'],
  bag: ['bag'],
  jewelry: ['jewelry'],
  belt: ['belt'],
  accessory: ['accessory', 'sunglasses', 'other'],
}

const OCCASIONS = ['casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']

const MAX_TRIP_DAYS = 30

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatDateRange(start, end) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${sStr} – ${eStr}`
}

function getDatesInRange(start, end) {
  const dates = []
  const current = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return dates
}

function weatherIcon(condition) {
  if (!condition) return '?'
  const c = condition.toLowerCase()
  if (c.includes('thunder')) return '⛈'
  if (c.includes('snow') || c.includes('blizzard')) return '❄'
  if (c.includes('freezing')) return '🌨'
  if (c.includes('heavy rain') || c.includes('heavy drizzle')) return '🌧'
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return '🌦'
  if (c.includes('fog')) return '🌫'
  if (c.includes('overcast') || c.includes('cloudy')) return '☁'
  if (c.includes('partly')) return '⛅'
  if (c.includes('mostly clear')) return '🌤'
  if (c.includes('sunny') || c.includes('clear')) return '☀'
  return '🌤'
}

// Compute item use counts across an entire trip (all days, day+night slots)
function computeItemUseCounts(trip) {
  const counts = {}
  for (const day of trip.days || []) {
    for (const time of ['day', 'night']) {
      const slots = day[time]?.outfit_slots || {}
      for (const id of Object.values(slots)) {
        if (id) counts[id] = (counts[id] || 0) + 1
      }
    }
  }
  return counts
}

const VERSATILITY_THRESHOLD = 2

// Compute packing summary stats
function computePackingSummary(trip, wardrobeItems) {
  const uniqueIds = new Set()
  let outfitCount = 0
  const uniqueByCategory = {}
  for (const day of trip.days || []) {
    for (const time of ['day', 'night']) {
      if (day.sameAsDay && time === 'night') continue
      const slots = day[time]?.outfit_slots
      if (!slots) continue
      if (!Object.values(slots).some(Boolean)) continue
      outfitCount++
      for (const id of Object.values(slots)) {
        if (id) uniqueIds.add(id)
      }
    }
  }
  for (const id of uniqueIds) {
    const item = wardrobeItems.find(i => i.id === id)
    const cat = item?.category || 'other'
    uniqueByCategory[cat] = (uniqueByCategory[cat] || 0) + 1
  }
  return { uniqueCount: uniqueIds.size, outfitCount, days: (trip.days || []).length, uniqueByCategory }
}

function PackingSummaryPanel({ trip, wardrobeItems }) {
  const summary = useMemo(() => computePackingSummary(trip, wardrobeItems), [trip, wardrobeItems])
  if (summary.outfitCount === 0) return null
  const breakdown = ['dress', 'top', 'cardigan', 'bottom', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'accessory', 'other']
    .filter(cat => summary.uniqueByCategory[cat] > 0)
    .map(cat => `${summary.uniqueByCategory[cat]} ${cat}${summary.uniqueByCategory[cat] !== 1 ? 's' : ''}`)
  return (
    <div className="packing-summary-panel">
      <div className="packing-summary-headline">
        <span className="packing-summary-count">{summary.uniqueCount}</span> items packed for{' '}
        <span className="packing-summary-count">{summary.outfitCount}</span> outfit{summary.outfitCount !== 1 ? 's' : ''} across{' '}
        <span className="packing-summary-count">{summary.days}</span> day{summary.days !== 1 ? 's' : ''}
      </div>
      {breakdown.length > 0 && (
        <div className="packing-summary-breakdown">{breakdown.join(' · ')}</div>
      )}
    </div>
  )
}

// ChecklistView — unique items by category with packing checkboxes
function ChecklistView({ trip, wardrobeItems }) {
  const [checked, setChecked] = useState({})

  const { grouped, orderedCats } = useMemo(() => {
    const uniqueIds = new Set()
    for (const day of trip.days || []) {
      for (const time of ['day', 'night']) {
        if (day.sameAsDay && time === 'night') continue
        const slots = day[time]?.outfit_slots || {}
        for (const id of Object.values(slots)) if (id) uniqueIds.add(id)
      }
    }
    const g = {}
    for (const id of uniqueIds) {
      const item = wardrobeItems.find(i => i.id === id)
      const cat = item?.category || 'other'
      if (!g[cat]) g[cat] = []
      g[cat].push({ id, item })
    }
    const order = ['dress', 'top', 'cardigan', 'bottom', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'accessory', 'other']
    const oc = Object.keys(g).sort((a, b) => {
      const ai = order.indexOf(a), bi = order.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    return { grouped: g, orderedCats: oc }
  }, [trip, wardrobeItems])

  const allIds = orderedCats.flatMap(cat => grouped[cat].map(e => e.id))
  const checkedCount = allIds.filter(id => checked[id]).length

  if (allIds.length === 0) {
    return (
      <div className="empty-state" style={{ paddingTop: 40 }}>
        <h3>No outfits planned yet</h3>
        <p>Generate outfits for your days to see your packing checklist here.</p>
      </div>
    )
  }

  return (
    <div className="checklist-view">
      <div className="checklist-header">
        <div className="checklist-progress-track">
          <div className="checklist-progress-fill" style={{ width: `${(checkedCount / allIds.length) * 100}%` }} />
        </div>
        <div className="checklist-progress-label">{checkedCount} of {allIds.length} packed</div>
      </div>
      {orderedCats.map(cat => (
        <div key={cat} className="checklist-group">
          <div className="checklist-group-header">
            <span style={{ textTransform: 'capitalize' }}>{cat}s</span>
            <span className="checklist-group-count">{grouped[cat].length}</span>
          </div>
          {grouped[cat].map(({ id, item }) => (
            <label key={id} className={`checklist-item${checked[id] ? ' checklist-item--done' : ''}`}>
              <input
                type="checkbox"
                className="checklist-checkbox"
                checked={!!checked[id]}
                onChange={() => setChecked(prev => ({ ...prev, [id]: !prev[id] }))}
              />
              <div className="checklist-thumb">
                {item?.image_url
                  ? <img src={item.image_url} alt={item?.name} />
                  : <div className="checklist-thumb-empty">{item?.name?.slice(0, 2) || '?'}</div>
                }
              </div>
              <div className="checklist-item-name">{item?.name || id}</div>
              {item?.color && <div className="checklist-item-color">{item.color}</div>}
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

// MiniOutfitGrid — small thumbnail grid for a set of outfit slots
function MiniOutfitGrid({ outfitSlots, wardrobeItems, itemUseCounts, onRemoveSlot, onSwapSlot }) {
  const itemById = id => wardrobeItems.find(i => i.id === id)
  const hasDress = !!outfitSlots?.dress
  const filledSlots = SLOT_KEYS.filter(slot => {
    if ((slot === 'top' || slot === 'bottom') && hasDress) return false
    return !!outfitSlots?.[slot]
  })

  function getCategoryItems(slot) {
    const cats = SLOT_CATEGORY_MAP[slot] || [slot]
    return wardrobeItems.filter(i => cats.includes(i.category))
  }

  function getAdjacentItem(slot, direction) {
    const items = getCategoryItems(slot)
    if (items.length <= 1) return null
    const idx = items.findIndex(i => i.id === outfitSlots[slot])
    const len = items.length
    const newIdx = direction === 'next' ? (idx + 1) % len : (idx - 1 + len) % len
    return items[newIdx]
  }

  if (filledSlots.length === 0) return null

  return (
    <div className="day-mini-grid">
      {filledSlots.map(slot => {
        const itemId = outfitSlots[slot]
        const item = itemById(itemId)
        const useCount = itemUseCounts && itemId ? (itemUseCounts[itemId] || 0) : 0
        const isVersatile = useCount >= VERSATILITY_THRESHOLD
        const prevItem = onSwapSlot ? getAdjacentItem(slot, 'prev') : null
        const nextItem = onSwapSlot ? getAdjacentItem(slot, 'next') : null
        return (
          <div
            key={slot}
            className={`day-mini-slot${isVersatile ? ' versatile' : ''}`}
            title={`${slot}: ${item?.name || 'unknown'}${isVersatile ? ` · worn ${useCount}×` : ''}`}
          >
            {item?.image_url ? (
              <img src={item.image_url} alt={item.name} />
            ) : (
              <div className="day-mini-slot-label">{item?.name?.slice(0, 10) || slot}</div>
            )}
            {isVersatile && (
              <div className="day-mini-slot-badge" title={`Worn ${useCount}× across this trip`}>
                {useCount}×
              </div>
            )}
            {onRemoveSlot && (
              <button
                className="slot-remove-btn"
                onClick={e => { e.stopPropagation(); onRemoveSlot(slot) }}
                title={`Remove ${slot}`}
              >✕</button>
            )}
            {onSwapSlot && prevItem && (
              <button
                className="slot-nav-btn slot-nav-btn--prev"
                onClick={e => { e.stopPropagation(); onSwapSlot(slot, prevItem.id) }}
                title={`Previous: ${prevItem.name}`}
              >‹</button>
            )}
            {onSwapSlot && nextItem && (
              <button
                className="slot-nav-btn slot-nav-btn--next"
                onClick={e => { e.stopPropagation(); onSwapSlot(slot, nextItem.id) }}
                title={`Next: ${nextItem.name}`}
              >›</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// SlotEditor — inline slot editor panel
function SlotEditor({ outfitSlots, wardrobeItems, onSave, onCancel }) {
  const [slots, setSlots] = useState(() => {
    const initial = {}
    for (const key of SLOT_KEYS) {
      initial[key] = outfitSlots?.[key] || ''
    }
    return initial
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const clean = {}
      for (const key of SLOT_KEYS) {
        clean[key] = slots[key] || null
      }
      await onSave(clean)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="trip-slot-editor">
      <p style={{ fontSize: 11, color: 'var(--taupe)', margin: '0 0 12px', letterSpacing: '0.04em' }}>
        Edit outfit slots — only items in each category are shown.
      </p>
      {SLOT_KEYS.map(slot => {
        const categories = SLOT_CATEGORY_MAP[slot] || [slot]
        const options = wardrobeItems.filter(i => categories.includes(i.category))
        return (
          <div key={slot} className="log-edit-row">
            <label className="log-edit-label">{slot}</label>
            <select
              className="input-field"
              value={slots[slot] || ''}
              onChange={e => setSlots(prev => ({ ...prev, [slot]: e.target.value || '' }))}
              style={{ flex: 1, fontSize: 12 }}
            >
              <option value="">— remove —</option>
              {options.map(item => (
                <option key={item.id} value={item.id}>{item.name} ({item.color})</option>
              ))}
            </select>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ flex: 1, fontSize: 11 }}
        >
          {saving ? <span className="spin">◌</span> : 'Save Changes'}
        </button>
        <button
          className="btn-outline"
          onClick={onCancel}
          style={{ flex: 1, fontSize: 11 }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// DayCard — one day's day+night outfit management
function DayCard({ day, trip, wardrobeItems, anchored, packingList, onUpdateDay, itemUseCounts, dragSource, onDragStart, onDragEnd, onDrop }) {
  const [generatingDay, setGeneratingDay] = useState(false)
  const [generatingNight, setGeneratingNight] = useState(false)
  const [editingDay, setEditingDay] = useState(false)
  const [editingNight, setEditingNight] = useState(false)
  const [dragOver, setDragOver] = useState(null) // 'day' | 'night' | null

  const dayWeather = day.weather?.day || null
  const nightWeather = day.weather?.night || null
  const occasion = day.occasion || ''

  function getExistingOutfits(excludeTime) {
    const outfits = []
    for (const d of trip.days || []) {
      for (const t of ['day', 'night']) {
        if (d.date === day.date && t === excludeTime) continue
        const slots = d[t]?.outfit_slots
        if (slots && Object.values(slots).some(Boolean)) {
          outfits.push({ date: d.date, time: t, slots })
        }
      }
    }
    return outfits
  }

  function handleRemoveSlot(time, slot) {
    const outfit = day[time]
    if (!outfit) return
    onUpdateDay(day.date, { ...day, [time]: { ...outfit, outfit_slots: { ...outfit.outfit_slots, [slot]: null } } })
  }

  function handleSwapSlot(time, slot, newItemId) {
    const outfit = day[time]
    if (!outfit) return
    onUpdateDay(day.date, { ...day, [time]: { ...outfit, outfit_slots: { ...outfit.outfit_slots, [slot]: newItemId } } })
  }

  async function generateForTime(time) {
    const setter = time === 'day' ? setGeneratingDay : setGeneratingNight
    setter(true)
    try {
      const simplified = wardrobeItems.map(({ id, name, category, color, occasions, seasons }) => ({
        id, name, category, color, occasions, seasons
      }))
      const weather = time === 'day' ? dayWeather : nightWeather
      const season = weather?.season || ''
      const result = await generateTripOutfit({
        items: simplified,
        anchored: anchored ? [...anchored] : [],
        packingList: packingList || [],
        previousOutfits: getExistingOutfits(time),
        weather,
        occasion,
        timeOfDay: time,
        date: day.date,
        destination: trip.destination,
        season,
      })
      const slots = {
        dress: result.dress || null,
        top: result.top || null,
        cardigan: result.cardigan || null,
        bottom: result.bottom || null,
        outerwear: result.outerwear || null,
        shoes: result.shoes || null,
        bag: result.bag || null,
        jewelry: result.jewelry || null,
        belt: result.belt || null,
        accessory: result.accessory || null,
      }
      const notes = result.notes || ''

      const updatedDay = time === 'day'
        ? { ...day, day: { outfit_slots: slots, notes } }
        : { ...day, night: { outfit_slots: slots, notes } }
      await onUpdateDay(day.date, updatedDay)
    } catch (err) {
      console.error('Trip outfit generation failed:', err)
    } finally {
      setter(false)
    }
  }

  function toggleSameDay() {
    if (day.sameAsDay) {
      onUpdateDay(day.date, { ...day, sameAsDay: false })
    } else {
      onUpdateDay(day.date, { ...day, sameAsDay: true, night: day.day })
    }
  }

  async function handleSaveDayEdit(slots) {
    await onUpdateDay(day.date, { ...day, day: { outfit_slots: slots, notes: day.day?.notes || '' } })
    setEditingDay(false)
  }

  async function handleSaveNightEdit(slots) {
    await onUpdateDay(day.date, { ...day, night: { outfit_slots: slots, notes: day.night?.notes || '' } })
    setEditingNight(false)
  }

  return (
    <div className="trip-day-card">
      <div className="trip-day-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="day-card-date">{formatDate(day.date)}</span>
          {dayWeather && (
            <span style={{ fontSize: 12, color: 'var(--taupe)' }}>
              {weatherIcon(dayWeather.condition)} {dayWeather.temp}°F · {dayWeather.condition}
            </span>
          )}
        </div>
        <button
          className={`tag ${day.sameAsDay ? 'active' : ''}`}
          onClick={toggleSameDay}
          style={{ cursor: 'pointer', flexShrink: 0 }}
        >
          Same day &amp; night
        </button>
      </div>

      {/* Per-day occasion selector */}
      <div className="day-occasion-row">
        {OCCASIONS.map(occ => (
          <button
            key={occ}
            type="button"
            className={`tag${occasion === occ ? ' active' : ''}`}
            onClick={() => onUpdateDay(day.date, { ...day, occasion: occ })}
          >
            {occ}
          </button>
        ))}
      </div>

      <div className="trip-day-columns">
        {/* Day column */}
        <div
          className={`trip-outfit-col${dragSource?.date === day.date && dragSource?.time === 'day' ? ' dragging' : ''}${dragOver === 'day' ? ' drag-over' : ''}`}
          draggable={!!day.day?.outfit_slots && !!Object.values(day.day.outfit_slots).some(Boolean)}
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(day.date, 'day') }}
          onDragEnd={() => { onDragEnd?.(); setDragOver(null) }}
          onDragOver={e => { e.preventDefault(); if (dragSource && !(dragSource.date === day.date && dragSource.time === 'day')) setDragOver('day') }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null) }}
          onDrop={e => { e.preventDefault(); setDragOver(null); onDrop?.(day.date, 'day') }}
        >
          <div className="trip-day-col-header">
            <div className="day-outfit-label">☀ Day</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {day.day?.outfit_slots && (
                <button
                  className="btn-icon"
                  onClick={() => { setEditingDay(v => !v); setEditingNight(false) }}
                  title="Edit slots"
                  style={{ fontSize: 11 }}
                >
                  {editingDay ? 'Close' : 'Edit'}
                </button>
              )}
              <button
                className="btn-icon"
                onClick={() => generateForTime('day')}
                disabled={generatingDay}
                title="Regenerate day outfit"
                style={{ fontSize: 12 }}
              >
                {generatingDay ? <span className="spin">◌</span> : '↻'}
              </button>
            </div>
          </div>

          {day.day?.outfit_slots ? (
            <>
              <MiniOutfitGrid
                outfitSlots={day.day.outfit_slots}
                wardrobeItems={wardrobeItems}
                itemUseCounts={itemUseCounts}
                onRemoveSlot={slot => handleRemoveSlot('day', slot)}
                onSwapSlot={(slot, id) => handleSwapSlot('day', slot, id)}
              />
              {day.day.notes && (
                <p className="trip-outfit-notes">{day.day.notes}</p>
              )}
              <label className="worn-label">
                <input
                  type="checkbox"
                  checked={!!day.day?.worn}
                  onChange={() => onUpdateDay(day.date, { ...day, day: { ...day.day, worn: !day.day?.worn } })}
                />
                <span className={`worn-badge${day.day?.worn ? ' worn-badge--done' : ''}`}>
                  {day.day?.worn ? '✓ Worn' : 'Log as worn'}
                </span>
              </label>
              {editingDay && (
                <SlotEditor
                  outfitSlots={day.day.outfit_slots}
                  wardrobeItems={wardrobeItems}
                  onSave={handleSaveDayEdit}
                  onCancel={() => setEditingDay(false)}
                />
              )}
            </>
          ) : (
            <button
              className="btn-outline"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => generateForTime('day')}
              disabled={generatingDay}
            >
              {generatingDay ? <><span className="spin">◌</span> Generating…</> : '✦ Generate Day'}
            </button>
          )}
        </div>

        {/* Night column */}
        <div
          className={`trip-outfit-col${dragSource?.date === day.date && dragSource?.time === 'night' ? ' dragging' : ''}${dragOver === 'night' ? ' drag-over' : ''}`}
          draggable={!day.sameAsDay && !!day.night?.outfit_slots && !!Object.values(day.night.outfit_slots).some(Boolean)}
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(day.date, 'night') }}
          onDragEnd={() => { onDragEnd?.(); setDragOver(null) }}
          onDragOver={e => { e.preventDefault(); if (dragSource && !(dragSource.date === day.date && dragSource.time === 'night')) setDragOver('night') }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null) }}
          onDrop={e => { e.preventDefault(); setDragOver(null); onDrop?.(day.date, 'night') }}
        >
          <div className="trip-day-col-header">
            <div className="day-outfit-label">☽ Night</div>
            {!day.sameAsDay && (
              <div style={{ display: 'flex', gap: 4 }}>
                {day.night?.outfit_slots && (
                  <button
                    className="btn-icon"
                    onClick={() => { setEditingNight(v => !v); setEditingDay(false) }}
                    title="Edit slots"
                    style={{ fontSize: 11 }}
                  >
                    {editingNight ? 'Close' : 'Edit'}
                  </button>
                )}
                <button
                  className="btn-icon"
                  onClick={() => generateForTime('night')}
                  disabled={generatingNight}
                  title="Regenerate night outfit"
                  style={{ fontSize: 12 }}
                >
                  {generatingNight ? <span className="spin">◌</span> : '↻'}
                </button>
              </div>
            )}
          </div>

          {day.sameAsDay ? (
            <div style={{ fontSize: 12, color: 'var(--taupe)', padding: '8px 0', fontStyle: 'italic' }}>
              Same as day outfit
            </div>
          ) : day.night?.outfit_slots ? (
            <>
              <MiniOutfitGrid
                outfitSlots={day.night.outfit_slots}
                wardrobeItems={wardrobeItems}
                itemUseCounts={itemUseCounts}
                onRemoveSlot={slot => handleRemoveSlot('night', slot)}
                onSwapSlot={(slot, id) => handleSwapSlot('night', slot, id)}
              />
              {day.night.notes && (
                <p className="trip-outfit-notes">{day.night.notes}</p>
              )}
              <label className="worn-label">
                <input
                  type="checkbox"
                  checked={!!day.night?.worn}
                  onChange={() => onUpdateDay(day.date, { ...day, night: { ...day.night, worn: !day.night?.worn } })}
                />
                <span className={`worn-badge${day.night?.worn ? ' worn-badge--done' : ''}`}>
                  {day.night?.worn ? '✓ Worn' : 'Log as worn'}
                </span>
              </label>
              {editingNight && (
                <SlotEditor
                  outfitSlots={day.night.outfit_slots}
                  wardrobeItems={wardrobeItems}
                  onSave={handleSaveNightEdit}
                  onCancel={() => setEditingNight(false)}
                />
              )}
            </>
          ) : (
            <button
              className="btn-outline"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => generateForTime('night')}
              disabled={generatingNight}
            >
              {generatingNight ? <><span className="spin">◌</span> Generating…</> : '✦ Generate Night'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// NewTripModal — trip creation form
function NewTripModal({ onClose, onSubmit }) {
  const [tripName, setTripName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [occasion, setOccasion] = useState('vacation')
  const [creating, setCreating] = useState(false)
  const [fetchingWeather, setFetchingWeather] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tripName || !city || !startDate || !endDate) return
    setError('')

    const destination = country ? `${city}, ${country}` : city
    const dates = getDatesInRange(startDate, endDate)

    if (dates.length > MAX_TRIP_DAYS) {
      setError(`Trip is too long (${dates.length} days). Maximum is ${MAX_TRIP_DAYS} days.`)
      return
    }

    if (dates.length === 0) {
      setError('End date must be on or after start date.')
      return
    }

    setCreating(true)
    setFetchingWeather(true)

    let weatherByDate = {}
    try {
      weatherByDate = await getTripWeather(destination, startDate, endDate)
    } catch (err) {
      console.warn('Weather fetch failed, continuing without weather:', err)
    } finally {
      setFetchingWeather(false)
    }

    const days = dates.map(date => ({
      date,
      occasion,
      weather: weatherByDate[date] || null,
      day: null,
      night: null,
      sameAsDay: false,
    }))

    try {
      await onSubmit({ name: tripName, destination, start_date: startDate, end_date: endDate, days })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create trip.')
      setCreating(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 22, fontWeight: 300 }}>New Trip</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label">Trip Name</label>
              <input
                type="text"
                className="input-field"
                value={tripName}
                onChange={e => setTripName(e.target.value)}
                placeholder="e.g. Summer in Europe"
                required
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">City</label>
                <input
                  type="text"
                  className="input-field"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="Paris"
                  required
                />
              </div>
              <div>
                <label className="label">Country</label>
                <input
                  type="text"
                  className="input-field"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  placeholder="France"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">Arrival Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Departure Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Occasion</label>
              <div className="occasion-tags" style={{ marginBottom: 0 }}>
                {OCCASIONS.map(occ => (
                  <button
                    key={occ}
                    type="button"
                    className={`tag ${occasion === occ ? 'active' : ''}`}
                    onClick={() => setOccasion(occ)}
                  >
                    {occ}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <p style={{ color: '#c0392b', fontSize: 12, marginBottom: 12 }}>{error}</p>
            )}
            {startDate && endDate && !error && (() => {
              const n = getDatesInRange(startDate, endDate).length
              if (n > MAX_TRIP_DAYS) return null
              return (
                <p style={{ fontSize: 11, color: 'var(--taupe)', marginBottom: 12 }}>
                  {n} day{n !== 1 ? 's' : ''} · Weather will be fetched automatically
                </p>
              )
            })()}
            <button type="submit" className="btn-gold" disabled={creating}>
              {fetchingWeather
                ? <><span className="spin">◌</span> Fetching weather for your trip…</>
                : creating
                  ? <><span className="spin">◌</span> Creating…</>
                  : 'Create Trip'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ByItemView — lists every item used in the trip, highlights versatile ones (2+)
function ByItemView({ trip, wardrobeItems, itemUseCounts }) {
  const itemById = id => wardrobeItems.find(i => i.id === id)

  // Collect all used item IDs
  const allItemIds = new Set()
  for (const day of trip.days || []) {
    for (const time of ['day', 'night']) {
      const slots = day[time]?.outfit_slots || {}
      for (const id of Object.values(slots)) {
        if (id) allItemIds.add(id)
      }
    }
  }

  if (allItemIds.size === 0) {
    return (
      <div className="empty-state" style={{ paddingTop: 40 }}>
        <h3>No outfits planned yet</h3>
        <p>Generate outfits for your days to see a packing summary here.</p>
      </div>
    )
  }

  // Sort: versatile items first, then alphabetically by name
  const sortedIds = [...allItemIds].sort((a, b) => {
    const ca = itemUseCounts[a] || 0
    const cb = itemUseCounts[b] || 0
    if (cb !== ca) return cb - ca
    const ia = itemById(a)
    const ib = itemById(b)
    return (ia?.name || '').localeCompare(ib?.name || '')
  })

  // Group by category
  const byCategory = {}
  for (const id of sortedIds) {
    const item = itemById(id)
    const cat = item?.category || 'other'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(id)
  }

  const categoryOrder = ['dress', 'top', 'cardigan', 'bottom', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'accessory', 'other']
  const sortedCategories = Object.keys(byCategory).sort((a, b) => {
    const ai = categoryOrder.indexOf(a)
    const bi = categoryOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div className="trip-by-item-view">
      <p className="trip-by-item-intro">
        {sortedIds.length} item{sortedIds.length !== 1 ? 's' : ''} across {trip.days?.length || 0} day{(trip.days?.length || 0) !== 1 ? 's' : ''}.
        {' '}Items worn 2+ times are highlighted.
      </p>
      {sortedCategories.map(cat => (
        <div key={cat} className="trip-by-item-category">
          <div className="trip-by-item-cat-label">{cat}</div>
          <div className="trip-by-item-grid">
            {byCategory[cat].map(id => {
              const item = itemById(id)
              const count = itemUseCounts[id] || 0
              const isVersatile = count >= VERSATILITY_THRESHOLD
              return (
                <div
                  key={id}
                  className={`trip-by-item-card${isVersatile ? ' versatile' : ''}`}
                  title={`${item?.name || 'Unknown'} · worn ${count} time${count !== 1 ? 's' : ''}`}
                >
                  <div className="trip-by-item-thumb">
                    {item?.image_url ? (
                      <img src={item.image_url} alt={item.name} />
                    ) : (
                      <div className="trip-by-item-thumb-label">{item?.name?.slice(0, 12) || '?'}</div>
                    )}
                    {isVersatile && (
                      <div className="trip-by-item-versatile-badge" title={`Worn ${count}× — versatile pick!`}>
                        ★ {count}×
                      </div>
                    )}
                  </div>
                  <div className="trip-by-item-name">{item?.name || 'Unknown'}</div>
                  <div className="trip-by-item-count">
                    {count}× · {item?.color || ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TripPlanner({ trips, wardrobeItems, anchored, onAnchorToggle, onCreateTrip, onUpdateTrip, onDeleteTrip }) {
  const [activeTripId, setActiveTripId] = useState(null)
  const [showNewTripModal, setShowNewTripModal] = useState(false)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [generateProgress, setGenerateProgress] = useState({ current: 0, total: 0 })
  const [tripView, setTripView] = useState('by-day') // 'by-day' | 'by-item' | 'checklist'
  const [dragSource, setDragSource] = useState(null)  // { date, time }

  const currentTrip = trips.find(t => t.id === activeTripId) || trips[0] || null

  function handleUpdateDay(tripId, date, updatedDay) {
    const trip = trips.find(t => t.id === tripId)
    if (!trip) return
    const days = (trip.days || []).map(d => d.date === date ? updatedDay : d)
    return onUpdateTrip(tripId, { days })
  }

  function handleDragStart(date, time) {
    setDragSource({ date, time })
  }

  function handleDragEnd() {
    setDragSource(null)
  }

  function handleDrop(targetDate, targetTime) {
    if (!dragSource || !currentTrip) { setDragSource(null); return }
    if (dragSource.date === targetDate && dragSource.time === targetTime) { setDragSource(null); return }

    const sourceDay = currentTrip.days.find(d => d.date === dragSource.date)
    const targetDay = currentTrip.days.find(d => d.date === targetDate)
    if (!sourceDay || !targetDay) { setDragSource(null); return }

    const srcTime = dragSource.time
    const sourceOutfit = sourceDay[srcTime]
    const targetOutfit = targetDay[targetTime]

    const updatedDays = currentTrip.days.map(d => {
      if (d.date === dragSource.date && d.date === targetDate) {
        // Same date card — swap day/night
        return { ...d, [srcTime]: targetOutfit, [targetTime]: sourceOutfit }
      }
      if (d.date === dragSource.date) return { ...d, [srcTime]: targetOutfit }
      if (d.date === targetDate) return { ...d, [targetTime]: sourceOutfit }
      return d
    })

    onUpdateTrip(currentTrip.id, { days: updatedDays })
    setDragSource(null)
  }

  // Collect all item IDs currently in the trip (packing list)
  function getPackingList(trip) {
    const ids = new Set()
    for (const day of trip.days || []) {
      for (const time of ['day', 'night']) {
        const slots = day[time]?.outfit_slots || {}
        for (const id of Object.values(slots)) {
          if (id) ids.add(id)
        }
      }
    }
    return [...ids]
  }

  async function handleGenerateAll() {
    if (!currentTrip) return
    setGeneratingAll(true)

    const simplified = wardrobeItems.map(({ id, name, category, color, occasions, seasons }) => ({
      id, name, category, color, occasions, seasons
    }))

    const days = currentTrip.days || []
    // When sameAsDay is set, night is copied from day — only 1 API call needed per day
    const totalSteps = days.reduce((sum, d) => sum + (d.sameAsDay ? 1 : 2), 0)
    setGenerateProgress({ current: 0, total: totalSteps })

    const updatedDays = [...days]
    const packingIds = new Set()
    const previousOutfits = []
    const RECENT_LIMIT = 10  // keep prompt length stable across long trips
    let step = 0

    for (let i = 0; i < updatedDays.length; i++) {
      const day = updatedDays[i]
      const occasion = day.occasion || ''

      // ── Day outfit ──────────────────────────────────────────────────────────
      let daySlots = null
      let dayNotes = ''
      step++
      setGenerateProgress({ current: step, total: totalSteps })
      try {
        const dayWeather = day.weather?.day || null
        const season = dayWeather?.season || ''
        const dayResult = await generateTripOutfit({
          items: simplified,
          anchored: anchored ? [...anchored] : [],
          packingList: [...packingIds],
          previousOutfits: previousOutfits.slice(-RECENT_LIMIT),
          weather: dayWeather,
          occasion,
          timeOfDay: 'day',
          date: day.date,
          destination: currentTrip.destination,
          season,
        })
        daySlots = {
          dress: dayResult.dress || null,
          top: dayResult.top || null,
          cardigan: dayResult.cardigan || null,
          bottom: dayResult.bottom || null,
          outerwear: dayResult.outerwear || null,
          shoes: dayResult.shoes || null,
          bag: dayResult.bag || null,
          jewelry: dayResult.jewelry || null,
          belt: dayResult.belt || null,
          accessory: dayResult.accessory || null,
        }
        dayNotes = dayResult.notes || ''
        Object.values(daySlots).forEach(id => id && packingIds.add(id))
        previousOutfits.push({ date: day.date, time: 'day', slots: daySlots })
      } catch (err) {
        console.error(`Day outfit failed for ${day.date}:`, err)
      }

      // ── Night outfit — skip when sameAsDay, just copy day ──────────────────
      let nightSlots = null
      let nightNotes = ''
      if (day.sameAsDay) {
        nightSlots = daySlots
        nightNotes = dayNotes
      } else {
        step++
        setGenerateProgress({ current: step, total: totalSteps })
        try {
          const nightWeather = day.weather?.night || null
          const nightSeason = nightWeather?.season || day.weather?.day?.season || ''
          const nightResult = await generateTripOutfit({
            items: simplified,
            anchored: anchored ? [...anchored] : [],
            packingList: [...packingIds],
            previousOutfits: previousOutfits.slice(-RECENT_LIMIT),
            weather: nightWeather,
            occasion,
            timeOfDay: 'night',
            date: day.date,
            destination: currentTrip.destination,
            season: nightSeason,
          })
          nightSlots = {
            dress: nightResult.dress || null,
            top: nightResult.top || null,
            cardigan: nightResult.cardigan || null,
            bottom: nightResult.bottom || null,
            outerwear: nightResult.outerwear || null,
            shoes: nightResult.shoes || null,
            bag: nightResult.bag || null,
            jewelry: nightResult.jewelry || null,
            belt: nightResult.belt || null,
            accessory: nightResult.accessory || null,
          }
          nightNotes = nightResult.notes || ''
          Object.values(nightSlots).forEach(id => id && packingIds.add(id))
          previousOutfits.push({ date: day.date, time: 'night', slots: nightSlots })
        } catch (err) {
          console.error(`Night outfit failed for ${day.date}:`, err)
        }
      }

      // Save whatever succeeded for this day
      updatedDays[i] = {
        ...day,
        ...(daySlots ? { day: { outfit_slots: daySlots, notes: dayNotes } } : {}),
        ...(nightSlots ? { night: { outfit_slots: nightSlots, notes: nightNotes } } : {}),
      }
    }

    try {
      await onUpdateTrip(currentTrip.id, { days: updatedDays })
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setGeneratingAll(false)
      setGenerateProgress({ current: 0, total: 0 })
    }
  }

  // Anchored items for display
  const anchoredItems = anchored
    ? [...anchored].map(id => wardrobeItems.find(i => i.id === id)).filter(Boolean)
    : []

  const tripDayCount = currentTrip ? getDatesInRange(currentTrip.start_date, currentTrip.end_date).length : 0
  const packingList = currentTrip ? getPackingList(currentTrip) : []
  const itemUseCounts = currentTrip ? computeItemUseCounts(currentTrip) : {}

  return (
    <div>
      {/* Trip tab bar */}
      <div className="trip-selector">
        {trips.map(trip => (
          <button
            key={trip.id}
            className={`trip-tab ${currentTrip?.id === trip.id ? 'active' : ''}`}
            onClick={() => setActiveTripId(trip.id)}
          >
            {trip.name}
          </button>
        ))}
        <button className="trip-tab" onClick={() => setShowNewTripModal(true)}>
          + New Trip
        </button>
      </div>

      {currentTrip ? (
        <>
          {/* Active trip header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">{currentTrip.name}</h2>
              <div style={{ fontSize: 12, color: 'var(--taupe)', marginTop: 4, letterSpacing: '0.06em' }}>
                {currentTrip.destination} &nbsp;·&nbsp;
                {formatDateRange(currentTrip.start_date, currentTrip.end_date)} &nbsp;·&nbsp;
                {currentTrip.days?.[0]?.occasion || '—'} &nbsp;·&nbsp;
                {tripDayCount} day{tripDayCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                className="btn-gold"
                style={{ width: 'auto' }}
                onClick={handleGenerateAll}
                disabled={generatingAll || wardrobeItems.length === 0}
              >
                {generatingAll
                  ? <><span className="spin">◌</span> <span className="pulse">Generating day {generateProgress.current} of {generateProgress.total}…</span></>
                  : '✦ Generate All Days'}
              </button>
              <button
                className="btn-outline"
                onClick={() => {
                  if (confirm(`Delete "${currentTrip.name}"?`)) {
                    onDeleteTrip(currentTrip.id)
                    setActiveTripId(null)
                  }
                }}
              >
                Delete Trip
              </button>
            </div>
          </div>

          {/* Progress bar during generate all */}
          {generatingAll && generateProgress.total > 0 && (
            <div className="trip-progress-bar">
              <div
                className="trip-progress-fill"
                style={{ width: `${(generateProgress.current / generateProgress.total) * 100}%` }}
              />
            </div>
          )}

          {/* Weather overview row */}
          {currentTrip.days?.some(d => d.weather?.day) && (
            <div className="trip-weather-overview">
              {currentTrip.days.map(day => (
                <div key={day.date} className="trip-weather-badge">
                  <div style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--taupe)', marginBottom: 2 }}>
                    {formatDateShort(day.date)}
                  </div>
                  <div style={{ fontSize: 18 }}>{weatherIcon(day.weather?.day?.condition)}</div>
                  <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--black)' }}>
                    {day.weather?.day?.temp != null ? `${day.weather.day.temp}°` : '—'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--taupe)', letterSpacing: '0.04em', textAlign: 'center', maxWidth: 80 }}>
                    {day.weather?.day?.condition || ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Anchored items reminder */}
          {anchoredItems.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '8px 12px', background: 'var(--ivory)', border: '1px solid var(--border)', borderRadius: 2, marginBottom: 16 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--taupe)', flexShrink: 0 }}>
                ⚓ Must include:
              </span>
              {anchoredItems.map(item => (
                <span key={item.id} className="anchored-chip">
                  {item.name}
                  <button className="anchored-chip-remove" onClick={() => onAnchorToggle(item.id)} title="Unanchor">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Packing summary */}
          <PackingSummaryPanel trip={currentTrip} wardrobeItems={wardrobeItems} />

          {/* View toggle */}
          <div className="trip-view-toggle">
            <button
              className={`trip-view-btn${tripView === 'by-day' ? ' active' : ''}`}
              onClick={() => setTripView('by-day')}
            >
              By Day
            </button>
            <button
              className={`trip-view-btn${tripView === 'by-item' ? ' active' : ''}`}
              onClick={() => setTripView('by-item')}
            >
              By Item
            </button>
            <button
              className={`trip-view-btn${tripView === 'checklist' ? ' active' : ''}`}
              onClick={() => setTripView('checklist')}
            >
              Checklist
            </button>
          </div>

          {/* By Day view — day cards */}
          {tripView === 'by-day' && (
            <div className="day-cards">
              {(currentTrip.days || []).map(day => (
                <DayCard
                  key={day.date}
                  day={day}
                  trip={currentTrip}
                  wardrobeItems={wardrobeItems}
                  anchored={anchored}
                  packingList={packingList}
                  onUpdateDay={(date, updatedDay) => handleUpdateDay(currentTrip.id, date, updatedDay)}
                  itemUseCounts={itemUseCounts}
                  dragSource={dragSource}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          )}

          {/* By Item view */}
          {tripView === 'by-item' && (
            <ByItemView
              trip={currentTrip}
              wardrobeItems={wardrobeItems}
              itemUseCounts={itemUseCounts}
            />
          )}

          {/* Checklist view */}
          {tripView === 'checklist' && (
            <ChecklistView
              trip={currentTrip}
              wardrobeItems={wardrobeItems}
            />
          )}
        </>
      ) : (
        <div className="empty-state">
          <h3>No trips yet</h3>
          <p>Create your first trip to start planning outfits and building your packing list.</p>
          <button className="btn-primary" onClick={() => setShowNewTripModal(true)}>
            + New Trip
          </button>
        </div>
      )}

      {showNewTripModal && (
        <NewTripModal
          onClose={() => setShowNewTripModal(false)}
          onSubmit={async (tripData) => {
            await onCreateTrip(tripData)
          }}
        />
      )}
    </div>
  )
}
