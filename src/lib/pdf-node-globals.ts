/**
 * The browser globals pdf.js expects, for when it runs on the server.
 *
 * Every CV upload was failing with "DOMMatrix is not defined". pdf-parse wraps
 * pdf.js, which reaches for DOMMatrix, Path2D and ImageData as soon as it
 * loads — they exist in a browser and do not exist in Node, so the import blew
 * up before a single page was read and the screening dialog showed three red
 * rows and four zeroes.
 *
 * Pulling in a canvas library to supply them would add a native dependency to
 * a Vercel build for the sake of text extraction that never draws anything.
 * These are the real operations instead, small enough to read: a 2D affine
 * matrix, and two stubs for the classes text extraction never calls.
 *
 * Call installPdfGlobals() before importing pdf-parse.
 */

class Matrix2D {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0

  constructor(init?: number[] | string) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init
    } else if (typeof init === 'string') {
      const n = init.match(/-?\d*\.?\d+/g)?.map(Number)
      if (n && n.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = n
    }
  }

  private static from(a: number, b: number, c: number, d: number, e: number, f: number) {
    return new Matrix2D([a, b, c, d, e, f])
  }

  multiply(o: Matrix2D): Matrix2D {
    return Matrix2D.from(
      this.a * o.a + this.c * o.b,
      this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d,
      this.b * o.c + this.d * o.d,
      this.a * o.e + this.c * o.f + this.e,
      this.b * o.e + this.d * o.f + this.f,
    )
  }

  translate(tx = 0, ty = 0): Matrix2D {
    return this.multiply(Matrix2D.from(1, 0, 0, 1, tx, ty))
  }

  scale(sx = 1, sy = sx): Matrix2D {
    return this.multiply(Matrix2D.from(sx, 0, 0, sy, 0, 0))
  }

  /** Identity when singular, which is what pdf.js does with a collapsed matrix. */
  inverse(): Matrix2D {
    const det = this.a * this.d - this.b * this.c
    if (!det) return new Matrix2D()
    return Matrix2D.from(
      this.d / det, -this.b / det,
      -this.c / det, this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    )
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0
      && this.d === 1 && this.e === 0 && this.f === 0
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`
  }
}

// Text extraction never rasterises, so these only have to exist.
class PathStub { constructor(_?: unknown) { /* nothing is drawn */ } }
class ImageDataStub {
  data: Uint8ClampedArray
  constructor(public width = 0, public height = 0) {
    this.data = new Uint8ClampedArray(Math.max(0, width * height * 4))
  }
}

export function installPdfGlobals(): void {
  const g = globalThis as Record<string, unknown>
  if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = Matrix2D
  if (typeof g.DOMMatrixReadOnly === 'undefined') g.DOMMatrixReadOnly = Matrix2D
  if (typeof g.Path2D === 'undefined') g.Path2D = PathStub
  if (typeof g.ImageData === 'undefined') g.ImageData = ImageDataStub
}
