import { Fragment } from 'react'

type Props = { text: string; as?: 'h1' | 'h2' | 'h3'; className?: string; reveal?: boolean }

// "*szó*" = rózsaarany kiemelés, "\n" = sortörés. Minden szó külön maszkban van, a GSAP ezeket csúsztatja be.
export function Headline({ text, as: Tag = 'h2', className = '', reveal = true }: Props) {
  // A szavak külön maszkokban vannak az animáció miatt; a képernyőolvasó egyben, a teljes mondatot kapja
  const label = text.replace(/\*/g, '').replace(/\s*\n\s*/g, ' ').trim()
  return (
    <Tag className={`headline ${className}`} data-words={reveal ? '' : undefined} aria-label={label}>
      {text.split('\n').map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {line.split(/(\*[^*]+\*)/).filter(Boolean).map((chunk, chunkIndex) => {
            const accent = chunk.startsWith('*')
            return (accent ? chunk.slice(1, -1) : chunk).split(' ').filter(Boolean).map((word, wordIndex) => (
              <Fragment key={`${chunkIndex}-${wordIndex}`}>
                <span className="w" aria-hidden="true"><span className={accent ? 'wi accent' : 'wi'}>{word}</span></span>{' '}
              </Fragment>
            ))
          })}
        </Fragment>
      ))}
    </Tag>
  )
}
