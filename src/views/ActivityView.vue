<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../components/AppIcon.vue'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)
function activityVariant(index: unknown) { return Number(index) % 4 }
</script>

<template>
      <section class="module-view view-scroll activity-view">
        <div class="module-hero"><div><span class="section-kicker">ACTIVITY</span><h2>本地运行日志</h2><p>查看应用设计、发布和自动化流程的最近活动。</p></div><button class="subtle-button" @click="state.notify('日志已刷新')"><AppIcon name="activity" :size="16" />刷新日志</button></div>
        <div class="activity-summary"><article><span class="green"><AppIcon name="check" /></span><div><small>今日成功运行</small><strong>24</strong></div></article><article><span class="purple"><AppIcon name="save" /></span><div><small>设计保存</small><strong>{{ state.activities.length }}</strong></div></article><article><span class="orange"><AppIcon name="flow" /></span><div><small>自动化触发</small><strong>8</strong></div></article><article><span class="blue"><AppIcon name="database" /></span><div><small>数据写入</small><strong>126</strong></div></article></div>
        <div class="activity-card"><header><div><strong>最近活动</strong><span>仅显示本机记录</span></div><label><AppIcon name="search" :size="15" /><input placeholder="搜索日志" /></label></header><div class="activity-row head"><span>事件</span><span>应用</span><span>状态</span><span>时间</span></div><div v-for="(item, index) in (state.activities.length ? state.activities : [{ id: 1, projectId: 'demo', projectName: '客户管理系统', action: '保存了页面设计', createdAt: new Date().toISOString() }])" :key="item.id" class="activity-row"><span><i :class="`tone-${activityVariant(index)}`"><AppIcon :name="Number(index) % 2 ? 'play' : 'save'" :size="16" /></i><strong>{{ item.action }}</strong></span><span>{{ item.projectName }}</span><span><em><i></i>成功</em></span><span>{{ state.formatDate(item.createdAt) }}</span></div></div>
      </section>
</template>