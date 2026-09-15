import { useEffect, useRef, useState } from 'react'
import ImageCropper from './ImageCropper'
import { buttonLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

interface Props {
  onCapture: (file: File) => void
  onClose: () => void
}

export default function BookCameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Avvio fotocamera...')
  const [captured, setCaptured] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [cropping, setCropping] = useState(false)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setStatus('Inquadra il libro e premi Scatta')
    } catch (err: any) {
      setError('Impossibile accedere alla fotocamera: ' + (err.message || err))
      setStatus('Errore fotocamera')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  const takePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setStatus('Il video non è ancora pronto. Riprova tra un istante.')
      return
    }
    setCapturing(true)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setStatus('Errore acquisizione immagine')
      setCapturing(false)
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    stopCamera()
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setStatus('Errore conversione immagine')
          setCapturing(false)
          return
        }
        const file = new File([blob], 'book-cover.jpg', { type: 'image/jpeg' })
        setCapturedFile(file)
        setCaptured(canvas.toDataURL('image/jpeg', 0.85))
        setStatus('')
        setCapturing(false)
      },
      'image/jpeg',
      0.92,
    )
  }

  const retake = () => {
    setCaptured(null)
    setCapturedFile(null)
    startCamera()
  }

  const confirm = () => {
    if (capturedFile) onCapture(capturedFile)
  }

  const handleCropDone = (file: File) => {
    onCapture(file)
  }

  if (cropping && captured) {
    return (
      <ImageCropper
        imageSrc={captured}
        onCropDone={handleCropDone}
        onCancel={() => setCropping(false)}
      />
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#000',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: '#fff' }}>{buttonLabels.takePhoto}</h3>
        <button onClick={onClose} style={{ background: 'transparent', color: '#fff', fontSize: '1.5rem' }}>✕</button>
      </div>
      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
        {captured ? (
          <img src={captured} alt="Foto catturata" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </div>
      {status && <div style={{ color: '#fff', fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center' }}>{status}</div>}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.75rem' }}>
        {captured ? (
          <>
            <button type="button" onClick={retake} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="cancel" size={14} />{buttonLabels.retake}</button>
            <button type="button" onClick={() => setCropping(true)} disabled={!capturedFile} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="edit" size={14} />{buttonLabels.crop}</button>
            <button type="button" onClick={confirm} disabled={!capturedFile} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="useThis" size={14} />{buttonLabels.usePhoto}</button>
          </>
        ) : (
          <button type="button" onClick={takePhoto} disabled={capturing} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="useThis" size={14} />{capturing ? 'Scatto...' : buttonLabels.takePhoto}</button>
        )}
      </div>
    </div>
  )
}
