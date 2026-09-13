import { useRef, useState } from 'react'
import type { Ref } from 'react'
import { useZxing } from 'react-zxing'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

interface Props {
  onScan: (isbn: string) => void
  onClose: () => void
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

function normalizeBarcode(value: string) {
  return value.replace(/[^0-9X]/gi, '').toUpperCase()
}

function isValidIsbn(value: string) {
  if (/^97[89]\d{10}$/.test(value)) {
    const sum = value.slice(0, 12).split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
    return (10 - (sum % 10)) % 10 === Number(value[12])
  }
  if (!/^\d{9}[\dX]$/.test(value)) return false
  const sum = value.split('').reduce((total, character, index) => total + (character === 'X' ? 10 : Number(character)) * (10 - index), 0)
  return sum % 11 === 0
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const onScanRef = useRef(onScan)
  const lastDetectionRef = useRef<{ value: string; time: number } | null>(null)
  const completedRef = useRef(false)
  const [status, setStatus] = useState('Avvio fotocamera...')
  const [error, setError] = useState<string | null>(null)
  onScanRef.current = onScan

  const { ref, torch } = useZxing({
    wasmUrl,
    formats: [...FORMATS],
    trySkew: true,
    timeBetweenDecodingAttempts: 100,
    constraints: {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    onDecodeResult(result) {
      if (completedRef.current) return
      const value = normalizeBarcode(result.rawValue)
      if (!isValidIsbn(value)) {
        lastDetectionRef.current = null
        setStatus(`Codice ${value} rilevato, ma non è un ISBN valido.`)
        return
      }
      const now = Date.now()
      const previous = lastDetectionRef.current
      if (!previous || previous.value !== value || now - previous.time > 1500) {
        lastDetectionRef.current = { value, time: now }
        setStatus(`Codice rilevato: ${value}. Mantieni fermo...`)
        return
      }
      completedRef.current = true
      setStatus(`Codice confermato: ${value}`)
      onScanRef.current(value)
    },
    onError(value) {
      const message = value instanceof Error ? value.message : String(value)
      setError(`Impossibile accedere alla fotocamera: ${message}`)
    },
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, color: '#fff' }}>Scansiona codice a barre</h3>
        <button onClick={onClose} style={{ background: 'transparent', color: '#fff', fontSize: '1.5rem' }}>✕</button>
      </div>
      {error && <div className="error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      <div style={{ position: 'relative', flex: 1, minHeight: '280px', overflow: 'hidden', background: '#111' }}>
        <video ref={ref as Ref<HTMLVideoElement>} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', left: '8%', right: '8%', top: '35%', height: '30%', border: '3px solid #fff', borderRadius: '0.5rem', boxShadow: '0 0 0 9999px rgba(0,0,0,.35)', pointerEvents: 'none' }} />
      </div>
      <div style={{ color: '#fff', marginTop: '0.6rem' }}>{status}</div>
      {torch.isAvailable && <button type="button" onClick={() => torch.isOn ? torch.off() : torch.on()} style={{ marginTop: '0.75rem' }}>{torch.isOn ? 'Spegni luce' : 'Accendi luce'}</button>}
    </div>
  )
}
