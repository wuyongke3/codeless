<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppIcon from '../AppIcon.vue'
import RuntimeWidgetNode from '../RuntimeWidgetNode.vue'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)

// 预览必须使用页面实际画布尺寸。否则会回退到 CSS 中的默认 960 × 720，
// 当页面被调整为其他尺寸时，组件位置和裁切区域会与设计画布不一致。
const previewCanvasStyle = computed(() => {
  const canvas = state.currentProject?.layout?.canvas
  if (!canvas) return {}
  return {
    width: `${canvas.width}px`,
    height: `${canvas.height}px`,
    background: canvas.background,
  }
})
</script>

<template>
  <Transition name="fade">
    <div v-if="state.showPreview && state.currentProject" class="modal-backdrop preview-backdrop" @click.self="state.showPreview = false">
      <div class="preview-modal">
        <header>
          <div>
            <span><i></i>预览模式</span>
            <strong>{{ state.currentProject.name }} · {{ state.currentProject.layout.pageName }}</strong>
          </div>
          <button @click="state.showPreview = false"><AppIcon name="close" :size="18" /></button>
        </header>
        <div class="preview-body">
          <div class="preview-browser">
            <div class="browser-bar"><i></i><i></i><i></i><span><AppIcon name="lock" :size="12" />codeless.local/{{ state.currentProject.layout.pageName }}</span></div>
            <div class="preview-scroll">
              <div class="design-canvas preview-canvas" :style="previewCanvasStyle">
                <RuntimeWidgetNode
                  v-for="widget in state.currentProject.layout.widgets.filter((item: any) => !item.parentId)"
                  :key="widget.id"
                  :widget="widget"
                  :widgets="state.currentProject.layout.widgets"
                  :state="state"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
