import { useRef, useState } from 'react'
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { buttonLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

interface Props {
  imageSrc: string
  onCropDone: (file: File) => void
  onCancel: () => void
}

function getCroppedImg(image: HTMLImageElement, pixelCrop: PixelCrop): Promise<File> {
  return new Promise((resolve, reject) => {
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    const sourceX = pixelCrop.x * scaleX
    const sourceY = pixelCrop.y * scaleY
    const sourceWidth = pixelCrop.width * scaleX
    const sourceHeight = pixelCrop.height * scaleY
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sourceWidth)
    canvas.height = Math.round(sourceHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Impossibile creare il canvas'))
      return
    }
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
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
}

export default function ImageCropper({ imageSrc, onCropDone, onCancel }: Props) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 90, height: 90, x: 5, y: 5 })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [processing, setProcessing] = useState(false)

  const confirm = async () => {
    if (!imageRef.current || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) return
    setProcessing(true)
    try {
      const file = await getCroppedImg(imageRef.current, completedCrop)
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
          <img ref={imageRef} src={imageSrc} alt="Da ritagliare" style={{ maxHeight: '100%', maxWidth: '100%' }} />
        </ReactCrop>
      </div>
      <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
        Trascina i bordi del riquadro per regolare il ritaglio sui 4 lati.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" onClick={onCancel} aria-label={buttonLabels.cancel} title={buttonLabels.cancel} style={{ flex: 1, background: '#555', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="cancel" size={18} />
        </button>
        <button type="button" onClick={confirm} disabled={processing} aria-label={buttonLabels.usePhoto} title={buttonLabels.usePhoto} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {processing ? 'Ritaglio...' : <Icon name="useThis" size={18} />}
        </button>
      </div>
    </div>
  )
}
