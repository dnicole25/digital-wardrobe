import { useState } from 'react'
import { generateTripOutfit } from '../lib/claude'

const SLOT_KEYS = ['top', 'bottom', 'outerwear', 'shoes', 'bag', 'accessory']

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
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

function MiniOutfitGrid({ outfitSlots, wardrobeItems }) {
  const itemById = id => wardrobeItems.find(i => i.id === id)

  return (
    <div className="day-mini-grid">
      {SLOT_KEYS.map(slot => {
        const item = outfitSlots?.[slot] ? itemById(outfitSlots[slot]) : null
        return (
          <div key={slot} className="day-mini-slot">
            {item?.image_url ? (
              <img src={item.image_url} alt={item.name} />
            ) : item ? (
              <div className="day-mini-slot-label">{item.name?.slice(0, 10)}</div>
            ) : (
              <div className="day-mini-slot-label">{slot}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DayCard({ day, tripDestination, wardrobeItems, usedItemIds, onUpdateDay }) {
  const [generatingDay, setGeneratingDay] = useState(false)
  const [generatingNight, setGeneratingNight] = useState(false)

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
      })
      const slots = { top: result.top, bottom: result.bottom, outerwear: result.outerwear, shoes: result.shoes, bag: result.bag, accessory: result.accessory }
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
          Same day & night
        </button>
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
              <MiniOutfitGrid outfitSlots={day.day.outfit_slots} wardrobeItems={wardrobeItems} />
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
              <MiniOutfitGrid outfitSlots={day.night.outfit_slots} wardrobeItems={wardrobeItems} />
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

export default function PackingPage({ trips, wardrobeItems, onCreateTrip, onUpdateTrip, onDeleteTrip }) {
  const [activeTrip, setActiveTrip] = useState(null)
  const [showNewTripModal, setShowNewTripModal] = useState(false)
  const [generatingAll, setGeneratingAll] = useState(false)

  const [tripName, setTripName] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [creating, setCreating] = useState(false)

  const currentTrip = trips.find(t => t.id === activeTrip) || trips[0] || null

  async function handleCreateTrip(e) {
    e.preventDefault()
    if (!tripName || !destination || !startDate || !endDate) return
    setCreating(true)
    try {
      const dates = getDatesInRange(startDate, endDate)
      const days = dates.map(date => ({ date, day: null, night: null, sameAsDay: false }))
      await onCreateTrip({ name: tripName, destination, start_date: startDate, end_date: endDate, days })
      setShowNewTripModal(false)
      setTripName('')
      setDestination('')
      setStartDate('')
      setEndDate('')
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

    for (let i = 0; i < updatedDays.length; i++) {
      const day = updatedDays[i]
      try {
        const dayResult = await generateTripOutfit({
          destination: currentTrip.destination,
          date: day.date,
          timeOfDay: 'day',
          items: simplified,
          usedIds: [...usedIds],
        })
        const daySlots = { top: dayResult.top, bottom: dayResult.bottom, outerwear: dayResult.outerwear, shoes: dayResult.shoes, bag: dayResult.bag, accessory: dayResult.accessory }
        Object.values(daySlots).forEach(id => id && usedIds.add(id))

        const nightResult = await generateTripOutfit({
          destination: currentTrip.destination,
          date: day.date,
          timeOfDay: 'night',
          items: simplified,
          usedIds: [...usedIds],
        })
        const nightSlots = { top: nightResult.top, bottom: nightResult.bottom, outerwear: nightResult.outerwear, shoes: nightResult.shoes, bag: nightResult.bag, accessory: nightResult.accessory }
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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h2 className="section-title">{currentTrip.name}</h2>
              <div style={{ fontSize: 12, color: 'var(--taupe)', marginTop: 4, letterSpacing: '0.06em' }}>
                {currentTrip.destination} · {currentTrip.start_date} – {currentTrip.end_date}
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

          <div className="day-cards">
            {(currentTrip.days || []).map(day => (
              <DayCard
                key={day.date}
                day={day}
                tripDestination={currentTrip.destination}
                wardrobeItems={wardrobeItems}
                usedItemIds={getUsedItemIds(currentTrip)}
                onUpdateDay={(date, updatedDay) => handleUpdateDay(currentTrip.id, date, updatedDay)}
              />
            ))}
          </div>
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
                  <input type="text" className="input-field" value={tripName} onChange={e => setTripName(e.target.value)} placeholder="e.g. Summer in Europe" required />
                </div>
                <div className="form-group">
                  <label className="label">Destination</label>
                  <input type="text" className="input-field" value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Paris, France" required />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label">Start Date</label>
                    <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label">End Date</label>
                    <input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} required />
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
