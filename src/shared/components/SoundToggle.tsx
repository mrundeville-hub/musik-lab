export function SoundToggle({
  muted,
  onToggle,
}: {
  muted: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute bottom-4 right-4 rounded border border-white/20 bg-black/40 px-3 py-1.5 font-mono text-xs text-white/80 backdrop-blur transition hover:bg-black/60"
    >
      {muted ? '[🔇 sound off]' : '[🔊 sound on]'}
    </button>
  )
}
