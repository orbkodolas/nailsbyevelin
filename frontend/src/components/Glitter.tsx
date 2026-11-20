import { useEffect, useRef } from 'react'
import { reducedMotion } from '../lib/motion'

type Star = { x: number; y: number; r: number; phase: number; speed: number; tone: number }
const TONES = ['255,226,226', '244,196,205', '236,208,176', '255,255,255']

// Finom csillogás canvasen: csak látható állapotban fut, kímélő mobilon, mozgáscsökkentésnél állókép
export function Glitter({ count = 40, className = '' }: { count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const parent = canvas.parentElement as HTMLElement
    const small = window.matchMedia('(max-width: 700px)').matches
    const total = small ? Math.round(count * 0.55) : count
    let width = 0; let height = 0; let stars: Star[] = []; let frame = 0; let visible = true
    const ratio = Math.min(window.devicePixelRatio || 1, 2)

    const seed = () => {
      stars = Array.from({ length: total }, () => ({
        x: Math.random() * width, y: Math.random() * height, r: 2 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 1.2, tone: Math.floor(Math.random() * TONES.length),
      }))
    }
    const resize = () => {
      width = parent.clientWidth; height = parent.clientHeight
      canvas.width = width * ratio; canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      seed(); draw(0)
    }
    const star = (x: number, y: number, r: number) => {
      context.beginPath()
      context.moveTo(x, y - r)
      context.quadraticCurveTo(x, y, x + r, y)
      context.quadraticCurveTo(x, y, x, y + r)
      context.quadraticCurveTo(x, y, x - r, y)
      context.quadraticCurveTo(x, y, x, y - r)
      context.fill()
    }
    function draw(time: number) {
      context.clearRect(0, 0, width, height)
      for (const s of stars) {
        const alpha = reducedMotion() ? 0.5 : Math.max(0, Math.sin(time * s.speed + s.phase)) ** 2
        if (alpha < 0.02) continue
        context.fillStyle = `rgba(${TONES[s.tone]},${alpha * 0.9})`
        star(s.x, s.y, s.r * (0.6 + alpha * 0.6))
      }
    }
    const loop = (ms: number) => { draw(ms / 1000); frame = requestAnimationFrame(loop) }
    const start = () => { if (!frame && visible && !reducedMotion()) frame = requestAnimationFrame(loop) }
    const stop = () => { cancelAnimationFrame(frame); frame = 0 }

    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(parent)
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop() })
    intersection.observe(parent)
    resize(); start()
    return () => { stop(); resizeObserver.disconnect(); intersection.disconnect() }
  }, [count])

  return <canvas ref={ref} className={`glitter ${className}`} aria-hidden="true" />
}
