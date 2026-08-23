<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { createDesignTokenStore } from '../composables/designTokens'
import { DEFAULT_DESIGN_SYSTEM, normalizeDesignSystem } from '../composables/designSystem'
import type { DesignTokenKind, DesignTokenRecord } from '../types/designTokens'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState; open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const state = props.ui
const search = ref('')
const draftReference = ref('color.brand')
const draftType = ref<DesignTokenKind>('color')
const draftValue = ref('#665cf6')
const draftAlias = ref('')
const editing = ref('')
const editingValue = ref('')

function ensureSystem() {
  if (!state.currentProject) return DEFAULT_DESIGN_SYSTEM
  if (!state.currentProject.designSystem) state.currentProject.designSystem = normalizeDesignSystem()
  return state.currentProject.designSystem
}
const store = computed(() => createDesignTokenStore(ensureSystem()))
const themes = computed(() => ensureSystem().themes)
const activeThemeId = computed({
  get: () => ensureSystem().activeThemeId,
  set: value => { store.value.setActiveTheme(value); state.markDirty() },
})
const tokens = computed(() => {
  const normalized = search.value.trim().toLowerCase()
  return store.value.listTokens().filter(token => !normalized || `${token.reference} ${token.value ?? ''} ${token.kind}`.toLowerCase().includes(normalized))
})

function close() { emit('update:open', false) }
function parseDraftValue(value: string, kind: DesignTokenKind) {
  if (kind === 'number') return value === '' ? 0 : Number(value)
  if (kind === 'boolean') return value === 'true'
  return value
}
function addToken() {
  try {
    store.value.upsert({ reference: draftReference.value, themeId: activeThemeId.value, type: draftType.value, value: parseDraftValue(draftValue.value, draftType.value), aliasOf: draftAlias.value.trim() || undefined })
    state.markDirty()
    state.notify?.(`已保存 Token ${draftReference.value}`)
  } catch (error) { state.notify?.(error instanceof Error ? error.message : 'Token 保存失败', 'danger') }
}
function beginEdit(token: DesignTokenRecord) {
  editing.value = `${token.themeId}:${token.reference}`
  editingValue.value = token.aliasOf || String(token.value ?? '')
}
function saveEdit(token: DesignTokenRecord) {
  try {
    const input = editingValue.value.trim()
    const isAlias = input.startsWith('$') || /^[a-z]+\.[\w.-]+$/i.test(input)
    store.value.update(token.reference, isAlias ? { aliasOf: input, type: token.kind } : { value: parseDraftValue(input, token.kind), aliasOf: null, type: token.kind }, token.themeId)
    editing.value = ''
    state.markDirty()
  } catch (error) { state.notify?.(error instanceof Error ? error.message : 'Token 更新失败', 'danger') }
}
function tokenReferenceCount(token: DesignTokenRecord) {
  return store.value.references(token.reference, token.themeId).length
}
function removeToken(token: DesignTokenRecord) {
  const result = store.value.remove(token.reference, { themeId: token.themeId, onReferenced: 'reject' })
  if (result.blocked) { state.notify?.(`Token 正被 ${result.references.length} 处引用，已阻止删除`, 'info'); return }
  state.markDirty()
}
async function exportTokens() {
  const text = store.value.exportJson(true)
  try { await navigator.clipboard?.writeText(text); state.notify?.('Token JSON 已复制到剪贴板') } catch { state.notify?.('Token JSON 已生成，请使用开发者工具复制', 'info'); console.info(text) }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="token-manager-backdrop" @click.self="close">
        <section class="token-manager" role="dialog" aria-modal="true" aria-label="Token 管理台">
          <header class="token-manager-head"><div><span class="token-manager-icon"><AppIcon name="sparkle" :size="17" /></span><div><strong>Token 管理台</strong><small>本地设计系统 · 支持别名、引用追踪和主题模式</small></div></div><button class="icon-button" @click="close"><AppIcon name="close" :size="17" /></button></header>
          <div class="token-manager-toolbar"><label>当前主题<select v-model="activeThemeId"><option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ theme.name }} · {{ theme.mode }}</option></select></label><label class="token-search"><AppIcon name="search" :size="14" /><input v-model="search" placeholder="搜索 Token 名称或值" /></label><button class="ghost-button compact" @click="exportTokens"><AppIcon name="download" :size="14" />导出 JSON</button></div>
          <div class="token-manager-create"><div class="token-manager-section-title"><strong>新增或更新</strong><small>引用格式：color.brand、space.md、$color.primary</small></div><div class="token-create-grid"><input v-model="draftReference" placeholder="color.brand" /><select v-model="draftType"><option value="color">颜色</option><option value="number">数值</option><option value="text">文本</option><option value="boolean">布尔</option><option value="shadow">阴影</option></select><input v-model="draftValue" :type="draftType === 'color' ? 'color' : draftType === 'number' ? 'number' : 'text'" /><input v-model="draftAlias" placeholder="可选别名，例如 $color.primary" /><button class="primary-button compact" @click="addToken">保存 Token</button></div></div>
          <div class="token-manager-list"><div class="token-list-head"><span>Token（{{ tokens.length }}）</span><span>值 / 别名</span><span>操作</span></div><article v-for="token in tokens" :key="`${token.themeId}:${token.reference}`" class="token-row"><div><strong>{{ token.reference }}</strong><small>{{ token.kind }} · {{ token.themeId }}<em v-if="tokenReferenceCount(token)">{{ tokenReferenceCount(token) }} refs</em></small></div><template v-if="editing === `${token.themeId}:${token.reference}`"><input v-model="editingValue" class="token-edit-input" @keydown.enter="saveEdit(token)" @keydown.esc="editing = ''" /><button class="text-button" @click="saveEdit(token)">保存</button></template><template v-else><code :style="token.kind === 'color' && typeof token.resolvedValue === 'string' ? { color: token.resolvedValue } : undefined">{{ token.aliasOf || token.value }}</code><div class="token-actions"><button class="text-button" @click="beginEdit(token)">编辑</button><button class="text-button danger-text" @click="removeToken(token)">删除</button></div></template></article><div v-if="!tokens.length" class="token-empty">没有匹配的 Token</div></div>
          <footer><span><AppIcon name="lock" :size="13" />变更将随当前本地项目保存</span><button class="ghost-button compact" @click="close">完成</button></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
