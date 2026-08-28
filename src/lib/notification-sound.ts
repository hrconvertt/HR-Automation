/**
 * The notification sound the bell plays when something new arrives.
 *
 * The setting has existed and saved for a while; nothing ever played it. Tones
 * are synthesised with WebAudio rather than shipped as audio files — three
 * short blips do not justify three network assets, and this way the sound is
 * identical everywhere with nothing to 404.
 *
 * Browsers refuse to start audio before the user has interacted with the page,
 * so the context is created lazily and resumed on the first gesture. If the
 * browser still refuses, nothing happens — a missed blip is not worth an error.
 */

export type NotificationSound = 'NONE' | 'CHIME' | 'PING' | 'KNOCK'

let ctx: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** One shaped tone. Attack/decay envelope so it reads as a blip, not a beep. */
function tone(ac: AudioContext, freq: number, startAt: number, durationMs: number, gainPeak: number, type: OscillatorType) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  const dur = durationMs / 1000
  osc.type = type
  osc.frequency.setValueAtTime(freq, startAt)
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(startAt)
  osc.stop(startAt + dur + 0.02)
}

export function playNotificationSound(sound: NotificationSound): void {
  if (sound === 'NONE') return
  const ac = context()
  if (!ac) return
  const t0 = ac.currentTime + 0.01

  try {
    if (sound === 'CHIME') {
      // Two notes a fifth apart — the usual "something arrived" shape.
      tone(ac, 880, t0, 260, 0.10, 'sine')
      tone(ac, 1318.5, t0 + 0.11, 300, 0.08, 'sine')
    } else if (sound === 'PING') {
      tone(ac, 1568, t0, 180, 0.09, 'triangle')
    } else if (sound === 'KNOCK') {
      // Low and dull, twice — a knock rather than a tone.
      tone(ac, 180, t0, 90, 0.16, 'sine')
      tone(ac, 150, t0 + 0.13, 110, 0.14, 'sine')
    }
  } catch {
    /* audio is a nicety — never let it surface as an error */
  }
}
