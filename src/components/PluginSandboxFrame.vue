<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PluginPermission } from '../types/plugin'

const props = defineProps<{
  src: string
  pluginId: string
  permissions: PluginPermission[]
}>()

defineEmits<{
  close: []
}>()

const frame = ref<HTMLIFrameElement | null>(null)

function postInit() {
  const target = frame.value?.contentWindow
  if (!target) return
  // sandbox 不授予 allow-same-origin，因此只能使用 *；消息不会携带项目数据，
  // 接收方向也会严格校验为当前 iframe 的 contentWindow。
  target.postMessage({
    type: 'codeless:init',
    apiVersion: 1,
    pluginId: props.pluginId,
    permissions: [...props.permissions],
  }, '*')
}

function handleMessage(event: MessageEvent<unknown>) {
  if (!frame.value?.contentWindow || event.source !== frame.value.contentWindow) return
  if (!event.data || typeof event.data !== 'object' || (event.data as { type?: unknown }).type !== 'codeless:ready') return
  postInit()
}

function handleLoad() {
  void nextTick(postInit)
}

watch(() => [props.src, props.pluginId], () => { void nextTick(postInit) })

onMounted(() => window.addEventListener('message', handleMessage))
onBeforeUnmount(() => window.removeEventListener('message', handleMessage))
</script>

<template>
  <div class="plugin-sandbox-backdrop" role="dialog" aria-modal="true" aria-label="插件 UI" @click.self="$emit('close')">
    <section class="plugin-sandbox-dialog">
      <header class="plugin-sandbox-header">
        <div>
          <span class="section-kicker">SANDBOX PLUGIN</span>
          <strong>{{ pluginId }}</strong>
        </div>
        <button class="icon-button" title="关闭插件 UI" @click="$emit('close')">×</button>
      </header>
      <div class="plugin-sandbox-notice">
        <span>沙箱 iframe</span>
        <small>仅允许脚本运行，不授予同源、表单、弹窗、导航或网络能力。</small>
      </div>
      <iframe
        ref="frame"
        :src="src"
        class="plugin-sandbox-frame"
        sandbox="allow-scripts"
        referrerpolicy="no-referrer"
        title="本地插件 UI"
        @load="handleLoad"
      ></iframe>
    </section>
  </div>
</template>
