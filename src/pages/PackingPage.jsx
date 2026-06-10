import { useState, useMemo } from 'react'
import { generateTripOutfit } from '../lib/claude'

const SLOT_KEYS = ['dress', 'top', 'cardigan', 'bottom', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'accessory']
const OCCASIONS = ['casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']

const CATEGORY_LABELS = {
  dress: 'Dresses',
  top: 'Tops',
  cardigan: 'Cardigans',
  bottom: 'Bottoms',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  bag: 'Bags',
  jewelry: 'Jewelry',
  belt: 'Belts',
  accessory: 'Accessories',
  other: 'Other',
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
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

// ── Item usage map: itemId -> { count, appearances: [{date, time}] } ──────────
function buildItemUsage(trip) {
  const usage = {}
  for (const day of trip.days || []) {
    for (const time of ['day', 'night']) {
      if (day.sameAsDay && time === 'night') continue
      const slots = day[time]?.outfit_slots || {}
      for (const itemId of Object.values(slots)) {
        if (!itemId) continue
        if (!usage[itemId]) usage[itemId] = { count: 0, appearances: [] }
        usage[itemId].count++
        usage[itemId].appearances.push({ date: day.date, time })
      }
    }
  }
  return usage
}

// ── Packing summary stats ─────────────────────────────────────────────────────
function computePackingSummary(trip, wardrobeItems) {
  const uniqueIds = new Set()
  let outfitCount = 0
  const uniqueByCategory = {}

  for (const day of trip.days || []) {
    for (const time of ['day', 'night']) {
      if (day.sameAsDay && time === 'night') continue
      const slots = day[time]?.outfit_slots
      if (!slots) continue
      const hasItems = Object.values(slots).some(Boolean)
      if (!hasItems) continue
      outfitCount++
      for (const itemId of Object.values(slots)) {
        if (itemId) uniqueIds.add(itemId)
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

// ── Packing Summary Panel ─────────────────────────────────────────────────────
function PackingSummaryPanel({ trip, wardrobeItems }) {
  const summary = useMemo(() => computePackingSummary(trip, wardrobeItems), [trip, wardrobeItems])
  if (summary.outfitCount === 0) return null

  const breakdown = [
    ...SLOT_KEYS.filter(cat => summary.uniqueByCategory[cat] > 0)
      .map(cat => `${summary.uniqueByCategory[cat]} ${CATEGORY_LABELS[cat]?.toLowerCase() || cat}`),
    ...(summary.uniqueByCategory['other'] > 0 ? [`${summary.uniqueByCategory['other']} other`] : []),
  ]

  return (
    <div className="packing-summary-panel">
      <div className="packing-summary-headline">
        <span className="packing-summary-count">{summary.uniqueCount}</span>
        <span> unique items</span>
        <span className="packing-summary-sep"> → </span>
        <span className="packing-summary-count">{summary.outfitCount}</span>
        <span> outfits across </span>
        <span className="packing-summary-count">{summary.days}</span>
        <span> {summary.days === 1 ? 'day' : 'days'}</span>
      </div>
      {breakdown.length > 0 && (
        <div className="packing-summary-breakdown">{breakdown.join(' · ')}</div>
      )}
    </div>
  )
}

// ── Mini Outfit Grid with versatility badges ──────────────────────────────────
function MiniOutfitGrid({ outfitSlots, wardrobeItems, itemUsage }) {
  const itemById = id => wardrobeItems.find(i => i.id === id)
  const hasDress = !!outfitSlots?.dress
  const filledSlots = SLOT_KEYS.filter(slot => {
    if ((slot === 'top' || slot === 'bottom') && hasDress) return false
    return !!outfitSlots?.[slot]
  })

  return (
    <div className="day-mini-grid">
      {filledSlots.map(slot => {
        const itemId = outfitSlots[slot]
        const item = itemById(itemId)
        const count = itemUsage?.[itemId]?.count || 0
        const isMuted = count === 1
        const isHighlighted = count >= 3

        return (
          <div
            key={slot}
            className={`day-mini-slot${isMuted ? ' day-mini-slot--muted' : ''}`}
            title={item?.name ? `${item.name}${count > 1 ? ` (×${count})` : ''}` : slot}
          >
            {item?.image_url ? (
              <img src={item.image_url} alt={item.name} />
            ) : (
              <div className="day-mini-slot-label">{item?.name?.slice(0, 10) || slot}</div>
            )}
            {count > 1 && (
              <div className={`day-mini-usage-badge${isHighlighted ? ' day-mini-usage-badge--star' : ''}`}>
                {isHighlighted && '★'}&times;{count}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Day Card ──────────────────────────────────────────────────────────────────
function DayCard({ day, tripDestination, tripDefaultOccasion, wardrobeItems, usedItemIds, itemUsage, onUpdateDay }) {
  const [generatingDay, setGeneratingDay] = useState(false)
  const [generatingNight, setGeneratingNight] = useState(false)

  // Per-day occasion: null means inherit trip default
  const effectiveOccasion = day.occasion != null ? day.occasion : tripDefaultOccasion

  function handleOccasionClick(occ) {
    // toggle: clicking active day-specific occasion clears it back to trip default
    const next = day.occasion === occ ? null : occ
    onUpdateDay(day.date, { ...day, occasion: next })
  }

  async function generateForTime(time) {
    const setter = time === 'day' ? setGeneratingDay : setGeneratingNight
    setter(true)
    try {
      const simplified = wardrobeItems.map(({ id, name, category, color, occasions, seasons }) => ({
        id, name, category, color, occasions, seasons
      }))
      const result = await generateTripOutfit({
        destination: tripDestination,
        date: day.date,
        timeOfDay: time,
        items: simplified,
        usedIds: [...usedItemIds],
        occasion: effectiveOccasion || undefined,
      })
      const slots = {
        dress: result.dress, top: result.top, cardigan: result.cardigan,
        bottom: result.bottom, outerwear: result.outerwear, shoes: result.shoes,
        bag: result.bag, jewelry: result.jewelry, belt: result.belt, accessory: result.accessory,
      }
      const notes = result.notes || ''
      onUpdateDay(day.date, time === 'day'
        ? { ...day, day: { outfit_slots: slots, notes } }
        : { ...day, night: { outfit_slots: slots, notes } })
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

  return (
    <div className="day-card">
      <div className="day-card-header">
        <div className="day-card-date">{formatDate(day.date)}</div>
        <button
          className={`tag ${day.sameAsDay ? 'active' : ''}`}
          onClick={toggleSameDay}
          style={{ cursor: 'pointer' }}
        >
          Same day &amp; night
        </button>
      </div>

      {/* Per-day occasion selector */}
      <div className="day-occasion-row">
        <span className="day-occasion-label">Occasion</span>
        <div className="day-occasion-tags">
          {OCCASIONS.map(occ => (
            <button
              key={occ}
              type="button"
              className={`tag${effectiveOccasion === occ ? ' active' : ''}${day.occasion == null && tripDefaultOccasion === occ ? ' tag--default-hint' : ''}`}
              onClick={() => handleOccasionClick(occ)}
            >
              {occ}
            </button>
          ))}
          {day.occasion != null && (
            <button
              type="button"
              className="tag"
              onClick={() => onUpdateDay(day.date, { ...day, occasion: null })}
              title="Reset to trip default"
              style={{ opacity: 0.65, fontSize: 9 }}
            >
              ↺ reset
            </button>
          )}
        </div>
      </div>

      <div className="day-outfit-columns">
        {/* Day */}
        <div>
          <div className="day-outfit-col-header">
            <div className="day-outfit-label">☀ Day</div>
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
          {day.day?.outfit_slots ? (
            <>
              <MiniOutfitGrid outfitSlots={day.day.outfit_slots} wardrobeItems={wardrobeItems} itemUsage={itemUsage} />
              {day.day.notes && (
                <p style={{ fontFamily: 'Cormorant Garamond', fontStyle: 'italic', fontSize: 12, color: 'var(--taupe)', margin: '8px 0 0', lineHeight: 1.4 }}>
                  {day.day.notes}
                </p>
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

        {/* Night */}
        <div>
          <div className="day-outfit-col-header">
            <div className="day-outfit-label">☽ Night</div>
            {!day.sameAsDay && (
              <button
                className="btn-icon"
                onClick={() => generateForTime('night')}
                disabled={generatingNight}
                title="Regenerate night outfit"
                style={{ fontSize: 12 }}
              >
                {generatingNight ? <span className="spin">◌</span> : '↻'}
              </button>
            )}
          </div>
          {day.sameAsDay ? (
            <div style={{ fontSize: 12, color: 'var(--taupe)', padding: '8px 0', fontStyle: 'italic' }}>
              Same as day outfit
            </div>
          ) : day.night?.outfit_slots ? (
            <>
              <MiniOutfitGrid outfitSlots={day.night.outfit_slots} wardrobeItems={wardrobeItems} itemUsage={itemUsage} />
              {day.night.notes && (
                <p style={{ fontFamily: 'Cormorant Garamond', fontStyle: 'italic', fontSize: 12, color: 'var(--taupe)', margin: '8px 0 0', lineHeight: 1.4 }}>
                  {day.night.notes}
                </p>
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

// ── By Item View ──────────────────────────────────────────────────────────────
function ByItemView({ trip, wardrobeItems }) {
  const itemUsage = useMemo(() => buildItemUsage(trip), [trip])
  const entries = Object.entries(itemUsage).sort((a, b) => b[1].count - a[1].count)

  if (entries.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '48px 20px' }}>
        <p>No outfits generated yet. Switch to <strong>By Day</strong> to generate outfits first.</p>
      </div>
    )
  }

  return (
    <div className="by-item-list">
      {entries.map(([itemId, usage]) => {
        const item = wardrobeItems.find(i => i.id === itemId)
        const isHighlighted = usage.count >= 3
        return (
          <div key={itemId} className={`by-item-row${isHighlighted ? ' by-item-row--star' : ''}`}>
            <div className="by-item-thumb">
              {item?.image_url ? (
                <img src={item.image_url} alt={item.name} />
              ) : (
                <div className="by-item-thumb-empty">{item?.name?.slice(0, 2) || '?'}</div>
              )}
            </div>
            <div className="by-item-info">
              <div className="by-item-name">
                {item?.name || itemId}
                {isHighlighted && <span className="by-item-star-label"> ★</span>}
              </div>
              <div className="by-item-chips">
                {item?.category && (
                  <span className="tag" style={{ cursor: 'default', marginRight: 6, fontSize: 9 }}>
                    {item.category}
                  </span>
                )}
                {usage.appearances.map((a, idx) => (
                  <span key={idx} className="by-item-day-chip">
                    {formatDateShort(a.date).split(',')[0]} {a.time === 'day' ? '☀' : '☽'}
                  </span>
                ))}
              </div>
            </div>
            <div className={`by-item-count${isHighlighted ? ' by-item-count--star' : ''}`}>
              {isHighlighted && '★'}&times;{usage.count}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Checklist View ────────────────────────────────────────────────────────────
function ChecklistView({ trip, wardrobeItems }) {
  const [checked, setChecked] = useState({})

  const grouped = useMemo(() => {
    const uniqueIds = new Set()
    for (const day of trip.days || []) {
      for (const time of ['day', 'night']) {
        if (day.sameAsDay && time === 'night') continue
        const slots = day[time]?.outfit_slots || {}
        for (const id of Object.values(slots)) {
          if (id) uniqueIds.add(id)
        }
      }
    }
    const groups = {}
    for (const id of uniqueIds) {
      const item = wardrobeItems.find(i => i.id === id)
      const cat = item?.category || 'other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push({ id, item })
    }
    return groups
  }, [trip, wardrobeItems])

  const allIds = Object.values(grouped).flat().map(e => e.id)
  const checkedCount = allIds.filter(id => checked[id]).length
  const orderedCats = [...SLOT_KEYS, 'other'].filter(cat => grouped[cat]?.length > 0)

  if (allIds.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '48px 20px' }}>
        <p>No outfits generated yet. Switch to <strong>By Day</strong> to generate outfits first.</p>
      </div>
    )
  }

  return (
    <div className="checklist-view">
      <div className="checklist-header">
        <div className="checklist-progress-track">
          <div
            className="checklist-progress-fill"
            style={{ width: `${allIds.length ? (checkedCount / allIds.length) * 100 : 0}%` }}
          />
        </div>
        <div className="checklist-progress-label">{checkedCount} of {allIds.length} packed</div>
      </div>

      {orderedCats.map(cat => (
        <div key={cat} className="checklist-group">
          <div className="checklist-group-header">
            <span>{CATEGORY_LABELS[cat] || cat}</span>
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
                {item?.image_url ? (
                  <img src={item.image_url} alt={item?.name} />
                ) : (
                  <div className="checklist-thumb-empty">{item?.name?.slice(0, 2) || '?'}</div>
                )}
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

// ── Main PackingPage ──────────────────────────────────────────────────────────
export default function PackingPage({ trips, wardrobeItems, onCreateTrip, onUpdateTrip, onDeleteTrip }) {
  const [activeTrip, setActiveTrip] = useState(null)
  const [showNewTripModal, setShowNewTripModal] = useState(false)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [tripView, setTripView] = useState('by-day') // 'by-day' | 'by-item' | 'checklist'

  // Modal fields
  const [tripName, setTripName] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [defaultOccasion, setDefaultOccasion] = useState('casual')
  const [creating, setCreating] = useState(false)

  const currentTrip = trips.find(t => t.id === activeTrip) || trips[0] || null
  const itemUsage = useMemo(() => (currentTrip ? buildItemUsage(currentTrip) : {}), [currentTrip])

  async function handleCreateTrip(e) {
    e.preventDefault()
    if (!tripName || !destination || !startDate || !endDate) return
    setCreating(true)
    try {
      const dates = getDatesInRange(startDate, endDate)
      const days = dates.map(date => ({ date, day: null, night: null, sameAsDay: false, occasion: null }))
      await onCreateTrip({
        name: tripName,
        destination,
        start_date: startDate,
        end_date: endDate,
        default_occasion: defaultOccasion || null,
        days,
      })
      setShowNewTripModal(false)
      setTripName('')
      setDestination('')
      setStartDate('')
      setEndDate('')
      setDefaultOccasion('casual')
    } catch (err) {
      console.error('Create trip failed:', err)
    } finally {
      setCreating(false)
    }
  }

  function handleUpdateDay(tripId, date, updatedDay) {
    const trip = trips.find(t => t.id === tripId)
    if (!trip) return
    const days = (trip.days || []).map(d => d.date === date ? updatedDay : d)
    onUpdateTrip(tripId, { days })
  }

  function getUsedItemIds(trip) {
    const ids = new Set()
    for (const day of trip.days || []) {
      for (const time of ['day', 'night']) {
        const slots = day[time]?.outfit_slots || {}
        for (const id of Object.values(slots)) {
          if (id) ids.add(id)
        }
      }
    }
    return ids
  }

  async function handleGenerateAll() {
    if (!currentTrip) return
    setGeneratingAll(true)
    const simplified = wardrobeItems.map(({ id, name, category, color, occasions, seasons }) => ({
      id, name, category, color, occasions, seasons
    }))
    const usedIds = new Set()
    const updatedDays = [...(currentTrip.days || [])]
    const tripDefaultOccasion = currentTrip.default_occasion || null

    for (let i = 0; i < updatedDays.length; i++) {
      const day = updatedDays[i]
      const dayOccasion = day.occasion != null ? day.occasion : tripDefaultOccasion

      try {
        const dayResult = await generateTripOutfit({
          destination: currentTrip.destination,
          date: day.date,
          timeOfDay: 'day',
          items: simplified,
          usedIds: [...usedIds],
          occasion: dayOccasion || undefined,
        })
        const daySlots = {
          dress: dayResult.dress, top: dayResult.top, cardigan: dayResult.cardigan,
          bottom: dayResult.bottom, outerwear: dayResult.outerwear, shoes: dayResult.shoes,
          bag: dayResult.bag, jewelry: dayResult.jewelry, belt: dayResult.belt, accessory: dayResult.accessory,
        }
        Object.values(daySlots).forEach(id => id && usedIds.add(id))

        const nightResult = await generateTripOutfit({
          destination: currentTrip.destination,
          date: day.date,
          timeOfDay: 'night',
          items: simplified,
          usedIds: [...usedIds],
          occasion: dayOccasion || undefined,
        })
        const nightSlots = {
          dress: nightResult.dress, top: nightResult.top, cardigan: nightResult.cardigan,
          bottom: nightResult.bottom, outerwear: nightResult.outerwear, shoes: nightResult.shoes,
          bag: nightResult.bag, jewelry: nightResult.jewelry, belt: nightResult.belt, accessory: nightResult.accessory,
        }
        Object.values(nightSlots).forEach(id => id && usedIds.add(id))

        updatedDays[i] = {
          ...day,
          day: { outfit_slots: daySlots, notes: dayResult.notes },
          night: { outfit_slots: nightSlots, notes: nightResult.notes },
        }
      } catch (err) {
        console.error(`Generate failed for ${day.date}:`, err)
      }
    }

    try {
      await onUpdateTrip(currentTrip.id, { days: updatedDays })
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setGeneratingAll(false)
    }
  }

  return (
    <div>
      {/* Trip selector */}
      <div className="trip-selector">
        {trips.map(trip => (
          <button
            key={trip.id}
            className={`trip-tab ${currentTrip?.id === trip.id ? 'active' : ''}`}
            onClick={() => setActiveTrip(trip.id)}
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
          {/* Trip header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="section-title">{currentTrip.name}</h2>
              <div style={{ fontSize: 12, color: 'var(--taupe)', marginTop: 4, letterSpacing: '0.06em' }}>
                {currentTrip.destination} · {currentTrip.start_date} – {currentTrip.end_date}
                {currentTrip.default_occasion && (
                  <> · default: <span style={{ color: 'var(--charcoal)' }}>{currentTrip.default_occasion}</span></>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-gold"
                style={{ width: 'auto' }}
                onClick={handleGenerateAll}
                disabled={generatingAll || wardrobeItems.length === 0}
              >
                {generatingAll ? <><span className="spin">◌</span> <span className="pulse">Generating…</span></> : '✦ Generate All'}
              </button>
              <button
                className="btn-outline"
                onClick={() => { if (confirm(`Delete "${currentTrip.name}"?`)) { onDeleteTrip(currentTrip.id); setActiveTrip(null) } }}
              >
                Delete Trip
              </button>
            </div>
          </div>

          {/* Packing summary */}
          <PackingSummaryPanel trip={currentTrip} wardrobeItems={wardrobeItems} />

          {/* View toggle */}
          <div className="subnav" style={{ marginBottom: 24 }}>
            <button
              className={`subnav-tab ${tripView === 'by-day' ? 'active' : ''}`}
              onClick={() => setTripView('by-day')}
            >
              By Day
            </button>
            <button
              className={`subnav-tab ${tripView === 'by-item' ? 'active' : ''}`}
              onClick={() => setTripView('by-item')}
            >
              By Item
            </button>
            <button
              className={`subnav-tab ${tripView === 'checklist' ? 'active' : ''}`}
              onClick={() => setTripView('checklist')}
            >
              Checklist
            </button>
          </div>

          {/* By Day view */}
          {tripView === 'by-day' && (
            <div className="day-cards">
              {(currentTrip.days || []).map(day => (
                <DayCard
                  key={day.date}
                  day={day}
                  tripDestination={currentTrip.destination}
                  tripDefaultOccasion={currentTrip.default_occasion || null}
                  wardrobeItems={wardrobeItems}
                  usedItemIds={getUsedItemIds(currentTrip)}
                  itemUsage={itemUsage}
                  onUpdateDay={(date, updatedDay) => handleUpdateDay(currentTrip.id, date, updatedDay)}
                />
              ))}
            </div>
          )}

          {/* By Item view */}
          {tripView === 'by-item' && (
            <ByItemView trip={currentTrip} wardrobeItems={wardrobeItems} />
          )}

          {/* Checklist view */}
          {tripView === 'checklist' && (
            <ChecklistView trip={currentTrip} wardrobeItems={wardrobeItems} />
          )}
        </>
      ) : (
        <div className="empty-state">
          <h3>No trips yet</h3>
          <p>Create a trip to start planning your packing list.</p>
          <button className="btn-primary" onClick={() => setShowNewTripModal(true)}>
            + New Trip
          </button>
        </div>
      )}

      {/* New Trip Modal */}
      {showNewTripModal && (
        <div className="modal-overlay" onClick={() => setShowNewTripModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 22, fontWeight: 300 }}>New Trip</h2>
              <button className="btn-icon" onClick={() => setShowNewTripModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreateTrip}>
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
                <div className="form-group">
                  <label className="label">Destination</label>
                  <input
                    type="text"
                    className="input-field"
                    value={destination}
                    onChange={e => setDestination(e.target.value)}
                    placeholder="e.g. Paris, France"
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label">Start Date</label>
                    <input
                      type="date"
                      className="input-field"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label">End Date</label>
                    <input
                      type="date"
                      className="input-field"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="label">Default Occasion</label>
                  <div className="tag-grid" style={{ marginTop: 8 }}>
                    {OCCASIONS.map(occ => (
                      <button
                        key={occ}
                        type="button"
                        className={`tag ${defaultOccasion === occ ? 'active' : ''}`}
                        onClick={() => setDefaultOccasion(prev => prev === occ ? '' : occ)}
                      >
                        {occ}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 20 }}>
                  <button type="submit" className="btn-gold" disabled={creating}>
                    {creating ? <><span className="spin">◌</span> Creating…</> : 'Create Trip'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
