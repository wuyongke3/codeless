<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../components/AppIcon.vue'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)
function projectVariant(index: unknown) { return Number(index) % 4 }
</script>

<template>
      <section class="workspace-view view-scroll">
        <div class="welcome-banner">
          <div class="welcome-copy"><span class="welcome-tag"><AppIcon name="sparkle" :size="15" />本地低代码工作台</span><h2>把想法，快速变成<span>可运行的应用</span></h2><p>拖拽组件、连接 SQLite 数据，无需部署服务器。你的应用和数据始终保存在本机。</p><div><button class="primary-button" @click="state.openCreateProject"><AppIcon name="plus" :size="17" />创建应用</button><button class="ghost-button" @click="state.projects[0] && state.openBuilder(state.projects[0].id)"><AppIcon name="play" :size="16" />继续设计</button></div></div>
          <div class="welcome-visual"><div class="orb one"></div><div class="orb two"></div><div class="mini-window"><div class="mini-top"><i></i><i></i><i></i><span></span></div><div class="mini-body"><aside><b></b><b></b><b></b></aside><main><strong></strong><div><i></i><i></i><i></i></div><span></span><span></span><span></span></main></div></div><span class="visual-chip chip-db"><AppIcon name="database" :size="15" />SQLite</span><span class="visual-chip chip-flow"><AppIcon name="flow" :size="15" />自动化</span></div>
        </div>
        <div class="metric-grid">
          <article class="metric-card purple"><span><AppIcon name="apps" /></span><div><small>全部应用</small><strong>{{ state.projects.length }}</strong><em>本地项目</em></div><i>+{{ state.projects.length }}</i></article>
          <article class="metric-card green"><span><AppIcon name="play" /></span><div><small>已发布</small><strong>{{ state.publishedCount }}</strong><em>正常运行</em></div><i>100%</i></article>
          <article class="metric-card orange"><span><AppIcon name="layers" /></span><div><small>页面组件</small><strong>{{ state.totalWidgets }}</strong><em>可视化搭建</em></div><i>实时</i></article>
          <article class="metric-card blue"><span><AppIcon name="database" /></span><div><small>数据模型</small><strong>{{ state.tables.length }}</strong><em>SQLite 表</em></div><i>本地</i></article>
        </div>
        <div class="section-heading"><div><span class="section-kicker">YOUR APPS</span><h3>最近应用</h3><p>继续编辑，或从现有应用快速创建副本。</p></div><button class="subtle-button"><AppIcon name="apps" :size="16" />查看全部</button></div>
        <div class="project-grid">
          <article v-for="(project, index) in state.projects" :key="project.id" class="project-card" @click="state.openBuilder(project.id)">
            <div :class="['project-cover', `cover-${projectVariant(index)}`]"><div class="cover-top"><span>{{ project.category }}</span><button @click.stop><AppIcon name="more" :size="18" /></button></div><div class="cover-window"><aside><i></i><i></i><i></i></aside><main><b></b><div><i></i><i></i><i></i></div><span></span><span></span><span></span></main></div><em :class="project.status">{{ project.status === 'published' ? '● 运行中' : '○ 草稿' }}</em></div>
            <div class="project-card-body"><div><div><h4>{{ project.name }}</h4><p>{{ project.description }}</p></div><span class="round-arrow"><AppIcon name="chevron-right" :size="16" /></span></div><footer><span>更新于 {{ state.formatRelative(project.updatedAt) }}</span><div><button @click.stop="state.duplicateProject(project)"><AppIcon name="copy" :size="15" /></button><button @click.stop="state.openBuilder(project.id)"><AppIcon name="eye" :size="15" /></button></div></footer></div>
          </article>
          <button class="new-project-card" @click="state.openCreateProject"><span><AppIcon name="plus" :size="24" /></span><strong>创建新应用</strong><small>从模板或空白画布开始</small></button>
        </div>
      </section>
</template>