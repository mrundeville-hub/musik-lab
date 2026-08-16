import { publicAsset } from '@/shared/lib/assets'

const LOGO_SRC = publicAsset('logo.png')

export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={LOGO_SRC}
      alt="musik.lab"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
    />
  )
}
