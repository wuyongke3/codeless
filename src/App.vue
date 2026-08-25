<script setup lang="ts">
import { reactive, ref } from 'vue'
import PreviewModal from './components/common/PreviewModal.vue'
import RowEditorDialog from './components/common/RowEditorDialog.vue'
import CreateProjectDialog from './components/common/CreateProjectDialog.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import CollaborationPanel from './components/CollaborationPanel.vue'
import HomeModule from './modules/home/HomeModule.vue'
import WorkspaceModule from './modules/workspace/WorkspaceModule.vue'
import AppIcon from './components/AppIcon.vue'
import AppWindowTitlebar from './components/window/AppWindowTitlebar.vue'
import AppSettingsPanel from './components/common/AppSettingsPanel.vue'
import { useLowcode } from './composables/useLowcode'
import { useAppPreferences } from './composables/useAppPreferences'

const ui = useLowcode()
const state = reactive(ui)
const settingsOpen = ref(false)
const appPreferences = useAppPreferences()
</script>

<template>
  <div v-if="state.loading" class="boot-screen">
    <div class="boot-logo"><img src="/logo.png" alt="Codeless" /></div>
    <strong>Codeless</strong>
    <div class="boot-loader"><span></span></div>
    <p>正在打开本地工作台…</p>
  </div>

  <template v-else>
    <AppWindowTitlebar @open-settings="settingsOpen = true" />
    <div class="app-content-shell">
      <HomeModule v-if="state.appModule === 'home'" :ui="ui" />
      <WorkspaceModule v-else :ui="ui" />

      <PreviewModal :ui="ui" />
      <CollaborationPanel :ui="ui" />
      <RowEditorDialog :ui="ui" />
      <CreateProjectDialog :ui="ui" />
      <ConfirmDialog :ui="ui" />
      <AppSettingsPanel :open="settingsOpen" :preferences="appPreferences" @close="settingsOpen = false" />
    </div>
    <Transition name="toast">
      <div v-if="state.toast.show" :class="['toast-message', state.toast.tone]">
        <span><AppIcon :name="state.toast.tone === 'danger' ? 'close' : state.toast.tone === 'info' ? 'sparkle' : 'check'" :size="15" /></span>
        {{ state.toast.message }}
      </div>
    </Transition>
  </template>
</template>
