import { useState } from 'react'
import { setAuthToken } from '../api/client'
import { Icon } from '../utils/icons'

function Login() {
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setAuthToken(token.trim())
    setSaved(true)
  }

  return (
    <div>
      <h2>Accedi</h2>
      <p>Incolla qui il token JWT per testare il prototipo.</p>
      <form onSubmit={handleSubmit}>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={6}
          placeholder="eyJhbGciOiJIUzI1NiIs..."
        />
        <button type="submit" aria-label="Salva token" title="Salva token" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="save" size={18} /></button>
      </form>
      {saved && <p style={{ color: 'green' }}>Token salvato.</p>}
    </div>
  )
}

export default Login
