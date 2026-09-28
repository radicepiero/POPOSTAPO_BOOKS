import EntityBadge from './EntityBadge'

interface Props {
  type: 'author' | 'edition' | 'work'
  title?: string
  variant?: 'compact' | 'detail' | 'selectable' | 'mini'
  onSelect?: () => void
  aside?: React.ReactNode
  header?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}

export default function EntityCard({ type, title, variant = 'compact', onSelect, aside, header, children, footer }: Props) {
  const headerContent = header || (title && <strong style={{ display: 'block', marginBottom: '0.35rem' }}>{title}</strong>)

  return (
    <section
      className="card"
      onClick={onSelect}
      style={{ position: 'relative', marginBottom: '0.75rem', cursor: onSelect ? 'pointer' : undefined, padding: variant === 'mini' ? '0.6rem' : undefined }}
    >
      <span style={{ position: 'absolute', top: '-0.45rem', left: '-0.45rem', zIndex: 2 }}>
        <EntityBadge type={type} size={variant === 'mini' ? '1.35rem' : '1.6rem'} />
      </span>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
        {aside}
        <div style={{ flex: 1, minWidth: 0 }}>{headerContent}</div>
      </div>
      {children}
      {footer && <div style={{ marginTop: '0.75rem' }}>{footer}</div>}
    </section>
  )
}
