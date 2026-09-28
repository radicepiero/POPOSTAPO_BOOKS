import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import client from '../api/client'
import WorkCard from '../components/WorkCard'
import { WorkSummary } from '../services/bibliographicMappers'

export default function WorkPage() {
  const { workId } = useParams<{ workId: string }>()
  const [work, setWork] = useState<WorkSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    client.get(`/works/${workId}`).then(({ data }) => setWork(data)).catch((err) => setError(err.response?.data?.detail || err.message))
  }, [workId])

  if (error) return <div className="error">{error}</div>
  if (!work) return <p>Caricamento opera...</p>
  return <WorkCard work={work} variant="detail" />
}
