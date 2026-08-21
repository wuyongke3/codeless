<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../AppIcon.vue'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)
</script>

<template>
    <Transition name="fade"><div v-if="state.showDeleteConfirm && state.currentProject" class="modal-backdrop" @click.self="state.showDeleteConfirm = false"><div class="confirm-dialog"><span><AppIcon name="trash" :size="22" /></span><h3>删除“{{ state.currentProject.name }}”？</h3><p>应用设计将从本地 SQLite 中永久删除，此操作无法撤销。</p><div><button class="ghost-button" @click="state.showDeleteConfirm = false">取消</button><button class="danger-button" @click="state.confirmDeleteProject">确认删除</button></div></div></div></Transition>
</template>