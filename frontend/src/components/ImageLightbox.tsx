import { useEffect, useState } from 'react'
import { Icon } from '../utils/icons'

interface Props {
  open: boolean
  images: { src: string; alt: string }[]
  initialIndex?: number
  onClose: () => void
}

export default function ImageLightbox({ open, images, initialIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex)

  useEffect(() => {
    if (open) setIndex(initialIndex)
  }, [open, initialIndex])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose, images.length])

  if (!open || images.length === 0) return null
  const current = images[index]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      {images.length > 1 && (
        <button
          type="button"
          aria-label="Immagine precedente"
          onClick={(event) => { event.stopPropagation(); setIndex((i) => Math.max(0, i - 1)) }}
          disabled={index === 0}
          style={{
            position: 'absolute',
            left: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            borderRadius: '50%',
            width: '2.5rem',
            height: '2.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="back" size={20} />
        </button>
      )}
      <img
        src={current.src}
        alt={current.alt}
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: '0.35rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      />
      {images.length > 1 && (
        <button
          type="button"
          aria-label="Immagine successiva"
          onClick={(event) => { event.stopPropagation(); setIndex((i) => Math.min(images.length - 1, i + 1)) }}
          disabled={index === images.length - 1}
          style={{
            position: 'absolute',
            right: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            borderRadius: '50%',
            width: '2.5rem',
            height: '2.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="more" size={20} />
        </button>
      )}
      {images.length > 1 && (
        <div style={{ position: 'absolute', bottom: '1rem', color: '#fff', fontSize: '0.9rem' }}>
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  )
}
