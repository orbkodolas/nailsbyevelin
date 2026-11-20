import { photos } from '../lib/images'

type Props = { id: keyof typeof photos; sizes?: string; eager?: boolean; className?: string; alt?: string }

export function Photo({ id, sizes = '(min-width: 900px) 40vw, 90vw', eager = false, className, alt }: Props) {
  const photo = photos[id]
  return (
    <img
      className={className} src={`${import.meta.env.BASE_URL}images/${photo.name}.webp`} width={photo.w} height={photo.h}
      srcSet={`${import.meta.env.BASE_URL}images/${photo.name}-sm.webp 640w, ${import.meta.env.BASE_URL}images/${photo.name}.webp ${photo.w}w`} sizes={sizes}
      alt={alt ?? photo.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" style={photo.focus ? { objectPosition: photo.focus } : undefined}
    />
  )
}
