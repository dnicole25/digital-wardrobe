import { useState } from 'react'
import ItemCard from '../components/ItemCard'
import AddItemModal from '../components/AddItemModal'
import EditItemModal from '../components/EditItemModal'
import OutfitGenerator from '../components/OutfitGenerator'

const CATEGORIES = ['all', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry', 'sunglasses', 'accessory', 'activewear', 'swimwear', 'other']
const OCCASIONS = ['all', 'casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const SEASONS = ['all', 'spring', 'summer', 'fall', 'winter']

function SavedOutfitCard({ outfit, wardrobeItems, onDelete }) {
  const slots = outfit.outfit_slots || {}
  const slotKeys = ['top', 'bottom', 'outerwear', 'shoes', 'bag', 'accessory']
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
        {slotKeys.map(slot => {
          const item = slots[slot] ? itemById(slots[slot]) : null
          return (
            <div key={slot} className="mini-slot">
              {item?.image_url ? (
                <img src={item.image_url} alt={item.name} />
              ) : item ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 8, color: 'var(--taupe)', textAlign: 'center', padding: 4 }}>
                  {item.name}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 8, color: 'var(--sand)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {slot}
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
