import type { ExperimentStatus } from '@/shared/types'

const colors: Record<ExperimentStatus, string> = {
  new: 'text-lab-green',
  draft: 'text-yellow-400/80',
  migrated: 'text-sky-400/80',
  polished: 'text-lab-green',
  archived: 'text-lab-dim',
}

export function StatusBadge({ status }: { status: ExperimentStatus }) {
  return (
    <span className={`text-[10px] uppercase tracking-widest ${colors[status]}`}>
      [{status}]
    </span>
  )
}
