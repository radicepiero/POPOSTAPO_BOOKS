import EntityCard from './EntityCard'

interface Props {
  author: {
    name: string
    given_name?: string | null
    family_name?: string | null
    birth_date?: string | null
    death_date?: string | null
  }
  variant?: 'compact' | 'detail'
}

export default function AuthorCard({ author, variant = 'detail' }: Props) {
  const dates = [author.birth_date, author.death_date].filter(Boolean).join(' – ')
  const fullName = [author.given_name, author.family_name].filter(Boolean).join(' ')
  return (
    <EntityCard type="author" title={author.name} variant={variant}>
      {fullName && fullName !== author.name && <p style={{ margin: '0.2rem 0', color: '#666' }}>{fullName}</p>}
      {dates && <p style={{ margin: '0.2rem 0', color: '#666' }}>{dates}</p>}
    </EntityCard>
  )
}
