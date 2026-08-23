<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LowCodeWidget, WidgetLayoutConfig } from '../types/lowcode'
import { getWidgetConfig } from '../composables/widgetConfig'

type WebGLContext = WebGLRenderingContext | WebGL2RenderingContext

defineOptions({ name: 'CanvasWebGLLayer' })

const props = defineProps<{
  widgets: LowCodeWidget[]
  visibleIds: ReadonlySet<string> | Set<string> | string[]
  renderIds?: ReadonlySet<string> | Set<string> | string[]
  enabled: boolean
  zoom: number
  canvasWidth: number
  canvasHeight: number
  getFrame: (widget: LowCodeWidget) => WidgetLayoutConfig
}>()

const emit = defineEmits<{
  (event: 'webgl-ready', supported: boolean): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let gl: WebGLContext | null = null
let program: WebGLProgram | null = null
let positionBuffer: WebGLBuffer | null = null
let positionLocation = -1
let resolutionLocation: WebGLUniformLocation | null = null
let rotationLocation: WebGLUniformLocation | null = null
let originLocation: WebGLUniformLocation | null = null
let colorLocation: WebGLUniformLocation | null = null
let shapeLocation: WebGLUniformLocation | null = null
let sizeLocation: WebGLUniformLocation | null = null
let frameHandle = 0
let contextLost = false

const vertexShaderSource = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  uniform float u_rotation;
  uniform vec2 u_origin;
  uniform vec2 u_size;
  varying vec2 v_local;

  void main() {
    v_local = (a_position - (u_origin - u_size * 0.5)) / u_size;
    float cosine = cos(u_rotation);
    float sine = sin(u_rotation);
    vec2 relative = a_position - u_origin;
    vec2 rotated = vec2(
      relative.x * cosine - relative.y * sine,
      relative.x * sine + relative.y * cosine
    ) + u_origin;
    vec2 zeroToOne = rotated / u_resolution;
    vec2 clipSpace = zeroToOne * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  }
`

const fragmentShaderSource = `
  precision mediump float;
  uniform vec4 u_color;
  uniform int u_shape;
  varying vec2 v_local;

  void main() {
    if (u_shape == 1) {
      vec2 point = v_local * 2.0 - 1.0;
      if (dot(point, point) > 1.0) discard;
    }
    gl_FragColor = u_color;
  }
`

function shaderType(glContext: WebGLContext, type: number, source: string) {
  const shader = glContext.createShader(type)
  if (!shader) return null
  glContext.shaderSource(shader, source)
  glContext.compileShader(shader)
  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    glContext.deleteShader(shader)
    return null
  }
  return shader
}

function setupContext() {
  const canvas = canvasRef.value
  if (!canvas) return false
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true })
      || canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true })
  } catch {
    gl = null
  }
  if (!gl) return false

  const vertexShader = shaderType(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = shaderType(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
  if (!vertexShader || !fragmentShader) return false
  program = gl.createProgram()
  if (!program) return false
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    program = null
    return false
  }

  positionBuffer = gl.createBuffer()
  if (!positionBuffer) return false
  positionLocation = gl.getAttribLocation(program, 'a_position')
  resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  rotationLocation = gl.getUniformLocation(program, 'u_rotation')
  originLocation = gl.getUniformLocation(program, 'u_origin')
  colorLocation = gl.getUniformLocation(program, 'u_color')
  shapeLocation = gl.getUniformLocation(program, 'u_shape')
  sizeLocation = gl.getUniformLocation(program, 'u_size')
  if (positionLocation < 0 || !resolutionLocation || !rotationLocation || !originLocation || !shapeLocation || !sizeLocation || !colorLocation) return false

  canvas.addEventListener('webglcontextlost', handleContextLost, false)
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  return true
}

function disposeContext() {
  const canvas = canvasRef.value
  canvas?.removeEventListener('webglcontextlost', handleContextLost)
  canvas?.removeEventListener('webglcontextrestored', handleContextRestored)
  if (gl && program) gl.deleteProgram(program)
  if (gl && positionBuffer) gl.deleteBuffer(positionBuffer)
  gl = null
  program = null
  positionBuffer = null
}

function handleContextLost(event: Event) {
  event.preventDefault()
  contextLost = true
  emit('webgl-ready', false)
}

function handleContextRestored() {
  contextLost = false
  disposeContext()
  if (setupContext()) {
    emit('webgl-ready', true)
    schedulePaint()
  }
}

function contains(ids: ReadonlySet<string> | Set<string> | string[], id: string) {
  return Array.isArray(ids) ? ids.includes(id) : ids.has(id)
}

function visible(id: string) {
  return contains(props.visibleIds, id) && (!props.renderIds || contains(props.renderIds, id))
}

function colorFrom(value: unknown, fallback: [number, number, number, number]): [number, number, number, number] {
  if (typeof value !== 'string') return fallback
  const source = value.trim().toLowerCase()
  if (source === 'transparent') return [0, 0, 0, 0]
  const hex = source.replace('#', '')
  if (/^[0-9a-f]{3,4}$/i.test(hex)) {
    const channels = hex.split('').map(channel => parseInt(channel + channel, 16) / 255)
    return [channels[0], channels[1], channels[2], channels[3] ?? 1]
  }
  if (/^[0-9a-f]{6,8}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255, hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1]
  }
  const rgb = source.match(/^rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)$/)
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, rgb[4] === undefined ? 1 : Number(rgb[4])]
  return fallback
}

function primitiveKind(widget: LowCodeWidget) {
  if (widget.type === 'divider') return 'line'
  if (widget.type === 'avatar') return 'ellipse'
  if (widget.type === 'card' || widget.type === 'frame') return 'rectangle'
  return ''
}

function drawWidget(widget: LowCodeWidget, index: number) {
  if (!gl || !program || !positionBuffer || !resolutionLocation || !rotationLocation || !originLocation || !colorLocation || !shapeLocation || !sizeLocation) return
  const kind = primitiveKind(widget)
  if (!kind || !visible(widget.id)) return
  const frame = props.getFrame(widget)
  if (frame.hidden || frame.width <= 0 || frame.height <= 0) return
  const config = getWidgetConfig(widget)
  const style = config.style
  let x = Number(frame.x) || 0
  let y = Number(frame.y) || 0
  let width = Math.max(1, Number(frame.width) || 1)
  let height = Math.max(1, Number(frame.height) || 1)
  let shape = 0
  if (kind === 'ellipse') {
    shape = 1
  } else if (kind === 'line') {
    const thickness = Math.max(1, Number(style.borderWidth) || 1)
    y += (height - thickness) / 2
    height = thickness
  }
  const rotation = (Number(frame.rotation) || 0) * Math.PI / 180
  const centerX = x + width / 2
  const centerY = y + height / 2
  const vertices = new Float32Array([
    x, y,
    x + width, y,
    x, y + height,
    x, y + height,
    x + width, y,
    x + width, y + height,
  ])
  const fallback: [number, number, number, number] = kind === 'line' ? [0.91, 0.91, 0.95, 1] : kind === 'ellipse' ? [0.4, 0.36, 0.96, 1] : [1, 1, 1, 1]
  const fill = kind === 'line' ? style.accent || style.background : style.background || style.accent
  const rgba = colorFrom(fill, fallback)
  rgba[3] *= Math.max(0, Math.min(1, Number(style.opacity) || 1))

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  gl.uniform2f(resolutionLocation, Math.max(1, props.canvasWidth), Math.max(1, props.canvasHeight))
  gl.uniform1f(rotationLocation, rotation)
  gl.uniform2f(originLocation, centerX, centerY)
  gl.uniform2f(sizeLocation, width, height)
  gl.uniform4f(colorLocation, rgba[0], rgba[1], rgba[2], rgba[3])
  gl.uniform1i(shapeLocation, shape)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
  void index
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
  const width = Math.max(1, Math.round(Math.max(1, props.canvasWidth) * ratio))
  const height = Math.max(1, Math.round(Math.max(1, props.canvasHeight) * ratio))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  canvas.style.width = `${Math.max(1, props.canvasWidth)}px`
  canvas.style.height = `${Math.max(1, props.canvasHeight)}px`
  if (gl) gl.viewport(0, 0, width, height)
}

function paint() {
  frameHandle = 0
  if (!gl || !program || contextLost) return
  resizeCanvas()
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  if (!props.enabled) return
  gl.useProgram(program)
  const widgets = props.widgets
    .map((widget, index) => ({ widget, index, zIndex: Number(props.getFrame(widget).zIndex) || 0 }))
    .filter(item => visible(item.widget.id))
    .sort((left, right) => left.zIndex - right.zIndex || left.index - right.index)
  widgets.forEach(item => drawWidget(item.widget, item.index))
}

function schedulePaint() {
  if (frameHandle || typeof requestAnimationFrame === 'undefined') return
  frameHandle = requestAnimationFrame(paint)
}

function handleResize() {
  resizeCanvas()
  schedulePaint()
}

onMounted(async () => {
  await nextTick()
  const supported = setupContext()
  emit('webgl-ready', supported)
  if (supported) schedulePaint()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (frameHandle) cancelAnimationFrame(frameHandle)
  frameHandle = 0
  disposeContext()
})

watch(() => [props.widgets, props.visibleIds, props.enabled, props.zoom, props.canvasWidth, props.canvasHeight], () => {
  schedulePaint()
}, { deep: true })
</script>

<template>
  <canvas ref="canvasRef" class="canvas-webgl-layer" data-testid="canvas-webgl-layer" aria-hidden="true"></canvas>
</template>
