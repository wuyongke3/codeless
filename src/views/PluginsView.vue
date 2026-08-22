<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import PluginSandboxFrame from '../components/PluginSandboxFrame.vue'
import type { InstalledPlugin, PluginPermission } from '../types/plugin'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)

const permissionLabels: Record<PluginPermission, string> = {
  'document.read': '读取文档',
  'document.write': '写入文档',
  'selection.read': '读取选区',
  'storage.plugin': '插件存储',
  'assets.read': '读取素材',
  'data.read': '读取数据',
}

function permissionLabel(permission: PluginPermission) {
  return permissionLabels[permission] || permission
}

function statusLabel(status: InstalledPlugin['status']) {
  if (status === 'disabled') return '已停用'
  if (status === 'invalid') return '不可用'
  return '已启用'
}

function statusTone(status: InstalledPlugin['status']) {
  if (status === 'disabled') return 'disabled'
  if (status === 'invalid') return 'invalid'
  return 'ready'
}

function togglePlugin(plugin: InstalledPlugin) {
  if (plugin.status === 'invalid') return
  void state.setPluginEnabled(plugin.manifest.id, plugin.status !== 'ready')
}

function removePlugin(plugin: InstalledPlugin) {
  if (!window.confirm(`确定卸载本地插件“${plugin.manifest.name}”吗？`)) return
  void state.removePlugin(plugin.manifest.id)
}
</script>

<template>
  <section class="module-view view-scroll plugins-view">
    <div class="plugins-hero">
      <div>
        <span class="section-kicker">LOCAL PLUGINS</span>
        <h2>本地插件与扩展</h2>
        <p>从本机安装经过 manifest 校验的插件。插件默认离线运行，不能直接访问 Electron、Node 或项目文件系统。</p>
      </div>
      <button class="primary-button" :disabled="state.pluginLoading" @click="state.installPlugin">
        <AppIcon name="upload" :size="16" />{{ state.pluginLoading ? '处理中…' : '安装本地插件' }}
      </button>
    </div>

    <div class="plugin-policy-card">
      <span class="plugin-policy-icon"><AppIcon name="lock" :size="19" /></span>
      <div>
        <strong>离线优先的插件边界</strong>
        <p>只读取用户选择的本地 manifest.json；权限按白名单声明，network 固定为 <code>none</code>，插件 UI 只能在 sandbox iframe 中加载。</p>
      </div>
      <button class="subtle-button compact" :disabled="state.pluginLoading" @click="state.loadPlugins()"><AppIcon name="activity" :size="14" />刷新</button>
    </div>

    <div class="plugins-toolbar">
      <div>
        <h3>已安装插件 <span>{{ state.plugins.length }}</span></h3>
        <p>插件目录位于当前用户数据目录，不会上传到在线市场。</p>
      </div>
      <span class="plugin-local-badge"><i></i>仅本机可用</span>
    </div>

    <div v-if="state.pluginLoading && !state.plugins.length" class="plugin-empty-state">
      <span class="plugin-empty-icon"><AppIcon name="activity" :size="22" /></span>
      <strong>正在读取本地插件…</strong>
    </div>

    <div v-else-if="!state.plugins.length" class="plugin-empty-state">
      <span class="plugin-empty-icon"><AppIcon name="puzzle" :size="24" /></span>
      <strong>还没有本地插件</strong>
      <p>点击“安装本地插件”，选择插件目录中的 manifest.json。浏览器降级模式只保存 manifest，不执行插件代码。</p>
    </div>

    <div v-else class="plugins-grid">
      <article v-for="plugin in state.plugins" :key="plugin.manifest.id" class="plugin-card">
        <header class="plugin-card-header">
          <span class="plugin-icon"><AppIcon name="puzzle" :size="20" /></span>
          <div class="plugin-title">
            <strong>{{ plugin.manifest.name }}</strong>
            <code>{{ plugin.manifest.id }}</code>
          </div>
          <span :class="['plugin-status', statusTone(plugin.status)]"><i></i>{{ statusLabel(plugin.status) }}</span>
        </header>

        <p class="plugin-description">{{ plugin.manifest.description || '未提供插件描述。' }}</p>

        <div class="plugin-meta-grid">
          <div><small>版本</small><strong>{{ plugin.manifest.version }}</strong></div>
          <div><small>作者</small><strong>{{ plugin.manifest.author || '未声明' }}</strong></div>
          <div><small>运行环境</small><strong>{{ plugin.manifest.engines.codeless }}</strong></div>
          <div><small>网络策略</small><strong class="plugin-network"><i></i>{{ plugin.manifest.network }}</strong></div>
        </div>

        <div class="plugin-entry-row">
          <span :class="{ available: plugin.hasMain }"><i></i>main {{ plugin.hasMain ? '可用' : '未提供' }}</span>
          <span :class="{ available: plugin.hasUi }"><i></i>ui {{ plugin.hasUi ? '可用' : '未提供' }}</span>
        </div>

        <div class="plugin-permissions">
          <small>请求权限</small>
          <div v-if="plugin.manifest.permissions.length" class="plugin-permission-list">
            <span v-for="permission in plugin.manifest.permissions" :key="permission">{{ permissionLabel(permission) }}</span>
          </div>
          <span v-else class="plugin-no-permission">无额外权限</span>
        </div>

        <div v-if="plugin.status === 'invalid'" class="plugin-error"><AppIcon name="info" :size="14" />{{ plugin.error || 'manifest 或插件入口无效' }}</div>

        <footer class="plugin-card-actions">
          <button class="subtle-button compact" :disabled="plugin.status === 'invalid'" @click="togglePlugin(plugin)">
            <AppIcon :name="plugin.status === 'ready' ? 'eye-off' : 'check'" :size="14" />{{ plugin.status === 'ready' ? '停用' : '启用' }}
          </button>
          <button class="subtle-button compact" :disabled="plugin.status !== 'ready' || !plugin.hasUi" @click="state.openPluginUi(plugin)"><AppIcon name="monitor" :size="14" />打开 UI</button>
          <button class="icon-button plugin-remove-button" title="卸载插件" @click="removePlugin(plugin)"><AppIcon name="trash" :size="14" /></button>
        </footer>
      </article>
    </div>

    <PluginSandboxFrame
      v-if="state.pluginUiUrl && state.activePlugin"
      :src="state.pluginUiUrl"
      :plugin-id="state.activePlugin.manifest.id"
      :permissions="state.activePlugin.manifest.permissions"
      @close="state.closePluginUi"
    />
  </section>
</template>
