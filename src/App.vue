<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppIcon from './components/AppIcon.vue'
import PreviewModal from './components/common/PreviewModal.vue'
import RowEditorDialog from './components/common/RowEditorDialog.vue'
import CreateProjectDialog from './components/common/CreateProjectDialog.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import ActivityView from './views/ActivityView.vue'
import BuilderView from './views/BuilderView.vue'
import DataModelView from './views/DataModelView.vue'
import FlowsView from './views/FlowsView.vue'
import WorkspaceView from './views/WorkspaceView.vue'
import PluginsView from './views/PluginsView.vue'
import { navItems } from './composables/utils'
import { useLowcode } from './composables/useLowcode'

const ui = useLowcode()
const state = reactive(ui)

const currentView = computed(() => {
  if (state.activeArea === 'workspace') return WorkspaceView
  if (state.activeArea === 'builder') return BuilderView
  if (state.activeArea === 'data') return DataModelView
  if (state.activeArea === 'flows') return FlowsView
  if (state.activeArea === 'plugins') return PluginsView
  return ActivityView
})
</script>

<template>
  <div v-if="state.loading" class="boot-screen">
    <div class="boot-logo"><img src="/logo.png" alt="Codeless" /></div><strong>Codeless</strong><div class="boot-loader"><span></span></div><p>正在打开本地工作台...</p>
  </div>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand" @click="state.navigate('workspace')">
        <div class="brand-mark"><img src="/logo.png" alt="Codeless" /></div><div><strong>Codeless</strong><small>Rapid Prototyper</small></div>
      </div>
      <button class="new-app-button" @click="state.openCreateProject"><AppIcon name="plus" :size="17" /><span>新建应用</span><kbd>N</kbd></button>
      <nav class="main-nav">
        <p class="nav-caption">工作空间</p>
        <button v-for="item in navItems" :key="item.id" :class="['nav-item', { active: state.activeArea === item.id }]" @click="state.navigate(item.id)">
          <AppIcon :name="item.icon" :size="18" /><span>{{ item.label }}</span><span v-if="item.id === 'activity' && state.activities.length" class="nav-count">{{ state.activities.length }}</span>
        </button>
      </nav>
      <div class="recent-projects">
        <div class="sidebar-section-title"><span>最近应用</span><button @click="state.navigate('workspace')"><AppIcon name="more" :size="16" /></button></div>
        <button v-for="(project, index) in state.projects.slice(0, 4)" :key="project.id" :class="['recent-project', { active: state.activeArea === 'builder' && state.currentProjectId === project.id }]" @click="state.openBuilder(project.id)">
          <span :class="['project-mini-icon', `project-color-${index % 4}`]">{{ project.name.slice(0, 1) }}</span><span class="recent-project-name">{{ project.name }}</span><span v-if="project.status === 'published'" class="live-dot"></span>
        </button>
      </div>
      <div class="sidebar-bottom">
        <div class="local-card"><span><AppIcon name="lock" :size="16" /></span><div><strong>仅本地运行</strong><small>数据不会离开此设备</small></div><i></i></div>
        <div class="sidebar-tagline"><AppIcon name="sparkle" :size="14" /><span>快速原型 · 全本地 · 下载即用 · 永久免费</span></div>
      </div>
    </aside>

    <main class="main-column">
      <header class="topbar">
        <div class="topbar-title">
          <button v-if="state.activeArea === 'builder'" class="icon-button back-button" @click="state.navigate('workspace')"><AppIcon name="chevron-right" :size="18" /></button>
          <div><div class="eyebrow">{{ state.activeArea === 'builder' ? '页面设计器' : 'Codeless Workspace' }}</div><h1>{{ state.pageTitle }}</h1></div>
          <span v-if="state.activeArea === 'builder' && state.currentProject" :class="['status-pill', state.currentProject.status]"><i></i>{{ state.currentProject.status === 'published' ? '已发布' : '草稿' }}</span>
        </div>
        <div class="topbar-actions">
          <label class="global-search"><AppIcon name="search" :size="17" /><input placeholder="搜索应用、数据和流程" /><kbd>⌘ K</kbd></label>
          <button class="icon-button"><AppIcon name="help" :size="19" /></button><button class="icon-button notification-button"><AppIcon name="bell" :size="19" /><span></span></button>
          <button v-if="state.activeArea !== 'builder'" class="primary-button top-create" @click="state.openCreateProject"><AppIcon name="plus" :size="16" />新建应用</button>
        </div>
      </header>

      <component :is="currentView" :ui="ui" />
    </main>

    <PreviewModal :ui="ui" />
    <RowEditorDialog :ui="ui" />
    <CreateProjectDialog :ui="ui" />
    <ConfirmDialog :ui="ui" />
    <Transition name="toast"><div v-if="state.toast.show" :class="['toast-message', state.toast.tone]"><span><AppIcon :name="state.toast.tone === 'danger' ? 'close' : state.toast.tone === 'info' ? 'sparkle' : 'check'" :size="15" /></span>{{ state.toast.message }}</div></Transition>
  </div>
</template>
