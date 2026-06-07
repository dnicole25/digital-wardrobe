import { supabase } from './supabase'

const BUCKET = 'wardrobe-images'

export async function uploadFile(file, userId) {
  const ext = file.name.split('.').pop() || 'jpg'
  const filename = `${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, { upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return data.publicUrl
}

export async function uploadBase64(base64String, userId) {
  const match = base64String.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid base64 image string')

  const mimeType = match[1]
  const base64Data = match[2]
  const ext = mimeType.split('/')[1] || 'jpg'
  const filename = `${userId}/${Date.now()}.${ext}`

  const byteChars = atob(base64Data)
  const byteArray = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i)
  }
  const blob = new Blob([byteArray], { type: mimeType })

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, blob, { upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return data.publicUrl
}

export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
