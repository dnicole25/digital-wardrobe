import { useState, useRef, useEffect, useCallback } from 'react'
import { parseItemFromUrl, analyzeImage } from '../lib/claude'
import { fileToBase64 } from '../lib/storage'

const CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry', 'sunglasses', 'accessory', 'activewear', 'swimwear', 'other']
const OCCASIONS = ['casual', 'work', 'date', 'wedding', 'formal event', 'party', 'vacation']
const SEASONS = ['spring', 'summer', 'fall', 'winter']

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 2l10 10M12 2L2 12" />
  </svg>
)

export default function AddItemModal({ onClose, onAdd, mode = 'wardrobe' }) {
  const [inputMode, setInputMode] = useState('upload')
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const [urlInput, setUrlInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseMsg, setParseMsg] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)

  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const [category, setCategory] = useState('')
  const [occasions, setOccasions] = useState([])
  const [seasons, setSeasons] = useState([])
  const [productUrl, setProductUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const dropRef = useRef(null)

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
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
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

  function fillFromData(data) {
    if (data.name) setName(data.name)
    if (data.color) setColor(data.color)
    if (data.category && CATEGORIES.includes(data.category)) setCategory(data.category)
    if (data.occasions?.length) setOccasions(data.occasions.filter(o => OCCASIONS.includes(o)))
    if (data.seasons?.length) setSeasons(data.seasons.filter(s => SEASONS.includes(s)))
  }

  async function handleParseUrl() {
    if (!urlInput.trim()) return
    setParsing(true)
    setParseMsg(null)
    try {
      const data = await parseItemFromUrl(urlInput)
      fillFromData(data)
      if (!productUrl) setProductUrl(urlInput)
      const domain = new URL(urlInput).hostname.replace('www.', '')
      if (data.source || domain) setName(prev => prev || data.name || '')
      setParseMsg({ type: 'success', text: '✓ Details filled in' })
    } catch {
      setParseMsg({ type: 'error', text: '✗ Could not parse URL' })
    } finally {
      setParsing(false)
    }
  }

  async function handleAnalyzeImage() {
    if (!imagePreview) return
    setAnalyzing(true)
    try {
      const data = await analyzeImage(imagePreview)
      fillFromData(data)
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
      const itemData = {
        name: name.trim(),
        category,
        color: color.trim(),
        size: size.trim(),
        occasions,
        seasons,
        url: productUrl.trim() || urlInput.trim() || null,
        image_url: null,
      }

      await onAdd(itemData, imageFile)
      onClose()
    } catch (err) {
      console.error('Failed to add item:', err)
      alert('Failed to add item. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) applyImageFile(file)
  }

  const labelText = mode === 'wishlist' ? 'Add to Wishlist' : 'Add to Wardrobe'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 22, fontWeight: 300 }}>
            {labelText}
          </h2>
          <button className="btn-icon" onClick={onClose}><XIcon /></button>
        </div>

        <div className="modal-body">
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              className={`tag ${inputMode === 'url' ? 'active' : ''}`}
              onClick={() => setInputMode('url')}
            >Add by URL</button>
            <button
              className={`tag ${inputMode === 'upload' ? 'active' : ''}`}
              onClick={() => setInputMode('upload')}
            >Upload Photo</button>
          </div>

          {/* Image Zone */}
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
              ref={dropRef}
              className={`image-dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="image/*"
                onChange={e => { if (e.target.files[0]) applyImageFile(e.target.files[0]) }}
              />
              <div className="dropzone-text">Drop image here or click to browse</div>
              <div className="dropzone-hint">Also try ⌘V to paste from clipboard</div>
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

          {/* URL input (url mode) */}
          {inputMode === 'url' && (
            <div className="form-group">
              <label className="label">Product URL</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  className="input-field"
                  placeholder="https://example.com/product"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleParseUrl()}
                />
                <button
                  className="btn-outline"
                  onClick={handleParseUrl}
                  disabled={parsing || !urlInput.trim()}
                  style={{ flexShrink: 0 }}
                >
                  {parsing ? <span className="spin">◌</span> : 'Parse'}
                </button>
              </div>
              {parseMsg && (
                <div style={{
                  fontSize: 12,
                  marginTop: 6,
                  color: parseMsg.type === 'success' ? '#2e7d32' : '#c0392b'
                }}>
                  {parseMsg.text}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name, Color, Size */}
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Item name"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label">Color</label>
                <input
                  type="text"
                  className="input-field"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  placeholder="e.g. Navy"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label">Size</label>
                <input
                  type="text"
                  className="input-field"
                  value={size}
                  onChange={e => setSize(e.target.value)}
                  placeholder="e.g. M"
                />
              </div>
            </div>

            {/* Category */}
            <div className="form-group">
              <label className="label">Category</label>
              <div className="tag-grid">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`tag ${category === c ? 'active' : ''}`}
                    onClick={() => setCategory(category === c ? '' : c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Occasions */}
            <div className="form-group">
              <label className="label">Occasion</label>
              <div className="tag-grid">
                {OCCASIONS.map(o => (
                  <button
                    key={o}
                    type="button"
                    className={`tag ${occasions.includes(o) ? 'active' : ''}`}
                    onClick={() => toggleOccasion(o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Seasons */}
            <div className="form-group">
              <label className="label">Season</label>
              <div className="tag-grid">
                {SEASONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`tag ${seasons.includes(s) ? 'active' : ''}`}
                    onClick={() => toggleSeason(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Product URL (always shown) */}
            <div className="form-group">
              <label className="label">Product Page URL</label>
              <input
                type="url"
                className="input-field"
                value={productUrl}
                onChange={e => setProductUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            <button
              type="submit"
              className="btn-gold"
              disabled={submitting}
            >
              {submitting ? <><span className="spin">◌</span> Saving…</> : labelText}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
