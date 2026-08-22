import { onMounted, ref } from 'vue'
import type { InstalledPlugin } from '../types/plugin'
import { browserApi } from './browserData'

type ToastTone = 'success' | 'info' | 'danger'
type Notify = (message: string, tone?: ToastTone) => void

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function usePlugins(notify: Notify) {
  const plugins = ref<InstalledPlugin[]>([])
  const pluginLoading = ref(false)
  const pluginUiUrl = ref<string | null>(null)
  const activePlugin = ref<InstalledPlugin | null>(null)

  function api() {
    return window.lowcode || browserApi
  }

  async function loadPlugins(silent = false) {
    pluginLoading.value = true
    try {
      plugins.value = await api().listPlugins()
    } catch (error) {
      if (!silent) notify(errorMessage(error, '读取本地插件失败'), 'danger')
    } finally {
      pluginLoading.value = false
    }
  }

  async function installPlugin() {
    pluginLoading.value = true
    try {
      const result = await api().installPlugin()
      if (result.canceled) return false
      if (result.plugin) {
        plugins.value = [
          ...plugins.value.filter(plugin => plugin.manifest.id !== result.plugin!.manifest.id),
          result.plugin,
        ].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name, 'zh-CN'))
        notify(`插件“${result.plugin.manifest.name}”已安装`)
        return true
      }
      await loadPlugins(true)
      return true
    } catch (error) {
      notify(errorMessage(error, '插件安装失败'), 'danger')
      return false
    } finally {
      pluginLoading.value = false
    }
  }

  async function removePlugin(id: string) {
    const plugin = plugins.value.find(item => item.manifest.id === id)
    if (!plugin) return false
    try {
      await api().removePlugin(id)
      plugins.value = plugins.value.filter(item => item.manifest.id !== id)
      if (activePlugin.value?.manifest.id === id) closePluginUi()
      notify(`插件“${plugin.manifest.name}”已卸载`, 'info')
      return true
    } catch (error) {
      notify(errorMessage(error, '插件卸载失败'), 'danger')
      return false
    }
  }

  async function setPluginEnabled(id: string, enabled: boolean) {
    try {
      const updated = await api().setPluginEnabled(id, enabled)
      plugins.value = plugins.value.map(plugin => plugin.manifest.id === id ? updated : plugin)
      if (!enabled && activePlugin.value?.manifest.id === id) closePluginUi()
      notify(enabled ? `插件“${updated.manifest.name}”已启用` : `插件“${updated.manifest.name}”已停用`, 'info')
      return updated
    } catch (error) {
      notify(errorMessage(error, enabled ? '插件启用失败' : '插件停用失败'), 'danger')
      return null
    }
  }

  async function openPluginUi(plugin: InstalledPlugin) {
    if (plugin.status !== 'ready' || !plugin.hasUi) {
      notify('该插件没有可加载的 UI，或当前状态不可用', 'info')
      return false
    }
    try {
      const url = await api().getPluginUiUrl(plugin.manifest.id)
      if (!url) {
        notify('浏览器降级模式仅保存 manifest，不加载插件 UI', 'info')
        return false
      }
      activePlugin.value = plugin
      pluginUiUrl.value = url
      return true
    } catch (error) {
      notify(errorMessage(error, '打开插件 UI 失败'), 'danger')
      return false
    }
  }

  function closePluginUi() {
    pluginUiUrl.value = null
    activePlugin.value = null
  }

  onMounted(() => { void loadPlugins(true) })

  return {
    plugins,
    pluginLoading,
    pluginUiUrl,
    activePlugin,
    loadPlugins,
    installPlugin,
    removePlugin,
    setPluginEnabled,
    openPluginUi,
    closePluginUi,
  }
}
