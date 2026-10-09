import {
  AppWindow,
  Archive,
  BedDouble,
  BookCopy,
  Cat,
  Clock,
  CupSoda,
  Disc3,
  DoorOpen,
  Frame,
  Gamepad2,
  Headphones,
  KeyRound,
  Lamp,
  LayoutPanelTop,
  Mailbox,
  MailOpen,
  MoonStar,
  NotebookPen,
  Radio,
  RadioTower,
  Smartphone,
  Sofa,
  Sparkles,
  Sprout,
  StickyNote,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

/**
 * 图标名 → 组件的映射表。
 *
 * 为什么不直接 `import * as icons from 'lucide-react'`？
 * 那样会把 1500+ 个图标全打进包里。这里只显式引入用到的那些，
 * 数据库里的 achievements.icon / events 图标名都从这里查。
 */
const ICONS: Record<string, LucideIcon> = {
  AppWindow,
  Archive,
  BedDouble,
  BookCopy,
  Cat,
  Clock,
  CupSoda,
  Disc3,
  DoorOpen,
  Frame,
  Gamepad2,
  Headphones,
  KeyRound,
  Lamp,
  LayoutPanelTop,
  Mailbox,
  MailOpen,
  MoonStar,
  NotebookPen,
  Radio,
  RadioTower,
  Smartphone,
  Sofa,
  Sparkles,
  Sprout,
  StickyNote,
  UserRound,
}

export interface IconProps {
  /** lucide 图标名，例如 'Disc3'；找不到时退回 Sparkles */
  name: string | null | undefined
  className?: string
  /** 有语义的图标（按钮里）请传 label，纯装饰的保持默认 */
  label?: string
}

export function Icon({ name, className, label }: IconProps) {
  const Component = (name && ICONS[name]) || Sparkles

  return (
    <Component
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  )
}

export { ICONS }
