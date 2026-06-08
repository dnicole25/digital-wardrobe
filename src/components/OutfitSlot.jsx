import { useState } from 'react'

const SLOT_CATEGORY_MAP = {
  dress: ['dress'],
  top: ['top'],
  bottom: ['bottom'],
  outerwear: ['outerwear'],
  shoes: ['shoes'],
  bag: ['bag'],
  jewelry: ['jewelry'],
  belt: ['belt'],
  accessory: ['accessory', 'sunglasses'],
}

const AnchorIcon = ({ filled }) => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="2.5" r="1.5" />
    <path d="M6 4v9M3 7H1M9 7h2M1 13h10" strokeLinecap="round" />
  </svg>
)

const ChevronLeft = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M6.5 1.5L3.5 5l3 3.5" />
  </svg>
)

const ChevronRight = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3.5 1.5L6.5 5l-3 3.5" />
  </svg>
)

export default function OutfitSlot({ slotName, item, allItems, onItemChange, onAnchorToggle, isAnchored }) {
  const [imageError, setImageError] = useState(false)

  const categoryItems = allItems.filter(i => {
    const allowed = SLOT_CATEGORY_MAP[slotName] || [slotName]
    return allowed.includes(i.category)
  })

  const currentIndex = item ? categoryItems.findIndex(i => i.id === item.id) : -1

  function handlePrev() {
    if (!categoryItems.length) return
    const newIndex = currentIndex <= 0 ? categoryItems.length - 1 : currentIndex - 1
    onItemChange(categoryItems[newIndex])
  }

  function handleNext() {
    if (!categoryItems.length) return
    const newIndex = currentIndex >= categoryItems.length - 1 ? 0 : currentIndex + 1
    onItemChange(categoryItems[newIndex])
  }

  const label = slotName.charAt(0).toUpperCase() + slotName.slice(1)

  return (
    <div className="outfit-slot">
      {item ? (
        item.image_url && !imageError ? (
          <img
            src={item.image_url}
            alt={item.name}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="outfit-slot-empty">
            <span>{item.name || label}</span>
          </div>
        )
      ) : (
        <div className="outfit-slot-empty">
          <span>{label}</span>
        </div>
      )}

      <div className="outfit-slot-label">{label}</div>

      {item && onAnchorToggle && (
        <button
          className={`slot-anchor ${isAnchored ? 'anchored' : ''}`}
          onClick={() => onAnchorToggle(item.id)}
          title={isAnchored ? 'Unanchor' : 'Anchor this item'}
        >
          <AnchorIcon filled={isAnchored} />
        </button>
      )}

      {categoryItems.length > 1 && (
        <div className="outfit-slot-controls">
          <button className="slot-arrow" onClick={handlePrev} title="Previous">
            <ChevronLeft />
          </button>
          <button className="slot-arrow" onClick={handleNext} title="Next">
            <ChevronRight />
          </button>
        </div>
      )}
    </div>
  )
}
