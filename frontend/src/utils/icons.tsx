import {
  Barcode,
  BookMarked,
  BookOpen,
  Bookmark,
  Camera,
  Check,
  ChevronLeft,
  Edit3,
  Gift,
  Heart,
  Home,
  LibraryBig,
  Loader,
  LogIn,
  Mic,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Upload,
  Users,
  Trash2,
  X,
} from 'lucide-react'

const iconMap = {
  actions: MoreHorizontal,
  home: Home,
  authors: Users,
  library: LibraryBig,
  login: LogIn,
  addCopy: LibraryBig,
  addReading: Bookmark,
  addWishlist: Heart,
  addBookmark: BookMarked,
  back: ChevronLeft,
  camera: Camera,
  cancel: X,
  continue: RotateCcw,
  delete: Trash2,
  edit: Edit3,
  gift: Gift,
  lend: BookOpen,
  loading: Loader,
  microphone: Mic,
  modify: Edit3,
  more: Plus,
  return: RotateCcw,
  save: Save,
  scan: Barcode,
  search: Search,
  sell: ShoppingCart,
  upload: Upload,
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
