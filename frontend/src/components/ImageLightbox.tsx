import { useEffect } from 'react'

interface Props {
  open: boolean
  src: string
  alt: string
  onClose: () => void
}

export default function ImageLightbox({ open, src, alt, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

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
      <img
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: '0.35rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  )
}
