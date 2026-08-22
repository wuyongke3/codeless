<script setup lang="ts">
import { computed } from 'vue'
import WidgetRenderer from './WidgetRenderer.vue'
import type { LowCodeWidget } from '../types/lowcode'
import { getWidgetConfig, isContainerType } from '../composables/widgetConfig'

defineOptions({ name: 'RuntimeWidgetNode' })

type RuntimeState = Record<string, any>
const props = defineProps<{ widget: LowCodeWidget; widgets: LowCodeWidget[]; state: RuntimeState }>()
const children = computed(() => props.widgets
  .filter(item => item.parentId === props.widget.id)
  .sort((a, b) => getWidgetConfig(a).layout.zIndex - getWidgetConfig(b).layout.zIndex))
const isContainer = computed(() => isContainerType(props.widget.type))
</script>

<template>
  <div v-show="!widget.config?.layout?.hidden" :data-runtime-widget-id="widget.id" :class="['runtime-widget-node', `widget-${widget.type}`]" :style="state.widgetStyle(widget)">
    <WidgetRenderer :widget="widget" :design-system="state.currentProject?.designSystem" :runtime="true" :runtime-value="state.getWidgetValue(widget)" :on-event="state.executeWidgetEvent" :on-value-change="state.updateWidgetValue" :service-visible="state.isServiceVisible(widget)">
      <template v-if="isContainer" #children>
        <div class="runtime-children-layer">
          <RuntimeWidgetNode v-for="child in children" :key="child.id" :widget="child" :widgets="widgets" :state="state" />
        </div>
      </template>
    </WidgetRenderer>
  </div>
</template>
