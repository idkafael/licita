/**
 * Polyfills mínimos para rodar pdfjs-dist no Node.js / Vercel.
 * pdfjs-dist espera DOMMatrix, ImageData e Path2D do browser.
 * Essas implementações são suficientes para extração de texto.
 */

export function setupPDFPolyfills() {
  // ── DOMMatrix ──────────────────────────────────────────────────────────────
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      m11 = 1; m12 = 0; m13 = 0; m14 = 0
      m21 = 0; m22 = 1; m23 = 0; m24 = 0
      m31 = 0; m32 = 0; m33 = 1; m34 = 0
      m41 = 0; m42 = 0; m43 = 0; m44 = 1
      is2D = true; isIdentity = true

      constructor(init?: string | number[]) {
        if (Array.isArray(init)) {
          if (init.length === 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = init
            this.m11 = init[0]; this.m12 = init[1]
            this.m21 = init[2]; this.m22 = init[3]
            this.m41 = init[4]; this.m42 = init[5]
          } else if (init.length === 16) {
            this.m11 = init[0];  this.m12 = init[1];  this.m13 = init[2];  this.m14 = init[3]
            this.m21 = init[4];  this.m22 = init[5];  this.m23 = init[6];  this.m24 = init[7]
            this.m31 = init[8];  this.m32 = init[9];  this.m33 = init[10]; this.m34 = init[11]
            this.m41 = init[12]; this.m42 = init[13]; this.m43 = init[14]; this.m44 = init[15]
            this.a = init[0]; this.b = init[1]; this.c = init[4]; this.d = init[5]
            this.e = init[12]; this.f = init[13]
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      multiply(m: any) {
        const n = new (globalThis as any).DOMMatrix()
        n.a  = this.a * m.a  + this.c * m.b
        n.b  = this.b * m.a  + this.d * m.b
        n.c  = this.a * m.c  + this.c * m.d
        n.d  = this.b * m.c  + this.d * m.d
        n.e  = this.a * m.e  + this.c * m.f  + this.e
        n.f  = this.b * m.e  + this.d * m.f  + this.f
        return n
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transformPoint(p: any = {}) {
        return {
          x: this.a * (p.x ?? 0) + this.c * (p.y ?? 0) + this.e,
          y: this.b * (p.x ?? 0) + this.d * (p.y ?? 0) + this.f,
          z: p.z ?? 0,
          w: p.w ?? 1,
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translate(tx = 0, ty = 0, _tz = 0): any {
        const n = new (globalThis as any).DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f])
        n.e += tx; n.f += ty
        return n
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scale(sx = 1, sy = sx): any {
        return new (globalThis as any).DOMMatrix([this.a * sx, this.b * sx, this.c * sy, this.d * sy, this.e, this.f])
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inverse(): any { return new (globalThis as any).DOMMatrix() }

      toString() {
        return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`
      }
    }
  }

  // ── ImageData ─────────────────────────────────────────────────────────────
  if (typeof globalThis.ImageData === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).ImageData = class ImageData {
      data: Uint8ClampedArray
      width: number
      height: number
      colorSpace = 'srgb'

      constructor(swOrData: number | Uint8ClampedArray, sh: number) {
        if (typeof swOrData === 'number') {
          this.width  = swOrData
          this.height = sh
          this.data   = new Uint8ClampedArray(swOrData * sh * 4)
        } else {
          this.data   = swOrData
          this.width  = sh
          this.height = swOrData.length / sh / 4
        }
      }
    }
  }

  // ── Path2D ────────────────────────────────────────────────────────────────
  if (typeof globalThis.Path2D === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).Path2D = class Path2D {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(_path?: any) {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addPath(_p: any, _t?: any) {}
      closePath() {}
      moveTo(_x: number, _y: number) {}
      lineTo(_x: number, _y: number) {}
      bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, _x: number, _y: number) {}
      quadraticCurveTo(_cpx: number, _cpy: number, _x: number, _y: number) {}
      arc(_x: number, _y: number, _r: number, _sa: number, _ea: number, _ac?: boolean) {}
      arcTo(_x1: number, _y1: number, _x2: number, _y2: number, _r: number) {}
      ellipse(_x: number, _y: number, _rx: number, _ry: number, _rot: number, _sa: number, _ea: number) {}
      rect(_x: number, _y: number, _w: number, _h: number) {}
    }
  }
}
