<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import type { AppPreferencesController } from '../../composables/useAppPreferences'

const props = defineProps<{ open: boolean; preferences: AppPreferencesController }>()
const emit = defineEmits<{ close: [] }>()
const panelRef = ref<HTMLElement | null>(null)
const resolvedTheme = computed(() => props.preferences.resolvedTheme.value)

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
            <div><span><AppIcon name="settings" :size="17" /></span><div><strong id="app-settings-title">显示设置</strong><small>调整应用的视觉与交互偏好</small></div></div>
            <button type="button" aria-label="关闭设置" title="关闭" @click="close"><AppIcon name="close" :size="16" /></button>
          </header>
          <div class="app-settings-content">
            <section>
              <div class="settings-section-title"><span>主题</span><small>选择应用的显示主题</small></div>
              <div class="settings-option-grid" role="radiogroup" aria-label="主题">
                <label :class="{ active: preferences.preferences.theme === 'system' }"><input v-model="preferences.preferences.theme" type="radio" value="system" /><AppIcon name="settings" :size="16" /><span>跟随系统</span></label>
                <label :class="{ active: preferences.preferences.theme === 'light' }"><input v-model="preferences.preferences.theme" type="radio" value="light" /><span class="theme-dot light"></span><span>浅色</span></label>
                <label :class="{ active: preferences.preferences.theme === 'dark' }"><input v-model="preferences.preferences.theme" type="radio" value="dark" /><span class="theme-dot dark"></span><span>深色</span></label>
              </div>
            </section>
            <section>
              <div class="settings-section-title"><span>字号</span><small>调整界面内容的显示密度</small></div>
              <div class="settings-option-grid font-grid" role="radiogroup" aria-label="字号">
                <label :class="{ active: preferences.preferences.fontSize === 'small' }"><input v-model="preferences.preferences.fontSize" type="radio" value="small" /><b class="font-small">A</b><span>小</span></label>
                <label :class="{ active: preferences.preferences.fontSize === 'medium' }"><input v-model="preferences.preferences.fontSize" type="radio" value="medium" /><b class="font-medium">A</b><span>标准</span></label>
                <label :class="{ active: preferences.preferences.fontSize === 'large' }"><input v-model="preferences.preferences.fontSize" type="radio" value="large" /><b class="font-large">A</b><span>大</span></label>
              </div>
            </section>
            <section class="settings-toggle-row">
              <div><strong>减少动效</strong><small>减少动画和过渡效果</small></div>
              <label class="settings-switch"><input v-model="preferences.preferences.reducedMotion" type="checkbox" /><i></i></label>
            </section>
          </div>
          <footer><small>当前使用{{ resolvedTheme === 'dark' ? '深色主题' : '浅色主题' }}</small><button type="button" @click="preferences.reset()">恢复默认</button></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
