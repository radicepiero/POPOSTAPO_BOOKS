import { editionLabels } from '../utils/labels'

interface Props {
  title?: string
  originalTitle?: string
  authors?: string[]
}

export default function WorkCard({ title, originalTitle, authors }: Props) {
  const displayTitle = title || originalTitle || editionLabels.unknownTitle
  return (
    <section className="card">
      <h3>{editionLabels.work}</h3>
      <p><strong>{editionLabels.originalTitle}:</strong> {displayTitle}</p>
      {title && originalTitle && title !== originalTitle && (
        <p><strong>{editionLabels.title}:</strong> {title}</p>
      )}
      <p><strong>{editionLabels.authors}:</strong> {authors?.join(', ') || editionLabels.unknownAuthor}</p>
    </section>
  )
}
