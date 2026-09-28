import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import client from '../api/client'
import CopyFormModal from '../components/CopyFormModal'
import EditionCard from '../components/EditionCard'
import EditionImagesEditor, { EditionImageFiles, ExistingEditionImage, emptyFiles } from '../components/EditionImagesEditor'
import StartReadingModal from '../components/StartReadingModal'
import { Candidate, EditionVariant } from '../services/bibliographicMappers'
import { buttonLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

interface EditionPermissions {
  can_edit: boolean
  can_delete: boolean
  own_copies: number
  own_readings: number
  other_copies: number
  other_readings: number
}

function EditionDetail() {
  const { editionId } = useParams<{ editionId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [edition, setEdition] = useState<Candidate & { permissions?: EditionPermissions } | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(() => {
    const queryVariantId = searchParams.get('variant_id')
    return queryVariantId ? Number(queryVariantId) : null
  })
  const [action, setAction] = useState<'copy' | 'reading' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [imageFiles, setImageFiles] = useState<EditionImageFiles>(emptyFiles)

  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    authors: '',
    publisher: '',
    year: '',
    isbn: '',
  })
  const [variantForm, setVariantForm] = useState({
    label: '',
    pages: '',
    printing_year: '',
    printing_number: '',
    notes: '',
  })

  const variants = useMemo(() => edition?.variants || [], [edition?.variants])
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) || variants.find((variant) => variant.is_default) || variants[0],
    [variants, selectedVariantId],
  )
  const existingImages = useMemo<ExistingEditionImage[]>(
    () => Object.values(selectedVariant?.images || {}).flat(),
    [selectedVariant],
  )

  const applyVariantForm = (variant?: EditionVariant) => {
    setVariantForm({
      label: variant?.label || '',
      pages: variant?.pages ? String(variant.pages) : '',
      printing_year: variant?.printing_year ? String(variant.printing_year) : '',
      printing_number: variant?.printing_number || '',
      notes: variant?.notes || '',
    })
  }

  const load = async () => {
    if (!editionId) return
    setError(null)
    try {
      const { data } = await client.get(`/editions/${editionId}`)
      setEdition(data)
      const queryVariantId = searchParams.get('variant_id')
      const requestedVariantId = queryVariantId ? Number(queryVariantId) : selectedVariantId
      const nextVariant = (data.variants || []).find((variant: EditionVariant) => variant.id === requestedVariantId)
        || (data.variants || []).find((variant: EditionVariant) => variant.id === data.default_variant_id)
        || data.variants?.[0]
      setSelectedVariantId(nextVariant?.id || null)
      setImageFiles(emptyFiles)
      setForm({
        title: data.title || '',
        subtitle: data.subtitle || '',
        authors: (data.authors || []).join(', '),
        publisher: data.publisher || '',
        year: data.year ? String(data.year) : '',
        isbn: data.isbn || data.isbn13 || data.isbn10 || '',
      })
      applyVariantForm(nextVariant)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  useEffect(() => {
    load()
  }, [editionId])

  useEffect(() => {
    if (!editing) applyVariantForm(selectedVariant)
  }, [selectedVariantId, editing])

  const addToWishlist = async () => {
    if (!edition) return
    try {
      await client.post('/wishlist', {
        work_id: edition.work?.id,
        title: edition.title,
        author: (edition.authors || []).join(', ') || undefined,
      })
      navigate('/readings?status=wishlist')
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  const handleReadingSaved = () => {
    setAction(null)
    navigate('/readings')
  }

  const uploadVariantImage = async (variantId: number, file: File, kind: string, position = 0) => {
    const upload = new FormData()
    upload.append('image', file)
    upload.append('kind', kind)
    upload.append('position', String(position))
    await client.post(`/variants/${variantId}/images`, upload)
  }

  const deleteVariantImage = async (image: ExistingEditionImage) => {
    if (!selectedVariant) return
    try {
      await client.delete(`/variants/${selectedVariant.id}/images/${image.id}`)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  const createVariant = async () => {
    if (!editionId || !perms.can_edit) return
    const label = window.prompt('Nome della nuova variante', 'Nuova variante')
    if (!label) return
    try {
      const { data } = await client.post(`/editions/${editionId}/variants`, { label })
      setSelectedVariantId(data.id)
      await load()
      setSelectedVariantId(data.id)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editionId) return
    setSaving(true)
    setError(null)
    try {
      await client.patch(`/editions/${editionId}`, {
        title: form.title || undefined,
        subtitle: form.subtitle || undefined,
        authors: form.authors.split(',').map((a) => a.trim()).filter(Boolean) || undefined,
        publisher: form.publisher || undefined,
        year: form.year ? parseInt(form.year, 10) : undefined,
        isbn: form.isbn || undefined,
      })
      if (selectedVariant) {
        await client.patch(`/variants/${selectedVariant.id}`, {
          label: variantForm.label || undefined,
          pages: variantForm.pages ? parseInt(variantForm.pages, 10) : undefined,
          printing_year: variantForm.printing_year ? parseInt(variantForm.printing_year, 10) : undefined,
          printing_number: variantForm.printing_number || undefined,
          notes: variantForm.notes || undefined,
        })
        if (imageFiles.front) await uploadVariantImage(selectedVariant.id, imageFiles.front, 'front')
        if (imageFiles.back) await uploadVariantImage(selectedVariant.id, imageFiles.back, 'back')
        if (imageFiles.spine) await uploadVariantImage(selectedVariant.id, imageFiles.spine, 'spine')
        for (const [index, file] of imageFiles.copyright.entries()) {
          await uploadVariantImage(selectedVariant.id, file, 'copyright', index)
        }
      }
      setEditing(false)
      await load()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelEditing = async () => {
    setEditing(false)
    await load()
  }

  const handleDelete = async (force: boolean) => {
    if (!editionId) return
    setDeleting(true)
    setError(null)
    try {
      await client.delete(`/editions/${editionId}`, { params: { force } })
      navigate('/library')
    } catch (err: any) {
      const status = err.response?.status
      const data = err.response?.data
      if (status === 409 && data?.detail?.confirm_required) {
        setShowDeleteConfirm(true)
        setError(null)
      } else {
        const detail = data?.detail
        setError(typeof detail === 'string' ? detail : err.message)
      }
    } finally {
      setDeleting(false)
    }
  }

  if (error && !edition) return <div className="error">{error}</div>
  if (!edition) return <p>Caricamento edizione...</p>

  const perms = (edition.permissions || {}) as EditionPermissions
  const sourceLabel = (source?: string | null) => source === 'series' ? ' · da collana' : ''
  const displayedEdition = selectedVariant?.covers?.length ? { ...edition, covers: selectedVariant.covers } : edition

  return (
    <div>
      <EditionCard candidate={displayedEdition} variant="detail" />

      {variants.length > 1 && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h3>Variante</h3>
          {variants.length > 1 ? (
            <label>Variante selezionata
              <select value={selectedVariant?.id || ''} onChange={(event) => setSelectedVariantId(Number(event.target.value))}>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.label || `Variante ${variant.id}`}{variant.is_default ? ' · predefinita' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p style={{ marginTop: 0 }}><strong>{selectedVariant?.label || 'Variante principale'}</strong></p>
          )}
          {selectedVariant && (
            <p style={{ color: '#666', fontSize: '0.9rem' }}>
              {[
                selectedVariant.pages ? `${selectedVariant.pages} pagine` : null,
                selectedVariant.series ? `Collana ${selectedVariant.series}${selectedVariant.series_number ? ` n. ${selectedVariant.series_number}` : ''}` : null,
                selectedVariant.binding ? `${selectedVariant.binding}${sourceLabel(selectedVariant.binding_source)}` : null,
                selectedVariant.height_mm && selectedVariant.width_mm ? `${selectedVariant.height_mm} × ${selectedVariant.width_mm} mm${sourceLabel(selectedVariant.height_source || selectedVariant.width_source)}` : null,
                selectedVariant.printing_year ? `Stampa ${selectedVariant.printing_year}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          {perms.can_edit && variants.length > 0 && (
            <button type="button" onClick={createVariant} style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}>Aggiungi variante</button>
          )}
        </section>
      )}

      {perms.can_edit && !editing && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button onClick={() => { setAction(null); setEditing(true) }} aria-label={buttonLabels.modify} title={buttonLabels.modify} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <Icon name="edit" size={16} />
          </button>
          {perms.can_delete && (
            <button onClick={() => setShowDeleteConfirm(true)} disabled={deleting} aria-label={buttonLabels.delete} title={buttonLabels.delete} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#b00020' }}>
              <Icon name="delete" size={16} />
            </button>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={handleSave} className="card" style={{ marginBottom: '1rem' }}>
          <h3>Modifica edizione</h3>
          <label>Titolo<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label>Sottotitolo<input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></label>
          <label>Autori (separati da virgola)<input value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} /></label>
          <label>Editore<input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} /></label>
          <label>Anno<input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></label>
          <label>ISBN<input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} /></label>
          <button type="button" onClick={createVariant} style={{ padding: '0.45rem 0.7rem', fontSize: '0.85rem' }}>Aggiungi variante</button>

          {selectedVariant && (
            <>
              <h3>Modifica variante</h3>
              <label>Nome variante<input value={variantForm.label} onChange={(e) => setVariantForm({ ...variantForm, label: e.target.value })} /></label>
              <label>Pagine<input type="number" value={variantForm.pages} onChange={(e) => setVariantForm({ ...variantForm, pages: e.target.value })} /></label>
              <label>Anno di stampa<input type="number" value={variantForm.printing_year} onChange={(e) => setVariantForm({ ...variantForm, printing_year: e.target.value })} /></label>
              <label>Numero di stampa<input value={variantForm.printing_number} onChange={(e) => setVariantForm({ ...variantForm, printing_number: e.target.value })} /></label>
              <label>Note variante<textarea value={variantForm.notes} onChange={(e) => setVariantForm({ ...variantForm, notes: e.target.value })} /></label>
              <EditionImagesEditor existingImageRecords={existingImages} onDeleteExistingImage={deleteVariantImage} onChange={setImageFiles} />
            </>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="submit" disabled={saving} aria-label={buttonLabels.save} title={buttonLabels.save} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{saving ? 'Salvataggio…' : <Icon name="save" size={18} />}</button>
            <button type="button" onClick={cancelEditing} aria-label={buttonLabels.cancel} title={buttonLabels.cancel} style={{ flex: 1, background: '#555', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cancel" size={18} /></button>
          </div>
        </form>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Conferma eliminazione</h3>
            <p>Vuoi cancellare questa edizione?</p>
            {(perms.own_copies > 0 || perms.own_readings > 0 || perms.other_copies > 0 || perms.other_readings > 0) && (
              <div className="error" style={{ margin: '0.5rem 0' }}>
                <strong>Verranno eliminate:</strong>
                {perms.own_copies > 0 && <div>{perms.own_copies} copie tue</div>}
                {perms.own_readings > 0 && <div>{perms.own_readings} letture tue</div>}
                {perms.other_copies > 0 && <div>{perms.other_copies} copie di altri utenti</div>}
                {perms.other_readings > 0 && <div>{perms.other_readings} letture di altri utenti</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => handleDelete(true)} disabled={deleting} style={{ flex: 1, background: '#b00020' }}>{deleting ? 'Eliminazione…' : 'Conferma eliminazione'}</button>
              <button onClick={() => setShowDeleteConfirm(false)} aria-label={buttonLabels.cancel} title={buttonLabels.cancel} style={{ flex: 1, background: '#555', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cancel" size={18} /></button>
            </div>
          </div>
        </div>
      )}

      {!editing && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setAction('reading')} aria-label={buttonLabels.addReading} title={buttonLabels.addReading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="addReading" size={16} /></button>
          <button onClick={addToWishlist} aria-label={buttonLabels.addWishlist} title={buttonLabels.addWishlist} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="addWishlist" size={16} /></button>
          <button onClick={() => setAction('copy')} aria-label={buttonLabels.addCopy} title={buttonLabels.addCopy} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="addCopy" size={16} /></button>
        </div>
      )}
      {!editing && action === 'reading' && (
        <StartReadingModal
          editionId={Number(editionId)}
          editionVariantId={selectedVariant?.id}
          editionTitle={edition.title}
          onClose={() => setAction(null)}
          onSaved={handleReadingSaved}
        />
      )}
      {!editing && action === 'copy' && (
        <CopyFormModal
          editionId={Number(editionId)}
          editionVariantId={selectedVariant?.id}
          onClose={() => setAction(null)}
          onSaved={() => navigate('/library')}
        />
      )}
      {error && !showDeleteConfirm && <div className="error">{error}</div>}
    </div>
  )
}

export default EditionDetail
