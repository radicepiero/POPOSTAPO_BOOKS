import { useCallback, useState } from 'react'
import Cropper, { Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'

interface Props {
  imageSrc: string
  onCropDone: (file: File) => void
  onCancel: () => void
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (err) => reject(err))
    image.src = url
  })
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<File> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Impossibile creare il canvas')
  }

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas vuoto'))
        return
      }
      resolve(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  })
}

export default function ImageCropper({ imageSrc, onCropDone, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  const onCropComplete = useCallback((_: Area, area: Area) => {
    setCroppedAreaPixels(area)
  }, [])

  const confirm = async () => {
    if (!croppedAreaPixels) return
    setProcessing(true)
    try {
      const file = await getCroppedImg(imageSrc, croppedAreaPixels)
      onCropDone(file)
    } catch {
      // eslint-disable-next-line no-alert
      alert('Errore durante il ritaglio. Riprova.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
      }}
    >
      <h3 style={{ color: '#fff', margin: '0 0 0.75rem' }}>Ritaglia l&apos;immagine</h3>
      <div style={{ position: 'relative', flex: 1, borderRadius: '0.5rem', overflow: 'hidden' }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={3 / 4}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <label style={{ color: '#fff', fontSize: '0.9rem', flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: '#555' }}>
          Annulla
        </button>
        <button type="button" onClick={confirm} disabled={processing} style={{ flex: 1 }}>
          {processing ? 'Ritaglio...' : 'Usa questa area'}
        </button>
      </div>
    </div>
  )
}
