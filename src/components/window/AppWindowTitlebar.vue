<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import AppIcon from '../AppIcon.vue'

const emit = defineEmits<{ 'open-settings': [] }>()

const maximized = shallowRef(false)
const controls = typeof window !== 'undefined' ? window.lowcode?.window : undefined
let stopListening: (() => void) | undefined

const maximizeLabel = computed(() => maximized.value ? 'Restore window' : 'Maximize window')
const maximizeIcon = computed(() => maximized.value ? 'window-restore' : 'window-maximize')

async function syncState() {
  if (!controls) return
  try {
    maximized.value = (await controls.getState()).maximized
  } catch {
    // Browser preview or a window that is already closing.
  }
}

async function minimize() {
  try {
    await controls?.minimize()
  } catch {
    // The window may already be closing.
  }
}

async function toggleMaximize() {
  if (!controls) return
  try {
    maximized.value = (await controls.toggleMaximize()).maximized
  } catch {
    // The window may be closing.
  }
}

async function close() {
  try {
    await controls?.close()
  } catch {
    // The window may already be closing.
  }
}

onMounted(() => {
  if (!controls) return
  void syncState()
  stopListening = controls.onStateChange(state => {
    maximized.value = state.maximized
  })
})

onBeforeUnmount(() => stopListening?.())
</script>

<template>
  <header
    class="app-window-titlebar"
    data-testid="app-window-titlebar"
    aria-label="Codeless application window bar"
    @dblclick="toggleMaximize"
  >
    <div class="app-window-drag-region" aria-hidden="true"></div>
    <div class="app-window-brand" data-no-drag>
      <span class="app-window-brand-mark"><img src="/logo.png" alt="" /></span>
      <span class="app-window-brand-copy"><strong>Codeless</strong><small>Local workspace</small></span>
    </div>
    <div class="app-window-caption" aria-hidden="true">Design and build locally</div>
    <div class="app-window-controls" role="group" aria-label="Window controls" data-no-drag @dblclick.stop>
      <button class="app-window-settings" type="button" aria-label="打开显示设置" title="显示设置" @click="emit('open-settings')">
        <AppIcon name="settings" :size="15" />
      </button>
      <button type="button" aria-label="Minimize window" title="Minimize" @click="minimize">
        <AppIcon name="window-minimize" :size="15" />
      </button>
      <button type="button" :aria-label="maximizeLabel" :title="maximizeLabel" @click="toggleMaximize">
        <AppIcon :name="maximizeIcon" :size="15" />
      </button>
      <button class="close" type="button" aria-label="Close window" title="Close" @click="close">
        <AppIcon name="close" :size="15" />
      </button>
    </div>
  </header>
</template>
