<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import { navItems, type Area } from '../../composables/utils'

import type { AppShellUi } from './appShellTypes'

type AppState = AppShellUi
const props = defineProps<{ ui: AppState; mode: 'home' | 'workspace' }>()
const state = reactive(props.ui)

const workspaceNavItems = computed(() => navItems.filter(item => item.id !== 'workspace'))
const projectList = computed(() => state.projects.slice(0, 6))

function navigate(id: Area) {
  state.navigate(id === 'workspace' ? 'home' : id)
}

function openProject(projectId: string) {
  state.openBuilder(projectId)
}

function projectVariant(index: number) {
  return index % 4
}
</script>

<template>
  <section
    :class="['route-navigation', `${mode}-route-navigation`]"
    :aria-label="mode === 'home' ? '应用中心导航' : '工作区导航'"
  >
    <div class="route-navigation-main">
      <template v-if="mode === 'home'">
        <button class="route-home-link active" type="button" @click="state.navigate('home')">
          <AppIcon name="home" :size="17" />
          <span>应用首页</span>
        </button>
        <span class="route-context-note">本地应用中心</span>
      </template>

      <template v-else>
        <button class="route-home-link" type="button" @click="state.navigate('home')">
          <AppIcon name="chevron-right" :size="15" />
          <span>全部应用</span>
        </button>
        <span class="route-divider route-divider-small" aria-hidden="true"></span>
        <div class="route-project-context">
          <span class="route-project-avatar project-color-0">{{ state.currentProject?.name?.slice(0, 1) || 'A' }}</span>
          <strong>{{ state.currentProject?.name || '未选择应用' }}</strong>
          <span v-if="state.currentProject" :class="['status-pill', state.currentProject.status]"><i></i>{{ state.currentProject.status === 'published' ? '已发布' : '草稿' }}</span>
        </div>
        <nav class="route-tabs" aria-label="工作区功能">
          <button
            v-for="item in workspaceNavItems"
            :key="item.id"
            :class="['route-tab', { active: state.activeArea === item.id }]"
            type="button"
            :aria-current="state.activeArea === item.id ? 'page' : undefined"
            @click="navigate(item.id)"
          >
            <AppIcon :name="item.icon" :size="16" />
            <span>{{ item.label }}</span>
            <b v-if="item.id === 'activity' && state.activities.length" class="route-count">{{ state.activities.length }}</b>
          </button>
        </nav>
      </template>

      <button class="route-create-button" type="button" @click="state.openCreateProject">
        <AppIcon name="plus" :size="16" />
        <span>新建应用</span>
        <kbd>N</kbd>
      </button>
    </div>

    <div class="route-navigation-meta">
      <div class="route-projects" aria-label="最近应用">
        <span class="route-meta-label">{{ mode === 'home' ? '最近应用' : '切换应用' }}</span>
        <div v-if="projectList.length" class="route-project-list">
          <button
            v-for="(project, index) in projectList"
            :key="project.id"
            :class="['route-project-button', { active: mode === 'workspace' && state.currentProjectId === project.id }]"
            type="button"
            :title="`打开${project.name}`"
            @click="openProject(project.id)"
          >
            <span :class="['project-mini-icon', `project-color-${projectVariant(index)}`]">{{ project.name.slice(0, 1) }}</span>
            <span class="route-project-name">{{ project.name }}</span>
            <i v-if="project.status === 'published'" class="live-dot"></i>
          </button>
        </div>
        <span v-else class="route-empty-projects">还没有应用，先创建一个吧</span>
        <button v-if="mode === 'home' && state.projects.length > projectList.length" class="route-more-projects" type="button" @click="state.navigate('home')">
          查看全部
          <AppIcon name="chevron-right" :size="13" />
        </button>
      </div>

      <div class="route-navigation-status">
        <div class="route-local-status">
          <span class="route-local-icon"><AppIcon name="lock" :size="14" /></span>
          <span><strong>仅本地运行</strong><small>数据不会离开此设备</small></span>
          <i aria-label="本地模式已启用"></i>
        </div>
        <span class="route-tagline"><AppIcon name="sparkle" :size="13" />快速原型 · 全本地 · 下载即用 · 永久免费</span>
      </div>
    </div>
  </section>
</template>
