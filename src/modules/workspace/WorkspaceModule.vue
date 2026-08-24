<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppRouteNavigation from '../shared/AppRouteNavigation.vue'
import ActivityView from '../../views/ActivityView.vue'
import BuilderView from '../../views/BuilderView.vue'
import DataModelView from '../../views/DataModelView.vue'
import FlowsView from '../../views/FlowsView.vue'
import PluginsView from '../../views/PluginsView.vue'

import type { AppShellUi } from '../shared/appShellTypes'

type AppState = AppShellUi
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)

const currentView = computed(() => {
  if (state.activeArea === 'data') return DataModelView
  if (state.activeArea === 'flows') return FlowsView
  if (state.activeArea === 'plugins') return PluginsView
  if (state.activeArea === 'activity') return ActivityView
  return BuilderView
})
</script>

<template>
  <div class="app-shell module-shell workspace-shell">
    <main class="main-column">
      <AppRouteNavigation :ui="ui" mode="workspace" />
      <component :is="currentView" :ui="ui" />
    </main>
  </div>
</template>
