import { useState } from 'react'
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { buttonLabels } from '../utils/labels'

interface Props {
  imageSrc: string
  onCropDone: (file: File) => void
  onCancel: () => void
}

function getCroppedImg(imageSrc: string, pixelCrop: PixelCrop): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.src = imageSrc
    image.addEventListener('load', () => {
      const canvas = document.createElement('canvas')
      canvas.width = pixelCrop.width
      canvas.height = pixelCrop.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Impossibile creare il canvas'))
        return
      }
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
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas vuoto'))
            return
          }
          resolve(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.92,
      )
    })
    image.addEventListener('error', reject)
  })
}

export default function ImageCropper({ imageSrc, onCropDone, onCancel }: Props) {
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 90, height: 90, x: 5, y: 5 })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [processing, setProcessing] = useState(false)

  const confirm = async () => {
    if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) return
    setProcessing(true)
    try {
      const file = await getCroppedImg(imageSrc, completedCrop)
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
      <h3 style={{ color: '#fff', margin: '0 0 0.75rem' }}>{buttonLabels.crop}</h3>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <ReactCrop
          crop={crop}
          onChange={(c) => setCrop(c)}
          onComplete={(c) => setCompletedCrop(c)}
        >
          <img src={imageSrc} alt="Da ritagliare" style={{ maxHeight: '100%', maxWidth: '100%' }} />
        </ReactCrop>
      </div>
      <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
        Trascina i bordi del riquadro per regolare il ritaglio sui 4 lati.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: '#555' }}>
          {buttonLabels.cancel}
        </button>
        <button type="button" onClick={confirm} disabled={processing} style={{ flex: 1 }}>
          {processing ? 'Ritaglio...' : buttonLabels.usePhoto}
        </button>
      </div>
    </div>
  )
}
