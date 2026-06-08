import { useState, useCallback, useEffect } from 'react'
import { analyzeImage } from '../lib/claude'
import { fileToBase64 } from '../lib/storage'

const CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry', 'sunglasses', 'accessory', 'activewear', 'swimwear', 'other']
const OCCASIONS = ['casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const SEASONS = ['spring', 'summer', 'fall', 'winter']

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 2l10 10M12 2L2 12" />
  </svg>
)

export default function EditItemModal({ item, onClose, onSave }) {
  const [imagePreview, setImagePreview] = useState(item.image_url || null)
  const [imageFile, setImageFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const [name, setName] = useState(item.name || '')
  const [color, setColor] = useState(item.color || '')
  const [size, setSize] = useState(item.size || '')
  const [source, setSource] = useState(item.source || '')
  const [category, setCategory] = useState(item.category || '')
  const [occasions, setOccasions] = useState(item.occasions || [])
  const [seasons, setSeasons] = useState(item.seasons || [])
  const [productUrl, setProductUrl] = useState(item.url || '')
  const [submitting, setSubmitting] = useState(false)

  const applyImageFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    const b64 = await fileToBase64(file)
    setImagePreview(b64)
  }, [])

  useEffect(() => {
    async function handlePaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const itm of items) {
        if (itm.type.startsWith('image/')) {
          const file = itm.getAsFile()
          if (file) await applyImageFile(file)
          break
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [applyImageFile])

  function toggleOccasion(o) {
    setOccasions(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o])
  }

  function toggleSeason(s) {
    setSeasons(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleAnalyzeImage() {
    if (!imagePreview) return
    setAnalyzing(true)
    try {
      const data = await analyzeImage(imagePreview)
      if (data.name) setName(data.name)
      if (data.color) setColor(data.color)
      if (data.category && CATEGORIES.includes(data.category)) setCategory(data.category)
      if (data.occasions?.length) setOccasions(data.occasions.filter(o => OCCASIONS.includes(o)))
      if (data.seasons?.length) setSeasons(data.seasons.filter(s => SEASONS.includes(s)))
    } catch (err) {
      console.error('Image analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const updates = {
        name: name.trim(),
        category,
        color: color.trim(),
        size: size.trim(),
        source: source.trim() || null,
        occasions,
        seasons,
        url: productUrl.trim() || null,
      }
      await onSave(item.id, updates, imageFile)
      onClose()
    } catch (err) {
      console.error('Failed to save:', err)
      alert('Failed to save changes. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 22, fontWeight: 300 }}>
            Edit Item
          </h2>
          <button className="btn-icon" onClick={onClose}><XIcon /></button>
        </div>

        <div className="modal-body">
          {/* Image zone */}
          {imagePreview ? (
            <div className="image-preview">
              <img src={imagePreview} alt="Preview" />
              <button
                className="image-preview-clear"
                onClick={() => { setImagePreview(null); setImageFile(null) }}
              >×</button>
            </div>
          ) : (
            <div
              className={`image-dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files[0]
                if (file) applyImageFile(file)
              }}
            >
              <input
                type="file"
                accept="image/*"
                onChange={e => { if (e.target.files[0]) applyImageFile(e.target.files[0]) }}
              />
              <div className="dropzone-text">Drop image or click to browse</div>
              <div className="dropzone-hint">⌘V to paste</div>
            </div>
          )}

          {imagePreview && (
            <button
              className="btn-outline"
              style={{ width: '100%', marginBottom: 16 }}
              onClick={handleAnalyzeImage}
              disabled={analyzing}
            >
              {analyzing ? <><span className="spin">◌</span> Analyzing…</> : '✦ Auto-categorize from photo'}
            </button>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label">Name</label>
                <input type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Item name" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label">Color</label>
                <input type="text" className="input-field" value={color} onChange={e => setColor(e.target.value)} placeholder="e.g. Navy" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label">Size</label>
                <input type="text" className="input-field" value={size} onChange={e => setSize(e.target.value)} placeholder="e.g. M" />
              </div>
            </div>

            <div className="form-group">
              <label className="label">Brand / Store</label>
              <input type="text" className="input-field" value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. Zara, Net-a-Porter" />
            </div>

            <div className="form-group">
              <label className="label">Category</label>
              <div className="tag-grid">
                {CATEGORIES.map(c => (
                  <button key={c} type="button" className={`tag ${category === c ? 'active' : ''}`} onClick={() => setCategory(category === c ? '' : c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="label">Occasion</label>
              <div className="tag-grid">
                {OCCASIONS.map(o => (
                  <button key={o} type="button" className={`tag ${occasions.includes(o) ? 'active' : ''}`} onClick={() => toggleOccasion(o)}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="label">Season</label>
              <div className="tag-grid">
                {SEASONS.map(s => (
                  <button key={s} type="button" className={`tag ${seasons.includes(s) ? 'active' : ''}`} onClick={() => toggleSeason(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="label">Product Page URL</label>
              <input type="url" className="input-field" value={productUrl} onChange={e => setProductUrl(e.target.value)} placeholder="https://…" />
            </div>

            <button type="submit" className="btn-gold" disabled={submitting}>
              {submitting ? <><span className="spin">◌</span> Saving…</> : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
