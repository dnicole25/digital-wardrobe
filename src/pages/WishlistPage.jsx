import { useState, useRef, useCallback } from 'react'
import ItemCard from '../components/ItemCard'
import AddItemModal from '../components/AddItemModal'
import EditItemModal from '../components/EditItemModal'
import OutfitSlot from '../components/OutfitSlot'
import { findSimilarItems, generateWishlistOutfit, parseItemFromUrl } from '../lib/claude'

const CATEGORIES = ['all', 'top', 'cardigan', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'sunglasses', 'accessory', 'activewear', 'swimwear', 'other']
const ITEM_CATEGORIES = ['top', 'cardigan', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'sunglasses', 'accessory', 'activewear', 'swimwear', 'other']
const OCCASIONS_FILTER = ['all', 'casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const OCCASIONS = ['casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const SEASONS = ['all', 'spring', 'summer', 'fall', 'winter']
const ITEM_SEASONS = ['spring', 'summer', 'fall', 'winter']
const SLOTS = ['dress', 'top', 'cardigan', 'bottom', 'outerwear', 'shoes', 'bag', 'jewelry', 'belt', 'accessory']

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
  const [subTab, setSubTab] = useState('items')

  // Items tab
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterOccasion, setFilterOccasion] = useState('all')
  const [filterSeason, setFilterSeason] = useState('all')
  const [similarLoading, setSimilarLoading] = useState({})
  const [similarResults, setSimilarResults] = useState({})

  // Quick URL add
  const [quickUrl, setQuickUrl] = useState('')
  const [quickParsing, setQuickParsing] = useState(false)
  const [quickError, setQuickError] = useState('')
  const [quickData, setQuickData] = useState(null)
  const [quickSaving, setQuickSaving] = useState(false)

  // Generate tab
  const [occasion, setOccasion] = useState('casual')
  const [timeOfDay, setTimeOfDay] = useState('day')
  const [outfit, setOutfit] = useState(null)
  const [generating, setGenerating] = useState(false)
  const excludedHistoryRef = useRef([])

  // Anchored wishlist items only (not wardrobe)
  const anchoredWishlistIds = [...anchored].filter(id => items.some(i => i.id === id))

  // itemById searches both lists so outfit slots resolve correctly
  const allItemsPool = [...items, ...wardrobeItems]
  const itemById = useCallback(
    id => allItemsPool.find(i => i.id === id) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, wardrobeItems]
  )

  const filtered = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false
    if (filterOccasion !== 'all' && !item.occasions?.includes(filterOccasion)) return false
    if (filterSeason !== 'all' && !item.seasons?.includes(filterSeason)) return false
    return true
  })

  async function handleQuickParse() {
    if (!quickUrl.trim()) return
    setQuickParsing(true)
    setQuickError('')
    setQuickData(null)
    try {
      const data = await parseItemFromUrl(quickUrl)
      setQuickData({
        name: data.name || '',
        color: data.color || '',
        source: data.source || '',
        category: ITEM_CATEGORIES.includes(data.category) ? data.category : '',
        occasions: data.occasions?.filter(o => OCCASIONS.includes(o)) || [],
        seasons: data.seasons?.filter(s => ITEM_SEASONS.includes(s)) || [],
      })
    } catch (err) {
      setQuickError('Could not read that URL — fill in the details manually or try a different link.')
      setQuickData({ name: '', color: '', source: '', category: '', occasions: [], seasons: [] })
    } finally {
      setQuickParsing(false)
    }
  }

  async function handleQuickSave() {
    if (!quickData || !quickData.name.trim() || !quickData.category) return
    setQuickSaving(true)
    try {
      await onAddItem({
        name: quickData.name.trim(),
        category: quickData.category,
        color: quickData.color.trim(),
        source: quickData.source.trim() || null,
        occasions: quickData.occasions,
        seasons: quickData.seasons,
        url: quickUrl.trim() || null,
        image_url: null,
      }, null)
      setQuickUrl('')
      setQuickData(null)
      setQuickError('')
    } catch (err) {
      setQuickError(err.message || 'Failed to save.')
    } finally {
      setQuickSaving(false)
    }
  }

  function handleQuickCancel() {
    setQuickUrl('')
    setQuickData(null)
    setQuickError('')
  }

  async function handleFindSimilar(item) {
    if (similarResults[item.id]) {
      setSimilarResults(prev => { const n = { ...prev }; delete n[item.id]; return n })
      return
    }
    setSimilarLoading(prev => ({ ...prev, [item.id]: true }))
    try {
      const sources = [...new Set([...wardrobeItems, ...items].map(i => i.source).filter(Boolean))]
      const results = await findSimilarItems(item, sources)
      setSimilarResults(prev => ({ ...prev, [item.id]: results }))
    } catch (err) {
      console.error('Similar items failed:', err)
    } finally {
      setSimilarLoading(prev => ({ ...prev, [item.id]: false }))
    }
  }

  async function handleGenerate() {
    if (!anchoredWishlistIds.length) return
    setGenerating(true)
    try {
      const anchoredItems = anchoredWishlistIds
        .map(id => items.find(i => i.id === id))
        .filter(Boolean)
        .map(({ id, name, category, color, occasions, seasons }) => ({ id, name, category, color, occasions, seasons }))

      const simplifiedWardrobe = wardrobeItems.map(({ id, name, category, color, occasions, seasons }) => ({
        id, name, category, color, occasions, seasons
      }))

      let excludeIds
      if (!outfit) {
        excludedHistoryRef.current = []
        excludeIds = []
      } else {
        const currentIds = Object.values(outfit).filter(id => id && typeof id === 'string' && !anchored.has(id))
        excludedHistoryRef.current = [...new Set([...excludedHistoryRef.current, ...currentIds])]
        excludeIds = excludedHistoryRef.current
      }

      const result = await generateWishlistOutfit({ anchoredItems, wardrobeItems: simplifiedWardrobe, occasion, timeOfDay, excludeIds })

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
      console.error('Wishlist outfit generation failed:', err)
      alert('Failed to generate outfit. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleSlotChange(slot, item) {
    setOutfit(prev => ({ ...prev, [slot]: item ? item.id : null }))
  }

  return (
    <div>
      <div className="subnav">
        <button className={`subnav-tab ${subTab === 'items' ? 'active' : ''}`} onClick={() => setSubTab('items')}>
          Wishlist Items
        </button>
        <button className={`subnav-tab ${subTab === 'generate' ? 'active' : ''}`} onClick={() => setSubTab('generate')}>
          Wishlist Generate
        </button>
      </div>

      {/* ── ITEMS TAB ── */}
      {subTab === 'items' && (
        <>
          <div className="page-header">
            <h2 className="section-title">Wishlist</h2>
            <button
              className="btn-outline"
              onClick={() => setShowAddModal(true)}
              style={{ fontSize: 12 }}
              title="Add item by uploading a photo"
            >
              ↑ Upload Photo
            </button>
          </div>

          {/* Quick URL add strip */}
          <div className="quick-add-strip">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                className="input-field"
                placeholder="Paste a product URL to add to wishlist…"
                value={quickUrl}
                onChange={e => setQuickUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !quickParsing && handleQuickParse()}
              />
              <button
                className="btn-primary"
                onClick={handleQuickParse}
                disabled={quickParsing || !quickUrl.trim()}
                style={{ flexShrink: 0 }}
              >
                {quickParsing ? <span className="spin">◌</span> : 'Add'}
              </button>
            </div>
            {quickError && !quickData && (
              <div style={{ fontSize: 12, color: '#c0392b', marginTop: 6 }}>{quickError}</div>
            )}
          </div>

          {/* Inline confirm form */}
          {quickData && (
            <div className="quick-add-confirm">
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--taupe)', marginBottom: 12 }}>
                Review &amp; Save
              </div>

              {quickError && (
                <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 10 }}>{quickError}</div>
              )}

              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">Name</label>
                  <input
                    type="text"
                    className="input-field"
                    value={quickData.name}
                    onChange={e => setQuickData(d => ({ ...d, name: e.target.value }))}
                    placeholder="Item name"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">Color</label>
                  <input
                    type="text"
                    className="input-field"
                    value={quickData.color}
                    onChange={e => setQuickData(d => ({ ...d, color: e.target.value }))}
                    placeholder="e.g. Navy"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">Brand / Store</label>
                  <input
                    type="text"
                    className="input-field"
                    value={quickData.source}
                    onChange={e => setQuickData(d => ({ ...d, source: e.target.value }))}
                    placeholder="e.g. Zara"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 10 }}>
                <label className="label">Category</label>
                <div className="tag-grid">
                  {ITEM_CATEGORIES.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`tag ${quickData.category === c ? 'active' : ''}`}
                      onClick={() => setQuickData(d => ({ ...d, category: d.category === c ? '' : c }))}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row" style={{ marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">Occasion</label>
                  <div className="tag-grid">
                    {OCCASIONS.map(o => (
                      <button
                        key={o}
                        type="button"
                        className={`tag ${quickData.occasions.includes(o) ? 'active' : ''}`}
                        onClick={() => setQuickData(d => ({
                          ...d,
                          occasions: d.occasions.includes(o) ? d.occasions.filter(x => x !== o) : [...d.occasions, o]
                        }))}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">Season</label>
                  <div className="tag-grid">
                    {ITEM_SEASONS.map(s => (
                      <button
                        key={s}
                        type="button"
                        className={`tag ${quickData.seasons.includes(s) ? 'active' : ''}`}
                        onClick={() => setQuickData(d => ({
                          ...d,
                          seasons: d.seasons.includes(s) ? d.seasons.filter(x => x !== s) : [...d.seasons, s]
                        }))}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-gold"
                  onClick={handleQuickSave}
                  disabled={quickSaving || !quickData.name.trim() || !quickData.category}
                  style={{ flex: 1 }}
                >
                  {quickSaving ? <span className="spin">◌</span> : '+ Add to Wishlist'}
                </button>
                <button className="btn-outline" onClick={handleQuickCancel} style={{ flexShrink: 0 }}>
                  Cancel
                </button>
              </div>
              {(!quickData.name.trim() || !quickData.category) && (
                <div style={{ fontSize: 11, color: 'var(--taupe)', marginTop: 6 }}>
                  Name and category are required to save.
                </div>
              )}
            </div>
          )}

          <div className="filter-bar">
            <select className="input-field" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>
            <select className="input-field" value={filterOccasion} onChange={e => setFilterOccasion(e.target.value)}>
              {OCCASIONS_FILTER.map(o => <option key={o} value={o}>{o === 'all' ? 'All Occasions' : o}</option>)}
            </select>
            <select className="input-field" value={filterSeason} onChange={e => setFilterSeason(e.target.value)}>
              {SEASONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Seasons' : s}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <h3>Your wishlist is empty</h3>
              <p>Paste a product URL above, or upload a photo to get started.</p>
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
                  />
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
                          <div className="similar-item-meta">{s.brand} · {s.priceRange}</div>
                          {s.description && <div style={{ fontSize: 11, color: 'var(--taupe)', marginTop: 2 }}>{s.description}</div>}
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
        </>
      )}

      {/* ── GENERATE TAB ── */}
      {subTab === 'generate' && (
        <div className="outfit-generator">
          <div style={{ marginBottom: 28 }}>
            <h2 className="section-title">Wishlist Generate</h2>
            <p style={{ fontSize: 13, color: 'var(--taupe)', marginTop: 4 }}>
              Anchor a wishlist item, then generate a complete outfit from your wardrobe built around it.
            </p>
          </div>

          {/* Anchored wishlist items */}
          {anchoredWishlistIds.length === 0 ? (
            <div style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--ivory)', border: '1px solid var(--border)', borderRadius: 2, fontSize: 13, color: 'var(--taupe)' }}>
              ⚓ No wishlist items anchored. Go to{' '}
              <button
                onClick={() => setSubTab('items')}
                style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}
              >
                Wishlist Items
              </button>
              {' '}and anchor an item to get started.
            </div>
          ) : (
            <div style={{ marginBottom: 16, padding: '8px 14px', background: 'var(--ivory)', border: '1px solid var(--border)', borderRadius: 2, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--taupe)', marginRight: 2 }}>⚓ Building around:</span>
              {anchoredWishlistIds.map(id => {
                const item = items.find(i => i.id === id)
                return item ? (
                  <span key={id} className="anchored-chip">
                    {item.name}
                    <button className="anchored-chip-remove" onClick={() => onAnchorToggle(id)} title="Unanchor">×</button>
                  </span>
                ) : null
              })}
            </div>
          )}

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

          {/* Time of day */}
          <div style={{ marginBottom: 20 }}>
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

          {/* Generate button */}
          <button
            className="btn-gold"
            onClick={handleGenerate}
            disabled={generating || anchoredWishlistIds.length === 0 || wardrobeItems.length === 0}
            style={{ marginBottom: 24 }}
          >
            {generating
              ? <><span className="spin">◌</span> <span className="pulse">Generating…</span></>
              : '✦ Generate Outfit'}
          </button>

          {/* Outfit grid */}
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
                      allItems={allItemsPool}
                      onItemChange={item => handleSlotChange(slot, item)}
                      isAnchored={anchored.has(outfit[slot])}
                      onClearSlot={() => handleSlotChange(slot, null)}
                    />
                  ))}
                </div>
                {outfit.notes && (
                  <p className="outfit-notes">"{outfit.notes}"</p>
                )}
                <div className="outfit-actions">
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
      )}

      {showAddModal && (
        <AddItemModal onClose={() => setShowAddModal(false)} onAdd={onAddItem} mode="wishlist" />
      )}
      {editingItem && (
        <EditItemModal item={editingItem} onClose={() => setEditingItem(null)} onSave={onEditItem} />
      )}
    </div>
  )
}
