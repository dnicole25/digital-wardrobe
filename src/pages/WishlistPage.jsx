import { useState } from 'react'
import ItemCard from '../components/ItemCard'
import AddItemModal from '../components/AddItemModal'
import EditItemModal from '../components/EditItemModal'
import OutfitGenerator from '../components/OutfitGenerator'
import { findSimilarItems } from '../lib/claude'

const CATEGORIES = ['all', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry', 'sunglasses', 'accessory', 'activewear', 'swimwear', 'other']
const OCCASIONS = ['all', 'casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const SEASONS = ['all', 'spring', 'summer', 'fall', 'winter']

export default function WishlistPage({
  items,
  wardrobeItems,
  anchored,
  onAnchorToggle,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onMoveToWardrobe,
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [outfitAnchor, setOutfitAnchor] = useState(null)

  const [filterCategory, setFilterCategory] = useState('all')
  const [filterOccasion, setFilterOccasion] = useState('all')
  const [filterSeason, setFilterSeason] = useState('all')

  const [similarLoading, setSimilarLoading] = useState({})
  const [similarResults, setSimilarResults] = useState({})

  const filtered = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false
    if (filterOccasion !== 'all' && !item.occasions?.includes(filterOccasion)) return false
    if (filterSeason !== 'all' && !item.seasons?.includes(filterSeason)) return false
    return true
  })

  async function handleFindSimilar(item) {
    if (similarResults[item.id]) {
      setSimilarResults(prev => { const n = { ...prev }; delete n[item.id]; return n })
      return
    }
    setSimilarLoading(prev => ({ ...prev, [item.id]: true }))
    try {
      const allItems = [...wardrobeItems, ...items]
      const sources = [...new Set(allItems.map(i => i.source).filter(Boolean))]
      const results = await findSimilarItems(item, sources)
      setSimilarResults(prev => ({ ...prev, [item.id]: results }))
    } catch (err) {
      console.error('Similar items failed:', err)
    } finally {
      setSimilarLoading(prev => ({ ...prev, [item.id]: false }))
    }
  }

  function handleGenerateOutfit(item) {
    setOutfitAnchor(prev => prev?.id === item.id ? null : item)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="section-title">Wishlist</h2>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          + Add Item
        </button>
      </div>

      {/* Outfit generator panel (when anchored from wishlist) */}
      {outfitAnchor && (
        <div style={{
          background: 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: 24,
          marginBottom: 28,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: 20, fontWeight: 300 }}>
              Build Outfit Around This Item
            </h3>
            <button className="btn-icon" onClick={() => setOutfitAnchor(null)}>✕</button>
          </div>
          <OutfitGenerator
            wardrobeItems={wardrobeItems}
            anchored={anchored}
            onAnchorToggle={onAnchorToggle}
            preAnchoredItem={outfitAnchor}
          />
        </div>
      )}

      {/* Filters */}
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
          <h3>Your wishlist is empty</h3>
          <p>Save items you love to your wishlist.</p>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Item
          </button>
        </div>
      ) : (
        <div className="item-grid">
          {filtered.map(item => (
            <div key={item.id}>
              <ItemCard
                item={item}
                onEdit={setEditingItem}
                onDelete={onDeleteItem}
                onAnchorToggle={onAnchorToggle}
                isAnchored={anchored.has(item.id)}
                showWishlistActions
                onMoveToWardrobe={onMoveToWardrobe}
                onFindSimilar={handleFindSimilar}
                onGenerateOutfit={handleGenerateOutfit}
              />

              {/* Similar items panel */}
              {similarLoading[item.id] && (
                <div style={{ padding: '12px', textAlign: 'center' }}>
                  <div className="loading-spinner" />
                </div>
              )}
              {similarResults[item.id] && (
                <div className="similar-items">
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--taupe)', marginBottom: 8 }}>
                    Similar Items
                  </div>
                  {similarResults[item.id].map((s, i) => (
                    <div key={i} className="similar-item">
                      <div className="similar-item-name">{s.name}</div>
                      <div className="similar-item-meta">
                        {s.brand} · {s.priceRange}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: 11, color: 'var(--taupe)', marginTop: 2 }}>{s.description}</div>
                      )}
                      {s.searchUrl && (
                        <a href={s.searchUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--gold)', marginTop: 4, display: 'inline-block' }}>
                          Search →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddItem}
          mode="wishlist"
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
