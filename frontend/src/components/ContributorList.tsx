import { AuthorReference, Contributor } from '../services/bibliographicMappers'
import AuthorMiniCard from './AuthorMiniCard'

export default function ContributorList({ contributors, title = 'Autori e contributori' }: { contributors: (Contributor | AuthorReference)[]; title?: string }) {
  if (!contributors.length) return null
  const references = contributors.map((contributor) => ({
    id: contributor.id,
    display_name: 'display_name' in contributor ? contributor.display_name : contributor.name,
    role: contributor.role,
  }))
  return (
    <section className="card">
      <h3>{title}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {references.map((reference, index) => <AuthorMiniCard key={`${reference.id || reference.display_name}-${index}`} author={reference} showRole />)}
      </div>
    </section>
  )
}
