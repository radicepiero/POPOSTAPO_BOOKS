import { useState } from 'react'
import { imageRoleLabels } from '../utils/labels'
import BookCameraCapture from './BookCameraCapture'
import ImageCropper from './ImageCropper'
import ImageLightbox from './ImageLightbox'
import { Icon } from '../utils/icons'

export type EditionImageKind = 'front' | 'back' | 'spine' | 'copyright'

export interface EditionImageFiles {
  front: File | null
  back: File | null
  spine: File | null
  copyright: File[]
}

interface ImageItem {
  file: File
  preview: string
}

export interface ExistingEditionImage {
  id: number
  url: string
  kind: string
}

interface Props {
  existingImages?: string[]
  existingImageRecords?: ExistingEditionImage[]
  initialFiles?: EditionImageFiles
  onExistingImagesChange?: (images: string[]) => void
  onDeleteExistingImage?: (image: ExistingEditionImage) => void
  onChange: (files: EditionImageFiles) => void
  requireFront?: boolean
}

const emptyFiles: EditionImageFiles = { front: null, back: null, spine: null, copyright: [] }

export default function EditionImagesEditor({ existingImages = [], existingImageRecords = [], initialFiles = emptyFiles, onExistingImagesChange, onDeleteExistingImage, onChange, requireFront = false }: Props) {
  const [items, setItems] = useState<{ front: ImageItem | null; back: ImageItem | null; spine: ImageItem | null; copyright: ImageItem[] }>(() => ({
    front: initialFiles.front ? { file: initialFiles.front, preview: URL.createObjectURL(initialFiles.front) } : null,
    back: initialFiles.back ? { file: initialFiles.back, preview: URL.createObjectURL(initialFiles.back) } : null,
    spine: initialFiles.spine ? { file: initialFiles.spine, preview: URL.createObjectURL(initialFiles.spine) } : null,
    copyright: initialFiles.copyright.map((file) => ({ file, preview: URL.createObjectURL(file) })),
  }))
  const [capturing, setCapturing] = useState<EditionImageKind | null>(null)
  const [cropImage, setCropImage] = useState<{ kind: EditionImageKind; file: File; src: string } | null>(null)
  const [lightbox, setLightbox] = useState<{ open: boolean; src: string; alt: string }>({ open: false, src: '', alt: '' })

  const openLightbox = (src: string, alt: string) => setLightbox({ open: true, src, alt })
  const closeLightbox = () => setLightbox({ open: false, src: '', alt: '' })

  const emit = (next: typeof items) => {
    onChange({
      front: next.front?.file || null,
      back: next.back?.file || null,
      spine: next.spine?.file || null,
      copyright: next.copyright.map(({ file }) => file),
    })
  }

  const addImage = (kind: EditionImageKind, file: File) => {
    const item = { file, preview: URL.createObjectURL(file) }
    const next = kind === 'copyright'
      ? { ...items, copyright: [...items.copyright, item] }
      : { ...items, [kind]: item }
    setItems(next)
    emit(next)
  }

  const removeImage = (kind: EditionImageKind, index = 0) => {
    const item = kind === 'copyright' ? items.copyright[index] : items[kind]
    if (item) URL.revokeObjectURL(item.preview)
    const next = kind === 'copyright'
      ? { ...items, copyright: items.copyright.filter((_, currentIndex) => currentIndex !== index) }
      : { ...items, [kind]: null }
    setItems(next)
    emit(next)
  }

  const openCropper = (kind: EditionImageKind, file?: File) => {
    if (file) setCropImage({ kind, file, src: URL.createObjectURL(file) })
  }

  const finishCrop = (file: File) => {
    if (!cropImage) return
    URL.revokeObjectURL(cropImage.src)
    addImage(cropImage.kind, file)
    setCropImage(null)
  }

  const cancelCrop = () => {
    if (!cropImage) return
    URL.revokeObjectURL(cropImage.src)
    addImage(cropImage.kind, cropImage.file)
    setCropImage(null)
  }

  const handleCapture = (file: File) => {
    addImage(capturing || 'front', file)
    setCapturing(null)
  }

  const slots = [
    { kind: 'front' as const, label: imageRoleLabels['front cover'], required: requireFront },
    { kind: 'back' as const, label: imageRoleLabels['back cover'], required: false },
    { kind: 'spine' as const, label: imageRoleLabels.spine, required: false },
  ]

  return (
    <fieldset style={{ border: '1px solid #ddd', borderRadius: '0.4rem', padding: '0.75rem', marginTop: '0.75rem' }}>
      <legend style={{ fontSize: '0.9rem', padding: '0 0.3rem' }}>Immagini dell'edizione</legend>
      {(existingImages.length > 0 || existingImageRecords.length > 0) && (
        <div style={{ marginBottom: '0.75rem' }}>
          <strong style={{ fontSize: '0.85rem' }}>Immagini della variante</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
            {existingImageRecords.map((image, index) => (
              <div key={image.id} style={{ position: 'relative' }}>
                <img src={image.url} alt={`${image.kind} ${index + 1}`} onDoubleClick={() => openLightbox(image.url, `${image.kind} ${index + 1}`)} style={{ width: '55px', height: '75px', objectFit: 'contain', borderRadius: '0.3rem', cursor: 'pointer' }} />
                {onDeleteExistingImage && <button type="button" aria-label="Rimuovi immagine" onClick={() => onDeleteExistingImage(image)} style={{ position: 'absolute', top: '-0.25rem', right: '-0.25rem', width: '1.1rem', height: '1.1rem', padding: 0, borderRadius: '50%', background: '#b00020', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="delete" size={12} /></button>}
              </div>
            ))}
            {existingImages.map((image, index) => (
              <div key={`${image}-${index}`} style={{ position: 'relative' }}>
                <img src={image} alt={`Immagine esistente ${index + 1}`} onDoubleClick={() => openLightbox(image, `Immagine esistente ${index + 1}`)} style={{ width: '55px', height: '75px', objectFit: 'contain', borderRadius: '0.3rem', cursor: 'pointer' }} />
                {onExistingImagesChange && <button type="button" aria-label="Rimuovi immagine" onClick={() => onExistingImagesChange(existingImages.filter((_, currentIndex) => currentIndex !== index))} style={{ position: 'absolute', top: '-0.25rem', right: '-0.25rem', width: '1.1rem', height: '1.1rem', padding: 0, borderRadius: '50%', background: '#b00020', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="delete" size={12} /></button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {slots.map(({ kind, label, required }) => {
        const item = items[kind]
        return (
          <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
            <div style={{ width: '55px', height: '75px', flexShrink: 0, borderRadius: '0.3rem', overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item ? (
                <img src={item.preview} alt={label} onDoubleClick={() => openLightbox(item.preview, label)} style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }} />
              ) : (
                <span style={{ color: '#aaa' }}><Icon name="camera" size={20} /></span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: '0.9rem', display: 'block' }}>{label}</strong>
              <span style={{ color: '#777', fontSize: '0.75rem' }}>{required ? 'obbligatoria' : 'opzionale'}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button type="button" onClick={() => setCapturing(kind)} aria-label={`Scatta ${label}`} title={`Scatta ${label}`} style={{ padding: '0.45rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={16} /></button>
              <label style={{ margin: 0, display: 'inline-flex' }} title={`Carica ${label}`}>
                <span style={{ padding: '0.45rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="upload" size={16} /></span>
                <input type="file" accept="image/*" onChange={(event) => { openCropper(kind, event.target.files?.[0]); event.target.value = '' }} style={{ display: 'none' }} />
              </label>
              {item && <button type="button" onClick={() => removeImage(kind)} aria-label={`Rimuovi ${label}`} title={`Rimuovi ${label}`} style={{ padding: '0.45rem', background: '#b00020', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="delete" size={16} /></button>}
            </div>
          </div>
        )
      })}
      <div style={{ padding: '0.5rem 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: items.copyright.length > 0 ? '1px solid #eee' : 'none', paddingBottom: items.copyright.length > 0 ? '0.5rem' : 0 }}>
          <div style={{ width: '55px', height: '75px', flexShrink: 0, borderRadius: '0.3rem', overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#aaa' }}><Icon name="camera" size={20} /></span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: '0.9rem', display: 'block' }}>{imageRoleLabels['copyright or title page']}</strong>
            <span style={{ color: '#777', fontSize: '0.75rem' }}>opzionale, più pagine</span>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button type="button" onClick={() => setCapturing('copyright')} aria-label="Scatta pagina dati editoriali" title="Scatta pagina dati editoriali" style={{ padding: '0.45rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={16} /></button>
            <label style={{ margin: 0, display: 'inline-flex' }} title="Carica pagina dati editoriali">
              <span style={{ padding: '0.45rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="upload" size={16} /></span>
              <input type="file" accept="image/*" onChange={(event) => { openCropper('copyright', event.target.files?.[0]); event.target.value = '' }} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
        {items.copyright.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
            {items.copyright.map((item, index) => (
              <div key={item.preview} style={{ position: 'relative' }}>
                <img src={item.preview} alt={`Pagina dati editoriali ${index + 1}`} onDoubleClick={() => openLightbox(item.preview, `Pagina dati editoriali ${index + 1}`)} style={{ width: '55px', height: '75px', objectFit: 'contain', borderRadius: '0.3rem', cursor: 'pointer' }} />
                <button type="button" aria-label="Rimuovi pagina" onClick={() => removeImage('copyright', index)} style={{ position: 'absolute', top: '-0.25rem', right: '-0.25rem', width: '1.1rem', height: '1.1rem', padding: 0, borderRadius: '50%', background: '#b00020', color: '#fff', fontSize: '0.7rem', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="delete" size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {lightbox.open && <ImageLightbox open={lightbox.open} images={[{ src: lightbox.src, alt: lightbox.alt }]} onClose={closeLightbox} />}
      {cropImage && <ImageCropper imageSrc={cropImage.src} onCropDone={finishCrop} onCancel={cancelCrop} />}
      {capturing && <BookCameraCapture onCapture={handleCapture} onClose={() => setCapturing(null)} />}
    </fieldset>
  )
}

export { emptyFiles }
