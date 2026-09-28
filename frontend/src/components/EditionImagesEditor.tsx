import { useState } from 'react'
import { imageRoleLabels } from '../utils/labels'
import BookCameraCapture from './BookCameraCapture'
import ImageCropper from './ImageCropper'
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
    <fieldset style={{ border: '1px solid #ddd', borderRadius: '0.4rem', marginTop: '0.75rem' }}>
      <legend>Immagini dell'edizione</legend>
      {(existingImages.length > 0 || existingImageRecords.length > 0) && (
        <div style={{ borderBottom: '1px solid #ddd', paddingBottom: '0.75rem' }}>
          <strong>Immagini della variante</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {existingImageRecords.map((image, index) => (
              <div key={image.id} style={{ position: 'relative' }}>
                <img src={image.url} alt={`${image.kind} ${index + 1}`} style={{ width: '70px', height: '95px', objectFit: 'contain' }} />
                <small style={{ display: 'block', textAlign: 'center', color: '#666' }}>{image.kind}</small>
                {onDeleteExistingImage && <button type="button" aria-label="Rimuovi immagine" onClick={() => onDeleteExistingImage(image)} style={{ position: 'absolute', top: '-0.3rem', right: '-0.3rem', width: '1.2rem', height: '1.2rem', padding: 0, borderRadius: '50%', background: '#b00020' }}>×</button>}
              </div>
            ))}
            {existingImages.map((image, index) => (
              <div key={`${image}-${index}`} style={{ position: 'relative' }}>
                <img src={image} alt={`Immagine esistente ${index + 1}`} style={{ width: '70px', height: '95px', objectFit: 'contain' }} />
                {onExistingImagesChange && <button type="button" aria-label="Rimuovi immagine" onClick={() => onExistingImagesChange(existingImages.filter((_, currentIndex) => currentIndex !== index))} style={{ position: 'absolute', top: '-0.3rem', right: '-0.3rem', width: '1.2rem', height: '1.2rem', padding: 0, borderRadius: '50%', background: '#b00020' }}>×</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {slots.map(({ kind, label, required }) => {
        const item = items[kind]
        return (
          <div key={kind} style={{ borderBottom: '1px solid #ddd', padding: '0.9rem 0' }}>
            <strong>{label}</strong><span style={{ color: '#777', fontSize: '0.8rem' }}> · {required ? 'obbligatoria' : 'opzionale'}</span>
            {item && <img src={item.preview} alt={label} style={{ display: 'block', maxWidth: '100%', maxHeight: '160px', marginTop: '0.6rem', borderRadius: '0.5rem' }} />}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setCapturing(kind)} aria-label={`Scatta ${label}`} title={`Scatta ${label}`} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={18} /></button>
              <label style={{ flex: 1, margin: 0 }}>Carica<input type="file" accept="image/*" onChange={(event) => { openCropper(kind, event.target.files?.[0]); event.target.value = '' }} /></label>
              {item && <button type="button" onClick={() => removeImage(kind)} style={{ background: '#b00020' }}>Rimuovi</button>}
            </div>
          </div>
        )
      })}
      <div style={{ padding: '0.9rem 0 0' }}>
        <strong>{imageRoleLabels['copyright or title page']}</strong><span style={{ color: '#777', fontSize: '0.8rem' }}> · opzionale, più pagine</span>
        {items.copyright.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.5rem 0' }}>
            {items.copyright.map((item, index) => (
              <div key={item.preview} style={{ position: 'relative' }}>
                <img src={item.preview} alt={`Pagina dati editoriali ${index + 1}`} style={{ width: '60px', height: '80px', objectFit: 'cover', borderRadius: '0.4rem' }} />
                <button type="button" aria-label="Rimuovi pagina" onClick={() => removeImage('copyright', index)} style={{ position: 'absolute', top: '-0.3rem', right: '-0.3rem', width: '1.2rem', height: '1.2rem', padding: 0, borderRadius: '50%', background: '#b00020' }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button type="button" onClick={() => setCapturing('copyright')} aria-label="Scatta pagina dati editoriali" title="Scatta pagina dati editoriali" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={18} /></button>
          <label style={{ flex: 1, margin: 0 }}>Carica<input type="file" accept="image/*" onChange={(event) => { openCropper('copyright', event.target.files?.[0]); event.target.value = '' }} /></label>
        </div>
      </div>
      {cropImage && <ImageCropper imageSrc={cropImage.src} onCropDone={finishCrop} onCancel={cancelCrop} />}
      {capturing && <BookCameraCapture onCapture={handleCapture} onClose={() => setCapturing(null)} />}
    </fieldset>
  )
}

export { emptyFiles }
