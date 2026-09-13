import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
})

export function setAuthToken(token: string | null) {
  if (token) {
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`
    localStorage.setItem('popostapo_token', token)
  } else {
    delete client.defaults.headers.common['Authorization']
    localStorage.removeItem('popostapo_token')
  }
}

export function loadAuthToken(): string | null {
  return localStorage.getItem('popostapo_token')
}

const token = loadAuthToken()
if (token) {
  setAuthToken(token)
}

export default client
