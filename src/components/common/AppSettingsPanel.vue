<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CButton, CInputNumber, CSegmented, CSlider, CSwitch } from '@codeless/components'
import AppIcon from '../AppIcon.vue'
import type { AppPreferencesController } from '../../composables/useAppPreferences'
import { APP_FONT_SIZE_MAX, APP_FONT_SIZE_MIN, APP_FONT_SIZE_STEP } from '../../composables/useAppPreferences'

const props = defineProps<{ open: boolean; preferences: AppPreferencesController }>()
const emit = defineEmits<{ close: [] }>()
const panelRef = ref<HTMLElement | null>(null)
const resolvedTheme = computed(() => props.preferences.resolvedTheme.value)
const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

function close() {
  emit('close')
}

watch(() => props.open, open => {
  if (open) void nextTick(() => panelRef.value?.focus())
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="settings-backdrop" @click.self="close">
        <section ref="panelRef" class="app-settings-panel" role="dialog" aria-modal="true" aria-labelledby="app-settings-title" tabindex="-1" @keydown.esc.stop="close">
          <header class="app-settings-header">
            <div>
              <span><AppIcon name="settings" :size="17" /></span>
              <div><strong id="app-settings-title">显示设置</strong><small>调整应用的视觉与交互偏好</small></div>
            </div>
            <CButton text circle aria-label="关闭设置" title="关闭" @click="close"><AppIcon name="close" :size="16" /></CButton>
          </header>

          <div class="app-settings-content">
            <section class="settings-form-item"><strong>主题</strong><small class="settings-help">选择应用的显示主题</small><CSegmented v-model="preferences.preferences.theme" :options="themeOptions" class="settings-theme-group" aria-label="主题" /></section>
            <section class="settings-form-item"><strong>全局字体大小</strong><small class="settings-help">应用于所有页面结构中的文字，实时生效</small><div class="font-size-control"><CSlider v-model="preferences.preferences.fontSize" :min="APP_FONT_SIZE_MIN" :max="APP_FONT_SIZE_MAX" :step="APP_FONT_SIZE_STEP" show-stops aria-label="全局字体大小" /><CInputNumber v-model="preferences.preferences.fontSize" :min="APP_FONT_SIZE_MIN" :max="APP_FONT_SIZE_MAX" :step="APP_FONT_SIZE_STEP" aria-label="全局字体大小数值" /></div><div class="font-size-preview" aria-live="polite"><span :style="{ fontSize: `${preferences.preferences.fontSize}px` }">Aa</span><div><strong>{{ preferences.preferences.fontSize }} px</strong><small>示例文字：全局字体会同步到当前应用的所有页面</small></div></div></section>
            <div class="settings-toggle-row"><div><strong>减少动效</strong><small>减少动画和过渡效果</small></div><CSwitch v-model="preferences.preferences.reducedMotion" aria-label="减少动效" /></div>
          </div>

          <footer><small>当前使用{{ resolvedTheme === 'dark' ? '深色主题' : '浅色主题' }}</small><CButton text type="primary" size="small" @click="preferences.reset()">恢复默认</CButton></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
