'use client'

/**
 * Draw-your-signature field.
 *
 * Mouse, trackpad or finger — pointer events cover all three, so there is no
 * separate touch path to keep in step. The result is a transparent PNG data
 * URI, which drops straight onto a letter without a white box around it.
 *
 * The canvas is drawn at device resolution and displayed at CSS size, because
 * a signature captured at 1x and printed at 300dpi looks like a fax.
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser, PenLine } from 'lucide-react'

const PEN_COLOUR = '#16171A'
const PEN_WIDTH = 2.2

export function SignaturePad({ value, onChange, disabled, height = 150 }: {
  /** Existing signature as a PNG data URI, or null. */
  value: string | null
  onChange: (dataUrl: string | null) => void
  disabled?: boolean
  height?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [hasInk, setHasInk] = useState(!!value)

  // Size the backing store to the element, and restore any saved signature
  // into it so re-opening the form shows what was signed rather than a blank.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = PEN_WIDTH
    ctx.strokeStyle = PEN_COLOUR

    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = value
      setHasInk(true)
    }
    // Re-running on every `value` change would wipe strokes mid-draw; the
    // saved signature only needs restoring when the pad first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = pointFrom(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pointFrom(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    dirty.current = true
    if (!hasInk) setHasInk(true)
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (!dirty.current) return
    dirty.current = false
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <div className="relative rounded-lg border border-slate-300 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: 'none' }}
          className={`w-full block ${disabled ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {!hasInk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-slate-300 flex items-center gap-1.5">
              <PenLine className="w-3.5 h-3.5" /> Sign here
            </span>
          </div>
        )}
        {/* The rule people actually sign on. */}
        <div className="absolute left-8 right-8 bottom-7 border-b border-dashed border-slate-200 pointer-events-none" />
      </div>
      {!disabled && (
        <div className="flex justify-end mt-1.5">
          <Button size="sm" variant="ghost" onClick={clear} disabled={!hasInk}>
            <Eraser className="w-3.5 h-3.5 mr-1.5" /> Clear
          </Button>
        </div>
      )}
    </div>
  )
}
