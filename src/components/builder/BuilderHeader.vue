<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{
  projectName: string
  pageName: string
  selectionCount: number
  dirty: boolean
  saving: boolean
  canUndo: boolean
  canRedo: boolean
  zoom: number
  hasSession: boolean
  canInspect: boolean
}>()

const emit = defineEmits<{
  'update:zoom': [value: number]
  'open-command': []
  undo: []
  redo: []
  save: []
  collaboration: []
  preview: []
  review: []
  inspect: []
  'import-project': []
  'export-project': []
  'import-design-exchange': []
  'export-design-exchange': []
  publish: []
}>()

const overflowRef = ref<HTMLElement | null>(null)
const moreOpen = shallowRef(false)

function saveLabel() {
  if (props.saving) return '正在保存'
  return props.dirty ? '未保存' : '已保存'
}

function updateZoom(event: Event) {
  emit('update:zoom', Number((event.target as HTMLSelectElement).value))
}

function toggleMore() {
  moreOpen.value = !moreOpen.value
}

function closeMore() {
  moreOpen.value = false
}

function handlePointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && overflowRef.value?.contains(target)) return
  closeMore()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMore()
}

function runMenuAction(action: () => void) {
  closeMore()
  action()
}

onMounted(() => {
  window.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <header class="builder-toolbar" aria-label="页面设计器工具栏">
    <div class="builder-context" title="当前编辑上下文">
      <span class="builder-context-mark"><AppIcon name="layers" :size="16" /></span>
      <div class="builder-context-copy">
        <strong class="builder-project-name">{{ projectName }}</strong>
        <div class="builder-breadcrumb">
          <span>{{ pageName }}</span>
          <AppIcon name="chevron-right" :size="12" />
          <b>设计</b>
          <em v-if="selectionCount > 1">已选 {{ selectionCount }} 项</em>
        </div>
      </div>
    </div>

    <div class="builder-center-tools" aria-label="画布操作">
      <button class="command-trigger" type="button" title="打开命令面板 Ctrl/Cmd+K" aria-label="打开命令面板" @click="emit('open-command')">⌘ K</button>
      <span class="builder-toolbar-separator" aria-hidden="true"></span>
      <button type="button" :disabled="!canUndo" title="撤销 Ctrl/Cmd+Z" aria-label="撤销" @click="emit('undo')"><AppIcon name="undo" :size="16" /></button>
      <button type="button" :disabled="!canRedo" title="重做 Ctrl/Cmd+Shift+Z" aria-label="重做" @click="emit('redo')"><AppIcon name="redo" :size="16" /></button>
      <span class="builder-toolbar-separator" aria-hidden="true"></span>
      <select :value="zoom" aria-label="画布缩放" title="Ctrl/Cmd + 滚轮缩放" @change="updateZoom">
        <option :value="0.25">25%</option>
        <option :value="0.5">50%</option>
        <option :value="0.75">75%</option>
        <option :value="1">100%</option>
        <option :value="1.5">150%</option>
        <option :value="2">200%</option>
      </select>
    </div>

    <div class="builder-actions builder-header-actions">
      <button :class="['builder-save-state', { dirty, saving }]" type="button" :title="`${saveLabel()}；点击立即保存`" @click="emit('save')">
        <i></i><span>{{ saveLabel() }}</span>
      </button>
      <div ref="overflowRef" class="builder-overflow">
        <button class="ghost-button compact builder-more-trigger" type="button" aria-haspopup="menu" :aria-expanded="moreOpen" title="更多操作" @click.stop="toggleMore">
          <AppIcon name="more" :size="17" /><span>更多</span>
        </button>
        <div v-if="moreOpen" data-testid="builder-overflow-menu" class="builder-overflow-menu" role="menu" aria-label="更多设计器操作" @pointerdown.stop>
          <p>协作与检查</p>
          <button data-collaboration-toggle type="button" role="menuitem" @click="runMenuAction(() => emit('collaboration'))"><AppIcon name="users" :size="15" /><span>协作</span><i v-if="hasSession" class="collaboration-toolbar-dot"></i></button>
          <button type="button" role="menuitem" @click="runMenuAction(() => emit('review'))"><AppIcon name="clipboard" :size="15" /><span>Review</span></button>
          <button type="button" role="menuitem" :disabled="!canInspect" @click="runMenuAction(() => emit('inspect'))"><AppIcon name="code" :size="15" /><span>Inspect</span></button>
          <p>文件与交换</p>
          <button type="button" role="menuitem" @click="runMenuAction(() => emit('import-project'))"><AppIcon name="upload" :size="15" /><span>导入项目</span></button>
          <button type="button" role="menuitem" @click="runMenuAction(() => emit('export-project'))"><AppIcon name="download" :size="15" /><span>导出项目</span></button>
          <button data-design-exchange="import" type="button" role="menuitem" title="从 Figma Plugin 导入 Codeless JSON" @click="runMenuAction(() => emit('import-design-exchange'))"><AppIcon name="upload" :size="15" /><span>导入 JSON</span></button>
          <button data-design-exchange="export" type="button" role="menuitem" title="将当前设计导出为 codeless-design JSON" @click="runMenuAction(() => emit('export-design-exchange'))"><AppIcon name="download" :size="15" /><span>导出 JSON</span></button>
        </div>
      </div>
      <button class="ghost-button compact builder-preview-action" type="button" @click="emit('preview')"><AppIcon name="eye" :size="16" /><span>预览</span></button>
      <button class="primary-button compact builder-publish-action" type="button" @click="emit('publish')"><AppIcon name="play" :size="15" /><span>发布</span></button>
    </div>
  </header>
</template>
