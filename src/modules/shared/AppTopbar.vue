<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../../components/AppIcon.vue'

import type { AppShellUi } from '../shared/appShellTypes'

type AppState = AppShellUi
const props = defineProps<{ ui: AppState; mode: 'home' | 'workspace' }>()
const state = reactive(props.ui)
</script>

<template>
  <header class="topbar">
    <div class="topbar-title">
      <button v-if="mode === 'workspace'" class="icon-button back-button" aria-label="返回应用首页" @click="state.navigate('home')">
        <AppIcon name="chevron-right" :size="18" />
      </button>
      <div>
        <div class="eyebrow">{{ mode === 'home' ? 'Codeless Home' : state.activeArea === 'builder' ? '页面设计器' : 'Codeless Workspace' }}</div>
        <h1>{{ mode === 'home' ? '应用首页' : state.pageTitle }}</h1>
      </div>
      <span v-if="mode === 'workspace' && state.activeArea === 'builder' && state.currentProject" :class="['status-pill', state.currentProject.status]"><i></i>{{ state.currentProject.status === 'published' ? '已发布' : '草稿' }}</span>
    </div>
    <div class="topbar-actions">
      <label class="global-search"><AppIcon name="search" :size="17" /><input :placeholder="mode === 'home' ? '搜索应用、数据和流程' : '搜索当前工作区'" /><kbd>⌘ K</kbd></label>
      <button class="icon-button" aria-label="帮助"><AppIcon name="help" :size="19" /></button>
      <button class="icon-button notification-button" aria-label="通知"><AppIcon name="bell" :size="19" /><span></span></button>
    </div>
  </header>
</template>
