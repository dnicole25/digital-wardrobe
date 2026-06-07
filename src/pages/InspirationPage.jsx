import { useState, useRef } from 'react'
import { fileToBase64 } from '../lib/storage'

export default function InspirationPage({ images, userId, onAddImage, onDeleteImage }) {
  const [pinterestUrl, setPinterestUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  async function handleFileUpload(files) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        const base64 = await fileToBase64(file)
        await onAddImage({
          image_url: null,
          source: 'upload',
          pinterest_url: null,
          _imageFile: file,
          _imageBase64: base64,
        })
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  function handleAddPinterest() {
    const url = pinterestUrl.trim()
    if (!url) return
    onAddImage({
      image_url: null,
      source: 'pinterest',
      pinterest_url: url,
    })
    setPinterestUrl('')
  }

  function getBoardName(url) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean)
      return parts.slice(-2).join(' / ')
    } catch {
      return 'Pinterest Board'
    }
  }

  return (
    <div>
      <div className="inspiration-header">
        <h2 className="section-title">Style Inspiration</h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Pinterest URL */}
          <div className="inspiration-add-row">
            <input
              type="url"
              className="input-field"
              placeholder="Pinterest board URL"
              value={pinterestUrl}
              onChange={e => setPinterestUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPinterest()}
              style={{ width: 220 }}
            />
            <button className="btn-outline" onClick={handleAddPinterest} disabled={!pinterestUrl.trim()}>
              Add Board
            </button>
          </div>

          {/* Upload button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => handleFileUpload(e.target.files)}
            />
            <button
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <><span className="spin">◌</span> Uploading…</> : '↑ Upload'}
            </button>
          </div>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="empty-state">
          <h3>No inspiration yet</h3>
          <p>Upload images or add Pinterest boards to build your style inspiration.</p>
        </div>
      ) : (
        <div className="inspiration-grid">
          {images.map(img => {
            if (img.source === 'pinterest' || !img.image_url) {
              return (
                <div key={img.id} className="pinterest-card">
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📌</div>
                  <div style={{ fontSize: 13, color: 'var(--charcoal)', fontWeight: 400, marginBottom: 8 }}>
                    {img.pinterest_url ? getBoardName(img.pinterest_url) : 'Pinterest Board'}
                  </div>
                  {img.pinterest_url && (
                    <a
                      href={img.pinterest_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                    >
                      View Board →
                    </a>
                  )}
                  <button
                    onClick={() => onDeleteImage(img.id)}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.9)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      color: 'var(--charcoal)',
                    }}
                  >
                    ✕
                  </button>
                </div>
              )
            }

            return (
              <div key={img.id} className="inspiration-card">
                <img src={img.image_url} alt="Inspiration" />
                <button
                  className="inspiration-card-remove"
                  onClick={() => onDeleteImage(img.id)}
                  title="Remove"
                >
                  ✕
                </button>
                <div className="inspiration-card-source">{img.source}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
