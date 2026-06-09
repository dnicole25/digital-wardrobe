import { useState } from 'react'
import ItemCard from '../components/ItemCard'
import AddItemModal from '../components/AddItemModal'
import EditItemModal from '../components/EditItemModal'
import OutfitGenerator from '../components/OutfitGenerator'

const CATEGORIES = ['all', 'top', 'cardigan', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'sunglasses', 'accessory', 'activewear', 'swimwear', 'other']
const OCCASIONS = ['all', 'casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const SEASONS = ['all', 'spring', 'summer', 'fall', 'winter']
const ALL_SLOT_KEYS = ['dress', 'top', 'cardigan', 'bottom', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'accessory']

function SavedOutfitCard({ outfit, wardrobeItems, onDelete }) {
  const slots = outfit.outfit_slots || {}
  const hasDress = !!slots.dress
  const filledSlots = ALL_SLOT_KEYS.filter(slot => {
    if ((slot === 'top' || slot === 'bottom') && hasDress) return false
    return !!slots[slot]
  })
  const itemById = id => wardrobeItems.find(i => i.id === id)

  return (
    <div className="saved-outfit-card fade-in">
      <div className="saved-outfit-header">
        <div>
          <div className="saved-outfit-meta">
            {outfit.occasion} · {outfit.time_of_day}
          </div>
          {outfit.date && (
            <div style={{ fontSize: 12, color: 'var(--charcoal)', marginTop: 2 }}>
              {new Date(outfit.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>
        <button
          className="btn-icon"
          onClick={() => onDelete(outfit.id)}
          title="Delete outfit"
          style={{ color: 'var(--sand)' }}
        >
          ✕
        </button>
      </div>

      <div className="saved-outfit-mini-grid">
        {filledSlots.map(slot => {
          const item = itemById(slots[slot])
          return (
            <div key={slot} className="mini-slot">
              {item?.image_url ? (
                <img src={item.image_url} alt={item.name} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 8, color: 'var(--taupe)', textAlign: 'center', padding: 4 }}>
                  {item?.name || slot}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {outfit.notes && (
        <p style={{ fontFamily: 'Cormorant Garamond', fontStyle: 'italic', fontSize: 14, color: 'var(--taupe)', margin: '8px 0 0', lineHeight: 1.4 }}>
          "{outfit.notes}"
        </p>
      )}
    </div>
  )
}

function WeeklyLogTab({ outfitLog, wardrobeItems, onDeleteEntry, onClearAll }) {
  const [clearing, setClearing] = useState(false)

  async function handleClearAll() {
    if (!window.confirm('Clear all logged outfits? Those items will become available again for generation.')) return
    setClearing(true)
    try { await onClearAll() } catch (err) { console.error(err) } finally { setClearing(false) }
  }

  if (outfitLog.length === 0) {
    return (
      <div className="empty-state">
        <h3>No outfits logged yet</h3>
        <p>Generate an outfit and tap "Log Outfit" to record what you wore each day.</p>
      </div>
    )
  }

  // Group by date, most recent first
  const grouped = {}
  for (const entry of outfitLog) {
    if (!grouped[entry.date]) grouped[entry.date] = []
    grouped[entry.date].push(entry)
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 className="section-title">Weekly Log</h2>
        <button
          className="btn-outline"
          onClick={handleClearAll}
          disabled={clearing}
          style={{ fontSize: 11, color: '#c0392b', borderColor: 'rgba(192,57,43,0.3)' }}
        >
          {clearing ? <span className="spin">◌</span> : 'Clear Log'}
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--taupe)', marginBottom: 24, marginTop: -16 }}>
        Items logged here won't be suggested again for the same occasion. Clear the log to reset.
      </p>

      <div className="log-entries">
        {sortedDates.map(date => {
          const entries = grouped[date]
          const weekday = entries[0].weekday
          const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

          return (
            <div key={date} className="log-day">
              <div className="log-day-header">
                <span className="log-day-name">{weekday}</span>
                <span className="log-day-date">{displayDate}</span>
              </div>
              {entries.map(entry => {
                const slots = entry.outfit_slots || {}
                const hasDress = !!slots.dress
                const filledSlots = ALL_SLOT_KEYS.filter(slot => {
                  if ((slot === 'top' || slot === 'bottom') && hasDress) return false
                  return !!slots[slot]
                })
                return (
                  <div key={entry.id} className="log-entry">
                    <div className="log-entry-header">
                      {entry.occasion && <span className="tag gold">{entry.occasion}</span>}
                      <button
                        className="btn-icon"
                        style={{ color: 'var(--sand)', fontSize: 13 }}
                        onClick={() => onDeleteEntry(entry.id)}
                        title="Remove this entry"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="log-mini-grid">
                      {filledSlots.map(slot => {
                        const item = wardrobeItems.find(i => i.id === slots[slot])
                        return (
                          <div key={slot} className="log-mini-slot" title={`${slot}: ${item?.name || 'unknown'}`}>
                            {item?.image_url ? (
                              <img src={item.image_url} alt={item?.name} />
                            ) : (
                              <div className="log-mini-slot-label">{item?.name || slot}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function WardrobePage({
  items,
  savedOutfits,
  anchored,
  onAnchorToggle,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onSaveOutfit,
  onDeleteOutfit,
  inspirationItems = [],
  outfitLog = [],
  onLogOutfit,
  onDeleteLogEntry,
  onClearLog,
}) {
  const [subTab, setSubTab] = useState('items')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const [filterCategory, setFilterCategory] = useState('all')
  const [filterOccasion, setFilterOccasion] = useState('all')
  const [filterSeason, setFilterSeason] = useState('all')

  const filtered = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false
    if (filterOccasion !== 'all' && !item.occasions?.includes(filterOccasion)) return false
    if (filterSeason !== 'all' && !item.seasons?.includes(filterSeason)) return false
    return true
  })

  return (
    <div>
      {/* Sub-navigation */}
      <div className="subnav">
        <button className={`subnav-tab ${subTab === 'items' ? 'active' : ''}`} onClick={() => setSubTab('items')}>
          Items
        </button>
        <button className={`subnav-tab ${subTab === 'generate' ? 'active' : ''}`} onClick={() => setSubTab('generate')}>
          Generate
        </button>
        <button className={`subnav-tab ${subTab === 'saved' ? 'active' : ''}`} onClick={() => setSubTab('saved')}>
          Saved ({savedOutfits.length})
        </button>
        <button className={`subnav-tab ${subTab === 'log' ? 'active' : ''}`} onClick={() => setSubTab('log')}>
          Weekly Log {outfitLog.length > 0 && `(${outfitLog.length})`}
        </button>
      </div>

      {/* Items view */}
      {subTab === 'items' && (
        <>
          <div className="page-header">
            <h2 className="section-title">My Wardrobe</h2>
            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              + Add Item
            </button>
          </div>

          <div className="filter-bar">
            <select className="input-field" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>
            <select className="input-field" value={filterOccasion} onChange={e => setFilterOccasion(e.target.value)}>
              {OCCASIONS.map(o => <option key={o} value={o}>{o === 'all' ? 'All Occasions' : o}</option>)}
            </select>
            <select className="input-field" value={filterSeason} onChange={e => setFilterSeason(e.target.value)}>
              {SEASONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Seasons' : s}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <h3>Your wardrobe awaits</h3>
              <p>Add your first item to get started.</p>
              <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                + Add Item
              </button>
            </div>
          ) : (
            <div className="item-grid">
              {filtered.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={setEditingItem}
                  onDelete={onDeleteItem}
                  onAnchorToggle={onAnchorToggle}
                  isAnchored={anchored.has(item.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Generate view */}
      {subTab === 'generate' && (
        <>
          <div style={{ marginBottom: 28 }}>
            <h2 className="section-title">Generate Outfit</h2>
            <p style={{ fontSize: 13, color: 'var(--taupe)', marginTop: 4 }}>
              Anchor items from your wardrobe, then let AI style the rest.
            </p>
          </div>
          <OutfitGenerator
            wardrobeItems={items}
            anchored={anchored}
            onSaveOutfit={onSaveOutfit}
            onAnchorToggle={onAnchorToggle}
            inspirationItems={inspirationItems}
            outfitLog={outfitLog}
            onLogOutfit={onLogOutfit}
          />
        </>
      )}

      {/* Saved view */}
      {subTab === 'saved' && (
        <>
          <div style={{ marginBottom: 28 }}>
            <h2 className="section-title">Saved Outfits</h2>
          </div>
          {savedOutfits.length === 0 ? (
            <div className="empty-state">
              <h3>No saved outfits yet</h3>
              <p>Generate an outfit and save your favorites.</p>
            </div>
          ) : (
            <div className="saved-outfits-grid">
              {savedOutfits.map(outfit => (
                <SavedOutfitCard
                  key={outfit.id}
                  outfit={outfit}
                  wardrobeItems={items}
                  onDelete={onDeleteOutfit}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Weekly Log view */}
      {subTab === 'log' && (
        <WeeklyLogTab
          outfitLog={outfitLog}
          wardrobeItems={items}
          onDeleteEntry={onDeleteLogEntry}
          onClearAll={onClearLog}
        />
      )}

      {/* Modals */}
      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddItem}
          mode="wardrobe"
        />
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={onEditItem}
        />
      )}
    </div>
  )
}
