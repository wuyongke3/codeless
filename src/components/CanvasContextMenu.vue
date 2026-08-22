<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppIcon from './AppIcon.vue'

type AppState = Record<string, any>

const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)

const targetWidget = computed(() => {
  const targetId = state.contextMenu?.targetId
  return state.currentProject?.layout.widgets.find((widget: any) => widget.id === targetId)
})
const hasSelection = computed(() => Boolean(state.selectedWidgetIds?.length))
const hasLockedSelection = computed(() => Boolean(state.selectedWidgets?.length && state.selectedWidgets.every((widget: any) => state.isWidgetSelfLocked?.(widget) ?? Boolean(widget.config?.layout?.locked))))
const hasHiddenSelection = computed(() => Boolean(state.selectedWidgets?.length && state.selectedWidgets.every((widget: any) => widget.config?.layout?.hidden)))
const canDelete = computed(() => Boolean(state.selectedWidgets?.some((widget: any) => !state.isWidgetLocked(widget))))
const pasteDestinationId = computed(() => {
  if (!state.canPaste || !targetWidget.value) return undefined
  if (state.canDropIntoContainer?.(targetWidget.value.id, [])) return targetWidget.value.id
  if (targetWidget.value.parentId && state.canDropIntoContainer?.(targetWidget.value.parentId, [])) return targetWidget.value.parentId
  return undefined
})

function close() {
  state.closeContextMenu()
}

function execute(command: string) {
  switch (command) {
    case 'copy': state.copySelectedWidgets(); break
    case 'cut': state.cutSelectedWidgets(); break
    case 'paste': state.pasteWidgets(pasteDestinationId.value); break
    case 'duplicate': state.duplicateSelectedWidget(); break
    case 'rename': state.renameSelectedWidget(); break
    case 'delete': state.removeSelectedWidget(); break
    case 'lock': state.toggleSelectedLocked(); break
    case 'hide': state.toggleSelectedHidden(); break
    case 'front': state.bringToFront(); break
    case 'back': state.sendToBack(); break
    case 'forward': state.moveSelectedLayer(1); break
    case 'backward': state.moveSelectedLayer(-1); break
    case 'selectAll': state.selectAllWidgets(); break
  }
  close()
}

const menuAnimationDuration = 140

function animateEnter(element: Element, done: () => void) {
  const node = element as HTMLElement
  node.style.opacity = '0'
  node.style.transform = 'scale(.96) translateY(-4px)'
  node.style.transition = `opacity ${menuAnimationDuration}ms ease, transform ${menuAnimationDuration}ms ease`
  window.setTimeout(() => {
    node.style.opacity = '1'
    node.style.transform = 'scale(1) translateY(0)'
  }, 0)
  window.setTimeout(() => {
    node.style.transition = ''
    node.style.opacity = ''
    node.style.transform = ''
    done()
  }, menuAnimationDuration)
}

function animateLeave(element: Element, done: () => void) {
  const node = element as HTMLElement
  node.style.transition = `opacity ${menuAnimationDuration}ms ease, transform ${menuAnimationDuration}ms ease`
  node.style.opacity = '0'
  node.style.transform = 'scale(.96) translateY(-4px)'
  window.setTimeout(() => {
    node.style.transition = ''
    node.style.opacity = ''
    node.style.transform = ''
    done()
  }, menuAnimationDuration)
}
</script>

<template>
  <Transition name="context-menu" :css="false" @enter="animateEnter" @leave="animateLeave">
    <div
      v-if="state.contextMenu?.visible"
      class="canvas-context-menu"
      :style="{ left: `${state.contextMenu.x}px`, top: `${state.contextMenu.y}px` }"
      role="menu"
      aria-label="组件操作菜单"
      @pointerdown.stop
      @click.stop
      @contextmenu.prevent
    >
      <div class="context-menu-heading">
        <span>{{ targetWidget ? '组件' : '画布' }}</span>
        <strong>{{ targetWidget?.name || '当前页面' }}</strong>
      </div>

      <template v-if="hasSelection">
        <button :data-menu-command="'cut'" class="context-menu-item" role="menuitem" @click="execute('cut')"><AppIcon name="scissors" :size="15" /><span>剪切</span><kbd>Ctrl X</kbd></button>
        <button :data-menu-command="'copy'" class="context-menu-item" role="menuitem" @click="execute('copy')"><AppIcon name="copy" :size="15" /><span>复制</span><kbd>Ctrl C</kbd></button>
      </template>
      <button class="context-menu-item" :disabled="!state.canPaste" :data-menu-command="'paste'" role="menuitem" @click="execute('paste')"><AppIcon name="clipboard" :size="15" /><span>粘贴</span><kbd>Ctrl V</kbd></button>
      <button v-if="hasSelection" :data-menu-command="'duplicate'" class="context-menu-item" role="menuitem" @click="execute('duplicate')"><AppIcon name="copy" :size="15" /><span>复制并粘贴</span><kbd>Ctrl D</kbd></button>

      <div class="context-menu-separator"></div>

      <template v-if="hasSelection">
        <button :data-menu-command="'rename'" class="context-menu-item" role="menuitem" @click="execute('rename')"><AppIcon name="edit" :size="15" /><span>重命名</span></button>
        <button class="context-menu-item" :disabled="!canDelete" :data-menu-command="'delete'" role="menuitem" @click="execute('delete')"><AppIcon name="trash" :size="15" /><span>删除</span><kbd>Delete</kbd></button>
        <button :data-menu-command="'lock'" class="context-menu-item" role="menuitem" @click="execute('lock')"><AppIcon :name="hasLockedSelection ? 'unlock' : 'lock'" :size="15" /><span>{{ hasLockedSelection ? '解锁' : '锁定' }}</span></button>
        <button :data-menu-command="'hide'" class="context-menu-item" role="menuitem" @click="execute('hide')"><AppIcon :name="hasHiddenSelection ? 'eye' : 'eye-off'" :size="15" /><span>{{ hasHiddenSelection ? '显示' : '隐藏' }}</span></button>
      </template>

      <div class="context-menu-separator"></div>
      <div class="context-menu-label">调整层级</div>
      <button class="context-menu-item" :disabled="!hasSelection" :data-menu-command="'front'" role="menuitem" @click="execute('front')"><AppIcon name="arrow-up" :size="15" /><span>置于顶层</span></button>
      <button class="context-menu-item" :disabled="!state.canMoveSelectedLayer?.(1)" :data-menu-command="'forward'" role="menuitem" @click="execute('forward')"><AppIcon name="arrow-up" :size="15" /><span>上移一层</span></button>
      <button class="context-menu-item" :disabled="!state.canMoveSelectedLayer?.(-1)" :data-menu-command="'backward'" role="menuitem" @click="execute('backward')"><AppIcon name="arrow-down" :size="15" /><span>下移一层</span></button>
      <button class="context-menu-item" :disabled="!hasSelection" :data-menu-command="'back'" role="menuitem" @click="execute('back')"><AppIcon name="arrow-down" :size="15" /><span>置于底层</span></button>

      <template v-if="!hasSelection">
        <div class="context-menu-separator"></div>
        <button class="context-menu-item" :disabled="!state.currentProject?.layout.widgets.length" :data-menu-command="'selectAll'" role="menuitem" @click="execute('selectAll')"><AppIcon name="apps" :size="15" /><span>全选组件</span><kbd>Ctrl A</kbd></button>
      </template>
    </div>
  </Transition>
</template>
