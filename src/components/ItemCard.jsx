import { useState } from 'react'

const AnchorIcon = ({ filled }) => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="2.5" r="1.5" />
    <path d="M6 4v9M3 7H1M9 7h2M1 13h10" strokeLinecap="round" />
  </svg>
)

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M9.5 2.5L11.5 4.5M2 12l2.5-.5L12 4l-2-2L2.5 9.5 2 12z" />
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 4h10M5 4V2.5h4V4M4 4l.5 7.5h5L10 4" />
  </svg>
)

const ExternalLinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M5 2H2v8h8V7M8 2h2v2M10 2L5.5 6.5" />
  </svg>
)

const ImageIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="3" y="5" width="26" height="22" rx="2" />
    <circle cx="11" cy="13" r="3" />
    <path d="M3 22l7-7 5 5 4-4 10 9" />
  </svg>
)

export default function ItemCard({
  item,
  onEdit,
  onDelete,
  onAnchorToggle,
  isAnchored,
  showWishlistActions = false,
  onMoveToWardrobe,
  onFindSimilar,
  onGenerateOutfit,
}) {
  const [imageError, setImageError] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [expanded, setExpanded] = useState(false)

  async function handleDelete(e) {
    if (e) e.stopPropagation()
    if (!window.confirm(`Delete "${item.name || 'this item'}"?`)) return
    setDeleting(true)
    setDeleteError('')
    try {
      await onDelete(item.id)
    } catch (err) {
      setDeleteError(err.message || 'Delete failed')
      setDeleting(false)
    }
  }

  const occasions = item.occasions || []
  const seasons = item.seasons || []

  const hasImage = item.image_url && !imageError

  return (
    <>
      {/* Regular card — click anywhere to expand */}
      <div className="item-card fade-in" onClick={() => setExpanded(true)} style={{ cursor: 'pointer' }}>
        <div className="item-card-image">
          {hasImage ? (
            <img src={item.image_url} alt={item.name} onError={() => setImageError(true)} />
          ) : (
            <div className="item-card-placeholder"><ImageIcon /></div>
          )}

          {onAnchorToggle && (
            <button
              className={`item-card-anchor ${isAnchored ? 'anchored' : ''}`}
              onClick={e => { e.stopPropagation(); onAnchorToggle(item.id) }}
              title={isAnchored ? 'Unanchor' : 'Anchor (always include)'}
            >
              <AnchorIcon filled={isAnchored} />
            </button>
          )}

          {item.source && (
            <div className="item-card-source">{item.source}</div>
          )}
        </div>

        <div className="item-card-body">
          <div className="item-card-name">{item.name || 'Unnamed Item'}</div>
          {item.source && (
            <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--taupe)', marginBottom: 6 }}>
              {item.source}
            </div>
          )}

          <div className="item-card-tags">
            {item.category && <span className="tag">{item.category}</span>}
            {item.color && <span className="tag blush">{item.color}</span>}
            {item.size && <span className="tag">Sz {item.size}</span>}
            {occasions.map(o => <span key={o} className="tag gold">{o}</span>)}
            {seasons.map(s => <span key={s} className="tag">{s}</span>)}
          </div>

          <div className="item-card-actions">
            {showWishlistActions && item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-icon"
                title="Open product page"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLinkIcon />
              </a>
            )}

            <button className="btn-icon" onClick={e => { e.stopPropagation(); onEdit(item) }} title="Edit">
              <EditIcon />
            </button>

            <button
              className="btn-icon"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete"
              style={{ color: deleting ? 'var(--sand)' : undefined }}
            >
              {deleting ? <span className="spin" style={{ fontSize: 12 }}>◌</span> : <TrashIcon />}
            </button>
          </div>
          {deleteError && (
            <div style={{ fontSize: 11, color: '#c0392b', padding: '4px 12px 8px' }}>{deleteError}</div>
          )}
        </div>

        {showWishlistActions && (
          <div className="item-card-wishlist-actions">
            {onMoveToWardrobe && (
              <button
                className="btn-outline"
                style={{ flex: 1, fontSize: '10px', padding: '6px 8px' }}
                onClick={e => { e.stopPropagation(); onMoveToWardrobe(item) }}
                title="Move to wardrobe"
              >
                + Wardrobe
              </button>
            )}
            {onGenerateOutfit && (
              <button
                className="btn-outline"
                style={{ flex: 1, fontSize: '10px', padding: '6px 8px' }}
                onClick={e => { e.stopPropagation(); onGenerateOutfit(item) }}
                title="Build outfit around this item"
              >
                ✦ Outfit
              </button>
            )}
            {onFindSimilar && (
              <button
                className="btn-outline"
                style={{ flex: 1, fontSize: '10px', padding: '6px 8px' }}
                onClick={e => { e.stopPropagation(); onFindSimilar(item) }}
                title="Find similar items"
              >
                ⌕ Similar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded overlay */}
      {expanded && (
        <div className="item-expanded-overlay" onClick={() => setExpanded(false)}>
          <div className="item-expanded-card" onClick={e => e.stopPropagation()}>
            <button className="item-expanded-close" onClick={() => setExpanded(false)} title="Close">✕</button>

            {hasImage ? (
              <div className="item-expanded-image">
                <img src={item.image_url} alt={item.name} onError={() => setImageError(true)} />
              </div>
            ) : (
              <div className="item-expanded-image-placeholder"><ImageIcon /></div>
            )}

            <div className="item-expanded-body">
              <h2 className="item-expanded-name">{item.name || 'Unnamed Item'}</h2>
              {item.source && (
                <div className="item-expanded-source">{item.source}</div>
              )}

              <div className="item-card-tags" style={{ marginBottom: 16 }}>
                {item.category && <span className="tag">{item.category}</span>}
                {item.color && <span className="tag blush">{item.color}</span>}
                {item.size && <span className="tag">Sz {item.size}</span>}
                {occasions.map(o => <span key={o} className="tag gold">{o}</span>)}
                {seasons.map(s => <span key={s} className="tag">{s}</span>)}
              </div>

              <div className="item-expanded-actions">
                {showWishlistActions && item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline"
                    style={{ fontSize: 12 }}
                  >
                    View Product <ExternalLinkIcon />
                  </a>
                )}
                <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => { setExpanded(false); onEdit(item) }}>
                  Edit Item
                </button>
                <button
                  className="btn-outline"
                  style={{ fontSize: 12, color: deleting ? 'var(--sand)' : undefined }}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? <><span className="spin">◌</span> Deleting…</> : 'Delete'}
                </button>
              </div>

              {showWishlistActions && (
                <div className="item-expanded-actions" style={{ marginTop: 8 }}>
                  {onMoveToWardrobe && (
                    <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => { setExpanded(false); onMoveToWardrobe(item) }}>
                      + Add to Wardrobe
                    </button>
                  )}
                  {onGenerateOutfit && (
                    <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => { setExpanded(false); onGenerateOutfit(item) }}>
                      ✦ Generate Outfit
                    </button>
                  )}
                  {onFindSimilar && (
                    <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => { setExpanded(false); onFindSimilar(item) }}>
                      ⌕ Find Similar
                    </button>
                  )}
                </div>
              )}

              {onAnchorToggle && (
                <button
                  className={`btn-outline${isAnchored ? ' active' : ''}`}
                  style={{ width: '100%', marginTop: 8, fontSize: 12 }}
                  onClick={() => { setExpanded(false); onAnchorToggle(item.id) }}
                >
                  <AnchorIcon filled={isAnchored} /> {isAnchored ? 'Unanchor item' : 'Anchor — always include in outfits'}
                </button>
              )}

              {deleteError && (
                <div style={{ fontSize: 11, color: '#c0392b', marginTop: 8 }}>{deleteError}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
