import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { uploadFile, uploadBase64 } from './lib/storage'
import WardrobePage from './pages/WardrobePage'
import WishlistPage from './pages/WishlistPage'
import PackingPage from './pages/PackingPage'
import InspirationPage from './pages/InspirationPage'

// SVG icons for nav tabs
const HangerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V8l8 8H3l8-8V6.73A2 2 0 0 1 12 3z" />
  </svg>
)
const HeartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)
const LuggageIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="4" y="8" width="16" height="13" rx="2" />
    <path d="M8 8V6a4 4 0 0 1 8 0v2M12 12v4" />
  </svg>
)
const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

function AnchoredBar({ anchored, wardrobeItems, onAnchorToggle, onClearAll }) {
  const anchoredItems = [...anchored]
    .map(id => wardrobeItems.find(i => i.id === id))
    .filter(Boolean)
  if (anchoredItems.length === 0) return null
  return (
    <div className="anchored-bar">
      <div className="anchored-bar-inner">
        <span className="anchored-bar-label">⚓ Anchored</span>
        {anchoredItems.map(item => (
          <span key={item.id} className="anchored-chip">
            {item.name}
            <button className="anchored-chip-remove" onClick={() => onAnchorToggle(item.id)} title="Unanchor">×</button>
          </span>
        ))}
        {anchoredItems.length > 1 && (
          <button className="anchored-bar-clear" onClick={onClearAll}>Clear all</button>
        )}
      </div>
    </div>
  )
}

const NAV_TABS = [
  { key: 'wardrobe', label: 'Wardrobe', icon: <HangerIcon /> },
  { key: 'wishlist', label: 'Wishlist', icon: <HeartIcon /> },
  { key: 'packing', label: 'Packing', icon: <LuggageIcon /> },
  { key: 'inspiration', label: 'Inspiration', icon: <SparkleIcon /> },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('wardrobe')

  const [savedIndicator, setSavedIndicator] = useState(false)
  const [savedKey, setSavedKey] = useState(0)
  const [storageError, setStorageError] = useState(false)
  const [imageWarning, setImageWarning] = useState('')
  const [dataLoadError, setDataLoadError] = useState('')
  const [dataLoading, setDataLoading] = useState(false)

  const [wardrobeItems, setWardrobeItems] = useState([])
  const [wishlistItems, setWishlistItems] = useState([])
  const [savedOutfits, setSavedOutfits] = useState([])
  const [trips, setTrips] = useState([])
  const [inspirationImages, setInspirationImages] = useState([])

  const [anchored, setAnchored] = useState(new Set())

  // Auth
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) loadAllData()
    else {
      setWardrobeItems([])
      setWishlistItems([])
      setSavedOutfits([])
      setTrips([])
      setInspirationImages([])
    }
  }, [user])

  // Re-fetch when the user returns to the tab
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && user) loadAllData()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [user])

  async function loadAllData() {
    setDataLoading(true)
    setDataLoadError('')
    try {
      const [w, wl, o, t, i] = await Promise.all([
        supabase.from('wardrobe_items').select('*').order('created_at', { ascending: false }),
        supabase.from('wishlist_items').select('*').order('created_at', { ascending: false }),
        supabase.from('saved_outfits').select('*').order('created_at', { ascending: false }),
        supabase.from('trips').select('*').order('created_at', { ascending: false }),
        supabase.from('inspiration_images').select('*').order('created_at', { ascending: false }),
      ])

      // Supabase returns errors in the response object, not as thrown exceptions
      const firstError = [w, wl, o, t, i].find(r => r.error)?.error
      if (firstError) {
        setDataLoadError(`Could not load your data: ${firstError.message}`)
        console.error('Supabase load error:', firstError)
        return
      }

      setWardrobeItems(w.data || [])
      setWishlistItems(wl.data || [])
      setSavedOutfits(o.data || [])
      setTrips(t.data || [])
      setInspirationImages(i.data || [])
    } catch (err) {
      setDataLoadError(`Could not load your data: ${err.message}`)
      console.error('Failed to load data:', err)
    } finally {
      setDataLoading(false)
    }
  }

  function showSaved() {
    setSavedKey(k => k + 1)
    setSavedIndicator(true)
    setTimeout(() => setSavedIndicator(false), 2000)
  }

  async function uploadItemImage(imageFile) {
    if (!imageFile || !user) return null
    try {
      return await uploadFile(imageFile, user.id)
    } catch (err) {
      console.warn('Image upload failed:', err)
      setImageWarning(err.message || 'Image upload failed — check Supabase Storage setup.')
      setTimeout(() => setImageWarning(''), 6000)
      if (err.message?.includes('quota') || err.message?.includes('size')) {
        setStorageError(true)
      }
      return null
    }
  }

  // --- Wardrobe CRUD ---
  async function addWardrobeItem(itemData, imageFile) {
    const imageUrl = await uploadItemImage(imageFile)
    const { data, error } = await supabase
      .from('wardrobe_items')
      .insert([{ ...itemData, image_url: imageUrl, user_id: user.id }])
      .select().single()
    if (error) throw new Error(error.message)
    setWardrobeItems(prev => [data, ...prev])
    showSaved()
    return data
  }

  async function editWardrobeItem(id, updates, imageFile) {
    const imageUrl = imageFile ? await uploadItemImage(imageFile) : updates.image_url
    const { data, error } = await supabase
      .from('wardrobe_items')
      .update({ ...updates, image_url: imageUrl })
      .eq('id', id).select().single()
    if (error) throw new Error(error.message)
    setWardrobeItems(prev => prev.map(i => i.id === id ? data : i))
    showSaved()
    return data
  }

  async function deleteWardrobeItem(id) {
    const { error } = await supabase.from('wardrobe_items').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setWardrobeItems(prev => prev.filter(i => i.id !== id))
    setAnchored(prev => { const n = new Set(prev); n.delete(id); return n })
    showSaved()
  }

  // --- Wishlist CRUD ---
  async function addWishlistItem(itemData, imageFile) {
    const imageUrl = await uploadItemImage(imageFile)
    const { data, error } = await supabase
      .from('wishlist_items')
      .insert([{ ...itemData, image_url: imageUrl, user_id: user.id }])
      .select().single()
    if (error) throw new Error(error.message)
    setWishlistItems(prev => [data, ...prev])
    showSaved()
    return data
  }

  async function editWishlistItem(id, updates, imageFile) {
    const imageUrl = imageFile ? await uploadItemImage(imageFile) : updates.image_url
    const { data, error } = await supabase
      .from('wishlist_items')
      .update({ ...updates, image_url: imageUrl })
      .eq('id', id).select().single()
    if (error) throw new Error(error.message)
    setWishlistItems(prev => prev.map(i => i.id === id ? data : i))
    showSaved()
    return data
  }

  async function deleteWishlistItem(id) {
    const { error } = await supabase.from('wishlist_items').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setWishlistItems(prev => prev.filter(i => i.id !== id))
    showSaved()
  }

  async function moveToWardrobe(item) {
    const { id, user_id, created_at, ...itemData } = item
    const { data, error } = await supabase
      .from('wardrobe_items')
      .insert([{ ...itemData, user_id: user.id }])
      .select().single()
    if (error) throw new Error(error.message)
    await supabase.from('wishlist_items').delete().eq('id', id)
    setWardrobeItems(prev => [data, ...prev])
    setWishlistItems(prev => prev.filter(i => i.id !== id))
    showSaved()
  }

  // --- Saved Outfits ---
  async function saveOutfit(outfitData) {
    const { data, error } = await supabase
      .from('saved_outfits')
      .insert([{ ...outfitData, user_id: user.id }])
      .select().single()
    if (error) throw new Error(error.message)
    setSavedOutfits(prev => [data, ...prev])
    showSaved()
  }

  async function deleteOutfit(id) {
    const { error } = await supabase.from('saved_outfits').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setSavedOutfits(prev => prev.filter(o => o.id !== id))
    showSaved()
  }

  // --- Trips ---
  async function createTrip(tripData) {
    const { data, error } = await supabase
      .from('trips')
      .insert([{ ...tripData, user_id: user.id }])
      .select().single()
    if (error) throw new Error(error.message)
    setTrips(prev => [data, ...prev])
    showSaved()
  }

  async function updateTrip(id, updates) {
    const { data, error } = await supabase
      .from('trips')
      .update(updates)
      .eq('id', id).select().single()
    if (error) throw new Error(error.message)
    setTrips(prev => prev.map(t => t.id === id ? data : t))
    showSaved()
  }

  async function deleteTrip(id) {
    const { error } = await supabase.from('trips').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setTrips(prev => prev.filter(t => t.id !== id))
    showSaved()
  }

  // --- Inspiration ---
  async function addInspirationImage(imgData) {
    let imageUrl = imgData.image_url
    if (imgData._imageFile) {
      try {
        imageUrl = await uploadFile(imgData._imageFile, user.id)
      } catch {
        imageUrl = imgData._imageBase64 || null
      }
    }
    const { _imageFile, _imageBase64, ...cleanData } = imgData
    const { data, error } = await supabase
      .from('inspiration_images')
      .insert([{ ...cleanData, image_url: imageUrl, user_id: user.id }])
      .select().single()
    if (error) throw new Error(error.message)
    setInspirationImages(prev => [data, ...prev])
    showSaved()
  }

  async function deleteInspirationImage(id) {
    const { error } = await supabase.from('inspiration_images').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setInspirationImages(prev => prev.filter(i => i.id !== id))
    showSaved()
  }

  // --- Anchor ---
  const handleAnchorToggle = useCallback(id => {
    setAnchored(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleClearAnchored = useCallback(() => setAnchored(new Set()), [])

  // --- Auth handlers ---
  async function handleAuth(e) {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setAuthError(error.message)
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) setAuthError(error.message)
        else setAuthError('✓ Check your email to confirm your account.')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // --- Render ---
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Dana's Digital Wardrobe</h1>
          <p className="login-subtitle">Your personal style curator</p>
          <form className="login-form" onSubmit={handleAuth}>
            <div className="form-group">
              <label className="label">Email</label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Password</label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {authError && (
              <div className="login-error" style={{ color: authError.startsWith('✓') ? '#2e7d32' : '#c0392b' }}>
                {authError}
              </div>
            )}
            <button type="submit" className="btn-gold" disabled={authLoading}>
              {authLoading ? <span className="spin">◌</span> : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            <div className="login-toggle">
              {authMode === 'login' ? (
                <>Don't have an account?{' '}<button type="button" onClick={() => { setAuthMode('signup'); setAuthError('') }}>Sign Up</button></>
              ) : (
                <>Already have an account?{' '}<button type="button" onClick={() => { setAuthMode('login'); setAuthError('') }}>Sign In</button></>
              )}
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <span className="header-title">Dana's Digital Wardrobe</span>
            {dataLoading && (
              <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--sand)' }}>
                <span className="spin" style={{ display: 'inline-block', marginRight: 4 }}>◌</span> Loading…
              </span>
            )}
            {savedIndicator && !dataLoading && (
              <span key={savedKey} className="saved-indicator">✓ Saved</span>
            )}
            {dataLoadError && (
              <span className="storage-error" title={dataLoadError}>⚠ Load error</span>
            )}
            {imageWarning && (
              <span className="storage-error" title={imageWarning}>⚠ Image upload failed</span>
            )}
            {storageError && !imageWarning && !dataLoadError && (
              <span className="storage-error">⚠ Storage error</span>
            )}
          </div>

          <nav className="header-nav">
            {NAV_TABS.map(tab => (
              <button
                key={tab.key}
                className={`nav-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
            <button
              className="btn-icon"
              onClick={handleLogout}
              title="Sign out"
              style={{ marginLeft: 8, color: 'var(--sand)' }}
            >
              ⎋
            </button>
          </nav>
        </div>
      </header>

      <div className="gradient-strip" />

      <AnchoredBar
        anchored={anchored}
        wardrobeItems={wardrobeItems}
        onAnchorToggle={handleAnchorToggle}
        onClearAll={handleClearAnchored}
      />

      <main className="main-content">
        {activeTab === 'wardrobe' && (
          <WardrobePage
            items={wardrobeItems}
            savedOutfits={savedOutfits}
            anchored={anchored}
            onAnchorToggle={handleAnchorToggle}
            onAddItem={addWardrobeItem}
            onEditItem={editWardrobeItem}
            onDeleteItem={deleteWardrobeItem}
            onSaveOutfit={saveOutfit}
            onDeleteOutfit={deleteOutfit}
          />
        )}
        {activeTab === 'wishlist' && (
          <WishlistPage
            items={wishlistItems}
            wardrobeItems={wardrobeItems}
            anchored={anchored}
            onAnchorToggle={handleAnchorToggle}
            onAddItem={addWishlistItem}
            onEditItem={editWishlistItem}
            onDeleteItem={deleteWishlistItem}
            onMoveToWardrobe={moveToWardrobe}
          />
        )}
        {activeTab === 'packing' && (
          <PackingPage
            trips={trips}
            wardrobeItems={wardrobeItems}
            anchored={anchored}
            onAnchorToggle={handleAnchorToggle}
            onCreateTrip={createTrip}
            onUpdateTrip={updateTrip}
            onDeleteTrip={deleteTrip}
          />
        )}
        {activeTab === 'inspiration' && (
          <InspirationPage
            images={inspirationImages}
            userId={user.id}
            onAddImage={addInspirationImage}
            onDeleteImage={deleteInspirationImage}
          />
        )}
      </main>
    </div>
  )
}
