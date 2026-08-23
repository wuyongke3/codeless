<script setup lang="ts">
import HomeView from '../modules/home/HomeView.vue'

import type { AppShellUi } from '../modules/shared/appShellTypes'

type AppState = AppShellUi
defineProps<{ ui: AppState }>()
</script>

<template><HomeView :ui="ui" /></template>
