<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElButton, ElDialog, ElDivider, ElIcon, ElInput, ElTag } from 'element-plus/dist/index.full.js'
import type { PublishedServiceInfo } from '../../types/lowcode'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  service: PublishedServiceInfo | null
  publishing: boolean
}>()
const emit = defineEmits<{
  publish: []
  stop: []
}>()

const urls = computed(() => props.service ? [props.service.localUrl, ...props.service.lanUrls] : [])

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const input = document.createElement('textarea')
    input.value = value
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }
}
</script>

<template>
  <ElDialog v-model="open" title="局域网发布" width="min(620px, calc(100vw - 32px))" :close-on-click-modal="false">
    <template v-if="service">
      <ElAlert type="success" :closable="false" show-icon title="独立子服务正在运行" description="该服务监听局域网地址；关闭桌面应用或点击停止后服务会退出。" />
      <ElDivider />
      <div class="publish-service-meta"><span>端口</span><ElTag type="success">{{ service.port }}</ElTag><span>发布时间</span><small>{{ new Date(service.publishedAt).toLocaleString('zh-CN') }}</small></div>
      <div class="publish-url-list">
        <label v-for="url in urls" :key="url">
          <span>{{ url === service.localUrl ? '本机访问' : '局域网访问' }}</span>
          <div><ElInput :model-value="url" readonly /><ElButton circle title="复制地址" @click="copy(url)" /></div>
        </label>
      </div>
    </template>
    <ElAlert v-else type="info" :closable="false" show-icon title="尚未启动发布服务" description="点击“发布”后会保存当前设计，并在本机开启一个可被局域网设备访问的独立服务。" />
    <template #footer>
      <ElButton v-if="service" type="danger" plain @click="emit('stop')">停止服务</ElButton>
      <ElButton @click="open = false">关闭</ElButton>
      <ElButton type="primary" :loading="publishing" @click="emit('publish')">{{ service ? '重新发布' : '发布' }}</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.publish-service-meta { display: flex; align-items: center; gap: 8px; color: #606266; font-size: 13px; }
.publish-service-meta small { margin-right: auto; color: #909399; }
.publish-url-list { display: grid; gap: 12px; margin-top: 16px; }
.publish-url-list label { display: grid; gap: 6px; }
.publish-url-list label > span { display: flex; align-items: center; gap: 6px; color: #606266; font-size: 13px; }
.publish-url-list label > div { display: flex; gap: 8px; }
</style>
