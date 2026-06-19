import { Link } from 'react-router-dom'

export function FinderRow({
  index,
  selected,
  onClick,
  name,
  kind,
  tag,
  href,
}: {
  index: number
  selected?: boolean
  onClick?: () => void
  name: string
  kind: string
  tag: string
  href?: string
}) {
  const base =
    'grid grid-cols-[1.4rem_1fr_5rem_6rem] items-center gap-2 px-3 py-1.5 text-[13px] cursor-default'
  const tone = selected
    ? 'bg-aqua-blue text-white'
    : index % 2 === 0
      ? 'bg-row text-ink2'
      : 'bg-row-alt text-ink2'
  const content = (
    <>
      <span aria-hidden className="halftone size-3.5 rounded-[3px] border border-black/20" />
      <span className="truncate font-medium">{name}</span>
      <span className={selected ? 'text-white/80' : 'text-ink-dim'}>{kind}</span>
      <span className={`truncate ${selected ? 'text-white/80' : 'text-ink-dim'}`}>{tag}</span>
    </>
  )
  if (href) {
    return (
      <Link to={href} className={`${base} ${tone}`} onClick={onClick}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`w-full text-left ${base} ${tone}`}>
      {content}
    </button>
  )
}
