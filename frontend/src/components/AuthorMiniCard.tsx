import { Link } from 'react-router-dom'
import { AuthorReference } from '../services/bibliographicMappers'
import EntityBadge from './EntityBadge'

const roleLabels: Record<string, string> = {
  author: 'Autore',
  co_author: 'Co-autore',
  translator: 'Traduttore',
  editor: 'Curatore',
  illustrator: 'Illustratore',
}

export default function AuthorMiniCard({ author, showRole = false }: { author: AuthorReference; showRole?: boolean }) {
  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', border: '1px solid #ddd', borderRadius: '0.4rem', padding: '0.35rem 0.5rem', background: '#fafafa' }}>
      <EntityBadge type="author" size="1.25rem" />
      <strong style={{ fontSize: '0.85rem' }}>{author.display_name}</strong>
      {showRole && author.role && <span style={{ color: '#666', fontSize: '0.75rem' }}>{roleLabels[author.role] || author.role}</span>}
    </span>
  )
  return author.id ? <Link to={`/authors/${author.id}`} onClick={(event) => event.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{content}</Link> : content
}
