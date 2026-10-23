<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { makeNoise2D, rand } from '@/utils/noise'

const props = withDefaults(
  defineProps<{
    colors?: string[]
    count?: number
    minRadius?: number
    maxRadius?: number
    bottomBandStart?: number
    speed?: number
    noiseScale?: number
    noiseTimeScale?: number
    targetFps?: number
    regenerateKey?: number
  }>(),
  {
    colors: () => ['#f7da3987', '#8fdbe9', '#fffef8'],
    count: 6,
    minRadius: 250,
    maxRadius: 400,
    bottomBandStart: 0.8,
    speed: 0.12,
    noiseScale: 0.0008,
    noiseTimeScale: 0.00015,
    targetFps: 6,
    regenerateKey: 0
  }
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animFrame = 0
let ro: ResizeObserver | null = null
let resizeTimer: number | null = null
let disposed = false

function start() {
  const canvas = canvasRef.value
  if (!canvas) return
  const noise = makeNoise2D()

  const startInternal = () => {
    const ctx = canvas.getContext('2d')!
    if (!ctx) return
    let width = (canvas.width = canvas.clientWidth)
    let height = (canvas.height = canvas.clientHeight)

    const DPR = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.floor(width * DPR)
    canvas.height = Math.floor(height * DPR)
    ctx.scale(DPR, DPR)

    const effectiveFps = Math.max(1, props.targetFps)

    const handleResize = () => {
      const nextWidth = canvas.clientWidth
      const nextHeight = canvas.clientHeight
      if (nextWidth === width && nextHeight === height) return
      width = nextWidth
      height = nextHeight
      canvas.width = Math.floor(width * DPR)
      canvas.height = Math.floor(height * DPR)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(DPR, DPR)
      allocateGrid()
      draw()
    }
    const onResize = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        handleResize()
        resizeTimer = null
      }, 1000)
    }
    ro = new ResizeObserver(onResize)
    ro.observe(canvas)

    // --- Occupancy grid ---
    const gridCell = 80
    let gridCols = 0
    let gridRows = 0
    let grid = new Float32Array(0)

    function allocateGrid() {
      gridCols = Math.max(1, Math.ceil(width / gridCell))
      gridRows = Math.max(1, Math.ceil(height / gridCell))
      grid = new Float32Array(gridCols * gridRows)
    }
    function stampOccupancy(x: number, y: number, r: number) {
      const c0 = Math.floor((x - r) / gridCell)
      const c1 = Math.floor((x + r) / gridCell)
      const r0 = Math.floor((y - r) / gridCell)
      const r1 = Math.floor((y + r) / gridCell)
      for (let cy = r0; cy <= r1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
          if (cx < 0 || cy < 0 || cx >= gridCols || cy >= gridRows) continue
          grid[cy * gridCols + cx] += 0.5
        }
      }
    }
    function lowestOccupancyTarget() {
      const startRow = Math.floor(gridRows * props.bottomBandStart)
      let bestIdx = startRow * gridCols
      let bestVal = Infinity
      for (let cy = startRow; cy < gridRows; cy++) {
        for (let cx = 0; cx < gridCols; cx++) {
          const idx = cy * gridCols + cx
          const v = grid[idx]
          if (v < bestVal) {
            bestVal = v
            bestIdx = idx
          }
        }
      }
      return {
        tx: ((bestIdx % gridCols) + 0.5) * gridCell,
        ty: (Math.floor(bestIdx / gridCols) + 0.5) * gridCell
      }
    }
    allocateGrid()

    interface Bubble {
      x: number
      y: number
      r: number
      color: string
      vx: number
      vy: number
      jitter: number
      blur: number
    }

    const bubbles: Bubble[] = []
    const minDist = Math.max(props.minRadius * 0.2, 80)
    const maxTries = 5000
    let tries = 0
    const colors = props.colors.length ? props.colors : ['#f7da3987', '#8fdbe9', '#fffef8']
    while (bubbles.length < props.count && tries < maxTries) {
      tries++
      const r = rand(props.minRadius, props.maxRadius)
      const x = rand(-r / 2, width + r / 2)
      const y = rand(height * props.bottomBandStart, height * 1.2)
      let ok = true
      for (const b of bubbles) {
        const dx = b.x - x
        const dy = b.y - y
        if (Math.hypot(dx, dy) < (b.r + r) * 0.6 || Math.hypot(dx, dy) < minDist) {
          ok = false
          break
        }
      }
      if (ok) {
        bubbles.push({
          x,
          y,
          r,
          color: colors[bubbles.length % colors.length],
          vx: rand(-0.2, 0.2),
          vy: rand(-0.2, 0.2),
          jitter: rand(0.6, 1.2),
          blur: rand(200, 400)
        })
      }
    }

    const FRAME_INTERVAL = 1000 / effectiveFps
    let lastTime = 0
    let accumulatedTime = 0

    function updatePhysics(t: number) {
      const { tx, ty } = lowestOccupancyTarget()
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i]
        const n = noise(b.x * props.noiseScale, b.y * props.noiseScale + t * props.noiseTimeScale)
        const angle = n * Math.PI * 2
        const fx = Math.cos(angle) * props.speed * b.jitter
        const fy = Math.sin(angle) * props.speed * b.jitter

        let sx = 0
        let sy = 0
        for (let j = 0; j < bubbles.length; j++) {
          if (j !== i) {
            const o = bubbles[j]
            const dx = b.x - o.x
            const dy = b.y - o.y
            const d2 = dx * dx + dy * dy
            const minD = (b.r + o.r) * 0.4
            if (d2 < minD * minD && d2 > 0.001) {
              const d = Math.sqrt(d2)
              const push = (minD - d) / minD
              sx += (dx / d) * push * 0.8
              sy += (dy / d) * push * 0.8
            }
          }
        }

        const dxT = tx - b.x
        const dyT = ty - b.y
        const dT = Math.hypot(dxT, dyT) + 1e-3
        const cx = (dxT / dT) * 0.05
        const cy = (dyT / dT) * 0.05

        const bandMin = height * props.bottomBandStart
        const bandMax = height * 1.5
        let bx = 0
        let by = 0
        if (b.y < bandMin) by += (bandMin - b.y) * 0.01
        if (b.y > bandMax) by -= (b.y - bandMax) * 0.01

        b.vx += fx + sx + cx + bx
        b.vy += fy + sy + cy + by

        const damping = 0.95
        b.vx *= damping
        b.vy *= damping

        const maxVel = 2
        const vel = Math.hypot(b.vx, b.vy)
        if (vel > maxVel) {
          b.vx = (b.vx / vel) * maxVel
          b.vy = (b.vy / vel) * maxVel
        }

        b.x += b.vx
        b.y += b.vy

        if (b.x < -b.r - b.blur / 3) b.x = width + b.r + b.blur / 3
        if (b.x > width + b.r + b.blur / 3) b.x = -b.r - b.blur / 3

        b.y = Math.min(Math.max(b.y, bandMin - b.r * 0.25), bandMax + b.r * 0.25)

        stampOccupancy(b.x, b.y, b.r * 0.6)
      }
    }
    function draw() {
      for (const b of bubbles) {
        ctx.save()
        ctx.filter = `blur(${b.blur}px)`
        ctx.globalAlpha = 0.8
        ctx.beginPath()
        ctx.fillStyle = b.color
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    function frame(t: number) {
      if (disposed) return
      if (document.hidden) {
        animFrame = requestAnimationFrame(frame)
        return
      }
      const deltaTime = lastTime ? t - lastTime : 0
      lastTime = t
      accumulatedTime += deltaTime
      if (accumulatedTime < FRAME_INTERVAL) {
        animFrame = requestAnimationFrame(frame)
        return
      }
      accumulatedTime = 0

      ctx.clearRect(0, 0, width, height)
      updatePhysics(t)
      draw()
      animFrame = requestAnimationFrame(frame)
    }

    if (window.innerWidth < 640) {
      setTimeout(() => {
        animFrame = requestAnimationFrame(frame)
      }, 1500)
    }

    draw()
  }

  startInternal()
}

function cleanup() {
  disposed = true
  cancelAnimationFrame(animFrame)
  ro?.disconnect()
  if (resizeTimer !== null) window.clearTimeout(resizeTimer)
}

onMounted(() => {
  disposed = false
  start()
})

onUnmounted(() => {
  cleanup()
})

watch(
  () => props.regenerateKey,
  () => {
    cleanup()
    disposed = false
    start()
  }
)
</script>

<template>
  <div class="fixed inset-0 z-0 overflow-hidden" style="filter: blur(50px); opacity: 1; transition: opacity 1s">
    <canvas ref="canvasRef" class="h-full w-full" style="display: block"></canvas>
  </div>
</template>
