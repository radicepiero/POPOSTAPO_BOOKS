import { useRef, useState } from 'react'
import { Icon } from '../utils/icons'

interface Props {
  onTranscript: (text: string) => void
}

export default function SpeechInput({ onTranscript }: Props) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  const stop = () => {
    try {
      recognitionRef.current?.stop()
    } catch {
      // already stopped
    }
    setListening(false)
  }

  const start = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Riconoscimento vocale non supportato in questo browser.')
      return
    }

    const recognition = new SR()
    recognition.lang = 'it-IT'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? ''
      if (transcript) onTranscript(transcript)
      setListening(false)
    }

    recognition.onerror = () => {
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      aria-label={listening ? 'Ferma dettatura' : 'Dettatura vocale'}
      title={listening ? 'Ferma dettatura' : 'Dettatura vocale'}
      style={{
        padding: '0.5rem',
        background: listening ? '#b00020' : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {listening ? <Icon name="loading" size={16} className="spinner" /> : <Icon name="microphone" size={16} />}
    </button>
  )
}
