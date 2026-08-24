<script setup lang="ts">
import AppRouteNavigation from '../shared/AppRouteNavigation.vue'
import HomeView from './HomeView.vue'

import type { AppShellUi } from '../shared/appShellTypes'

type AppState = AppShellUi
defineProps<{ ui: AppState }>()
</script>

<template>
  <div class="app-shell module-shell home-shell">
    <main class="main-column">
      <AppRouteNavigation :ui="ui" mode="home" />
      <HomeView :ui="ui" />
    </main>
  </div>
</template>
