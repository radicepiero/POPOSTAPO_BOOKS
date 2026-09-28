interface EntityBadgeProps {
  type: 'author' | 'edition' | 'work'
  size?: string
  title?: string
}

const config = {
  author: { letter: 'A', background: '#1769aa' },
  edition: { letter: 'E', background: '#555' },
  work: { letter: 'O', background: '#1769aa' },
}

export default function EntityBadge({ type, size = '1.5rem', title }: EntityBadgeProps) {
  const { letter, background } = config[type]
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: size,
        height: size,
        borderRadius: '0.25rem',
        background,
        color: '#fff',
        fontSize: `calc(${size} * 0.5)`,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {letter}
    </span>
  )
}
