import { useRef, useState } from 'react'
import { fileToBase64 } from '../lib/storage'

export default function InspirationPage({ images, userId, onAddImage, onDeleteImage }) {
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

  function handleDrop(e) {
    e.preventDefault()
    handleFileUpload(e.dataTransfer.files)
  }

  const uploadedImages = images.filter(img => img.source === 'upload' && img.image_url)

  return (
    <div>
      <div className="inspiration-header">
        <h2 className="section-title">Style Inspiration</h2>
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
          {uploading ? <><span className="spin">◌</span> Uploading…</> : '↑ Upload Images'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--taupe)', marginBottom: 24, lineHeight: 1.6 }}>
        Upload style photos — outfit ideas, editorial looks, or anything that captures your aesthetic.
        These images are sent directly to the AI as visual references when generating outfits.
      </p>

      {uploadedImages.length === 0 ? (
        <div
          className="inspiration-dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
          <p style={{ margin: 0, fontFamily: 'Cormorant Garamond', fontSize: 18, color: 'var(--charcoal)' }}>Drop images here</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--taupe)' }}>or click to browse</p>
        </div>
      ) : (
        <div
          className="inspiration-grid"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          {uploadedImages.map(img => (
            <div key={img.id} className="inspiration-card">
              <img src={img.image_url} alt="Inspiration" />
              <button
                className="inspiration-card-remove"
                onClick={() => onDeleteImage(img.id)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
