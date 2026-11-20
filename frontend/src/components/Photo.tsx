import { photos } from '../lib/images'

type Props = { id: keyof typeof photos; sizes?: string; eager?: boolean; className?: string; alt?: string }

export function Photo({ id, sizes = '(min-width: 900px) 40vw, 90vw', eager = false, className, alt }: Props) {
  const photo = photos[id]
  const base = `${import.meta.env.BASE_URL}images/${photo.name}`
  return (
    <img
      className={className} src={`${base}.webp`} width={photo.w} height={photo.h}
      srcSet={`${base}-xs.webp 400w, ${base}-sm.webp 640w, ${base}.webp ${photo.w}w`} sizes={sizes}
      alt={alt ?? photo.alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding={eager ? 'auto' : 'async'} style={photo.focus ? { objectPosition: photo.focus } : undefined}
    />
  )
}
