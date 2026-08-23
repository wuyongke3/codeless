<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from './AppIcon.vue'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)
</script>

<template>
  <Transition name="panel-fade">
    <section v-if="state.showCollaborationPanel" class="collaboration-panel" data-collaboration-panel>
      <header class="collaboration-panel-head">
        <div><strong>本地协作</strong><small>同机窗口或可选局域网临时会话</small></div>
        <button class="icon-button tiny" data-collaboration-close aria-label="关闭协作面板" @click="state.showCollaborationPanel = false"><AppIcon name="close" :size="15" /></button>
      </header>

      <div v-if="state.session" class="collaboration-session-card">
        <div class="collaboration-session-title"><span class="collaboration-live-dot"></span><strong>{{ state.session.mode === 'same-device' ? '同机协作已开启' : '局域网会话已开启' }}</strong><em>{{ state.participantCount }} 个窗口</em></div>
        <p class="collaboration-session-hint">{{ state.sessionHint }}</p>
        <label class="property-field"><span>会话 ID</span><input readonly :value="state.session.id" /></label>
        <label class="property-field"><span>协作口令</span><input readonly :value="state.session.token" /></label>
        <label v-if="state.session.mode === 'lan'" class="property-field"><span>局域网地址</span><input readonly :value="`${state.session.host}:${state.session.port || ''}`" /></label>
        <div class="collaboration-actions"><button class="subtle-button compact" @click="state.copySessionInfo"><AppIcon name="copy" :size="14" />复制会话信息</button><button v-if="state.session.mode === 'same-device'" class="subtle-button compact" data-collaboration-open-window @click="state.openCollaborationWindow"><AppIcon name="apps" :size="14" />打开新窗口</button><button class="danger-button compact" :disabled="state.working" @click="state.leaveSession">结束会话</button></div>
        <small class="field-help">保存项目时自动同步完整本地文档；不上传云端，不建立后台常驻服务。</small>
      </div>

      <div v-else class="collaboration-start-card">
        <label class="property-field"><span>显示名称</span><input v-model="state.displayName" placeholder="本机协作者" /></label>
        <label class="property-field"><span>会话类型</span><select v-model="state.collaborationMode" data-collaboration-mode><option value="same-device">同机多窗口（默认）</option><option value="lan">局域网临时会话（手动开启）</option></select></label>
        <button class="primary-button collaboration-full-button" data-collaboration-create :disabled="state.working" @click="state.createSession"><AppIcon name="plus" :size="15" />创建本地会话</button>
        <div class="collaboration-divider"><span>或加入已有会话</span></div>
        <label class="property-field"><span>会话 ID</span><input v-model="state.joinSessionId" placeholder="session_..." /></label>
        <label class="property-field"><span>协作口令</span><input v-model="state.joinToken" placeholder="粘贴口令" /></label>
        <div class="property-row"><label class="property-field"><span>主机 IPv4（局域网）</span><input v-model="state.joinHost" placeholder="192.168.1.10" /></label><label class="property-field"><span>端口</span><input v-model.number="state.joinPort" type="number" min="1" max="65535" placeholder="随机端口" /></label></div>
        <button class="ghost-button collaboration-full-button" data-collaboration-join :disabled="state.working" @click="state.joinSession"><AppIcon name="link" :size="15" />加入本地会话</button>
        <small class="field-help">局域网模式只在点击创建后监听随机端口，退出应用或结束会话即关闭。</small>
      </div>
    </section>
  </Transition>
</template>
