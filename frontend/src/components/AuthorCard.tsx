import { Icon } from '../utils/icons'

interface Contributor {
  name: string
  role?: string
}

interface Props {
  contributors: Contributor[]
}

const roleLabels: Record<string, string> = {
  author: 'Autore',
  co_author: 'Co-autore',
  translator: 'Traduttore',
  editor: 'Curatore',
  illustrator: 'Illustratore',
}

export default function AuthorCard({ contributors }: Props) {
  if (!contributors || contributors.length === 0) return null

  return (
    <section className="card">
      <h3>Autori e contributori</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {contributors.map((contributor, index) => (
          <div
            key={`${contributor.name}-${index}`}
            style={{
              border: '1px solid #ddd',
              borderRadius: '0.4rem',
              padding: '0.5rem 0.75rem',
              background: '#fafafa',
            }}
          >
            <Icon name="edit" size={14} />
            {' '}
            <strong>{contributor.name}</strong>
            {contributor.role && (
              <span style={{ color: '#666', fontSize: '0.85rem', marginLeft: '0.4rem' }}>
                ({roleLabels[contributor.role] || contributor.role})
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
