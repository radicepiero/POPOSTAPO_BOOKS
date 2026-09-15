import {
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  Edit3,
  Gift,
  Heart,
  Loader,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'

const iconMap = {
  actions: MoreHorizontal,
  addCopy: BookOpen,
  addReading: BookOpen,
  addWishlist: Heart,
  addBookmark: Bookmark,
  back: ChevronLeft,
  cancel: X,
  continue: RotateCcw,
  delete: Trash2,
  edit: Edit3,
  gift: Gift,
  lend: BookOpen,
  loading: Loader,
  modify: Edit3,
  more: Plus,
  return: RotateCcw,
  save: Save,
  search: Search,
  sell: ShoppingCart,
  useThis: Check,
}

export type IconName = keyof typeof iconMap

interface Props {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 16, className }: Props) {
  const Component = iconMap[name]
  if (!Component) return null
  return <Component size={size} className={className} style={{ verticalAlign: 'middle' }} />
}

export function LabelWithIcon({ name, label, size = 16, gap = '0.4rem' }: { name: IconName; label: string; size?: number; gap?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <Icon name={name} size={size} />
      <span>{label}</span>
    </span>
  )
}
