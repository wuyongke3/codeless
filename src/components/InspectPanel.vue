<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { downloadLocalText, generateWidgetCode, generateWidgetSvg, inspectWidget, type InspectCodeFormat } from '../composables/inspect'
import { setWidgetConfigValue } from '../composables/widgetConfig'

type InspectUi = Record<string, any>
const props = defineProps<{ ui: InspectUi }>()
const state = reactive(props.ui)
const format = ref<InspectCodeFormat>('html')
const copied = ref(false)
const importing = ref(false)

const selectedWidget = computed(() => state.selectedWidget as any)
const model = computed(() => selectedWidget.value ? inspectWidget(selectedWidget.value, state.currentProject?.designSystem) : undefined)
const code = computed(() => selectedWidget.value ? generateWidgetCode(selectedWidget.value, format.value, state.currentProject?.designSystem) : '')
const formatLabels: Record<InspectCodeFormat, string> = { html: 'HTML', css: 'CSS', vue: 'Vue', json: 'JSON' }

function close() {
  state.toggleInspectPanel()
}

function safeFileName(value: string) {
  return String(value || 'widget').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'widget'
}

async function copyCode() {
  if (!code.value) return
  try {
    await navigator.clipboard?.writeText(code.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1200)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = code.value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1200)
  }
}

function exportCode() {
  if (!model.value || !code.value) return
  const extension = format.value === 'html' ? 'html' : format.value === 'css' ? 'css' : format.value === 'vue' ? 'vue' : 'json'
  downloadLocalText(`${safeFileName(model.value.name)}.${extension}`, code.value, extension === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8')
}

function exportSvg() {
  if (!selectedWidget.value || !model.value) return
  downloadLocalText(`${safeFileName(model.value.name)}.svg`, generateWidgetSvg(selectedWidget.value, state.currentProject?.designSystem), 'image/svg+xml;charset=utf-8')
}

async function importLocalAsset() {
  if (!selectedWidget.value) return
  importing.value = true
  try {
    const result = await state.importAsset()
    if (!result?.canceled && result.dataUrl) {
      setWidgetConfigValue(selectedWidget.value, 'content.src', result.dataUrl)
      setWidgetConfigValue(selectedWidget.value, 'content.alt', result.fileName || selectedWidget.value.name)
      state.syncWidget(selectedWidget.value)
      state.markDirty()
      state.notify(`已将本地素材嵌入 ${result.fileName || '当前组件'}`, 'success')
    }
  } catch (error) {
    state.notify(error instanceof Error ? error.message : '本地素材导入失败', 'danger')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <aside class="inspect-panel" data-testid="inspect-panel">
    <header class="inspect-panel-header">
      <div>
        <strong>Inspect / Codegen</strong>
        <small>本地属性检查、代码生成与 SVG 导出</small>
      </div>
      <button class="icon-button tiny" title="关闭" @click="close">×</button>
    </header>

    <div v-if="!model" class="inspect-empty">
      <AppIcon name="cursor" :size="24" />
      <strong>请先选择一个组件</strong>
      <p>Inspect 只读取当前本地项目数据，不会上传设计稿或代码。</p>
    </div>

    <template v-else>
      <section class="inspect-section inspect-summary">
        <div class="inspect-title-row"><span class="inspect-type-pill">{{ model.type }}</span><strong>{{ model.name }}</strong></div>
        <small>ID: {{ model.id }}</small>
        <div class="inspect-frame-grid">
          <span>X <b>{{ model.frame.x }}</b></span><span>Y <b>{{ model.frame.y }}</b></span><span>W <b>{{ model.frame.width }}</b></span><span>H <b>{{ model.frame.height }}</b></span>
        </div>
      </section>

      <section class="inspect-section">
        <div class="inspect-section-heading"><strong>属性与 Token</strong><small>{{ Object.keys(model.tokenRefs).length }} refs</small></div>
        <dl class="inspect-list">
          <div><dt>颜色</dt><dd>{{ model.style.color || '—' }}</dd></div>
          <div><dt>背景</dt><dd>{{ model.style.background || '—' }}</dd></div>
          <div><dt>圆角</dt><dd>{{ model.style.borderRadius ?? '—' }}</dd></div>
          <div><dt>字号</dt><dd>{{ model.style.fontSize ?? '—' }}</dd></div>
          <div v-for="(value, key) in model.tokenRefs" :key="key"><dt>{{ key }}</dt><dd>{{ value }} → {{ model.resolvedTokens[key] ?? '未解析' }}</dd></div>
        </dl>
      </section>

      <section class="inspect-section">
        <div class="inspect-section-heading"><strong>数据绑定</strong><small>{{ model.data.source || 'static' }}</small></div>
        <pre class="inspect-json">{{ JSON.stringify(model.data, null, 2) }}</pre>
      </section>

      <section class="inspect-section">
        <div class="inspect-section-heading"><strong>本地素材</strong><small>{{ model.asset.kind }}</small></div>
        <p class="inspect-help">素材会以内嵌 Data URL 保存到当前本地项目，避免依赖外部路径或网络。</p>
        <div class="inspect-asset-actions">
          <button class="ghost-button compact" :disabled="importing || model.type !== 'image'" @click="importLocalAsset">{{ importing ? '读取中...' : '导入本地图片/SVG' }}</button>
          <button class="ghost-button compact" :disabled="model.type !== 'image'" @click="exportSvg">导出 SVG</button>
        </div>
      </section>

      <section class="inspect-section inspect-code-section">
        <div class="inspect-section-heading"><strong>代码生成</strong><div class="inspect-format-tabs"><button v-for="(label, key) in formatLabels" :key="key" :class="{ active: format === key }" @click="format = key as InspectCodeFormat">{{ label }}</button></div></div>
        <pre class="inspect-code"><code>{{ code }}</code></pre>
        <div class="inspect-code-actions"><button class="primary-button compact" @click="copyCode">{{ copied ? '已复制' : '复制代码' }}</button><button class="ghost-button compact" @click="exportCode">保存到本地文件</button></div>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.inspect-panel{position:fixed;z-index:31;top:72px;right:18px;bottom:18px;width:min(520px,calc(100vw - 36px));display:flex;flex-direction:column;overflow:hidden;color:#1f2430;background:#fff;border:1px solid #dfe3ee;border-radius:14px;box-shadow:0 18px 45px rgb(32 39 63 / 18%)}
.inspect-panel-header,.inspect-section-heading,.inspect-title-row,.inspect-code-actions,.inspect-asset-actions{display:flex;align-items:center;gap:8px}
.inspect-panel-header{justify-content:space-between;padding:16px 18px;border-bottom:1px solid #edf0f6}.inspect-panel-header strong,.inspect-panel-header small{display:block}.inspect-panel-header small,.inspect-summary>small,.inspect-section-heading small,.inspect-help{color:#7c8495;font-size:11px}.inspect-panel>section{padding:13px 16px;border-bottom:1px solid #edf0f6}.inspect-summary{background:#fafbff}.inspect-type-pill{padding:4px 7px;border-radius:5px;color:#5c52d7;background:#efedff;font-size:10px;font-weight:700}.inspect-title-row strong{font-size:13px}.inspect-frame-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.inspect-frame-grid span{padding:6px 7px;color:#7c8495;background:#fff;border:1px solid #e6e9f1;border-radius:6px;font-size:10px}.inspect-frame-grid b{display:block;margin-top:2px;color:#252b38;font-size:12px}.inspect-section-heading{justify-content:space-between;margin-bottom:8px;font-size:12px}.inspect-list{display:grid;gap:5px;margin:0}.inspect-list>div{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #f0f1f5;font-size:11px}.inspect-list dt{color:#7c8495}.inspect-list dd{max-width:70%;margin:0;color:#3e4655;text-align:right;word-break:break-word}.inspect-json,.inspect-code{margin:0;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#f7f8fc;border:1px solid #e4e7ef;border-radius:8px;color:#3a4252;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.inspect-json{max-height:110px;padding:8px}.inspect-help{margin:0 0 9px;line-height:1.5}.inspect-asset-actions button,.inspect-code-actions button{justify-content:center}.inspect-code-section{display:flex;flex-direction:column;min-height:220px;flex:1}.inspect-format-tabs{display:flex;gap:3px}.inspect-format-tabs button{padding:4px 7px;border-radius:5px;color:#7c8495;background:#f4f5f9;font-size:10px}.inspect-format-tabs button.active{color:#5f54e6;background:#eceaff}.inspect-code{min-height:120px;flex:1;padding:10px}.inspect-code-actions{justify-content:flex-end;margin-top:8px}.inspect-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;flex:1;padding:30px;color:#756bea;text-align:center}.inspect-empty strong{color:#33394b;font-size:14px}.inspect-empty p{max-width:280px;margin:0;color:#7c8495;font-size:12px;line-height:1.5}
</style>
