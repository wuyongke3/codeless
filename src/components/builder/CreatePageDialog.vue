<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{ open: boolean; existingPaths: string[] }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  create: [payload: { name: string; path: string }]
}>()

const form = reactive({ name: '', path: '' })
const normalizedPath = computed(() => {
  const value = form.path.trim() || form.name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '') || 'page'
  return value.startsWith('/') ? value : `/${value}`
})
const pathAvailable = computed(() => !props.existingPaths.includes(normalizedPath.value))
function close() { emit('update:open', false) }
function submit() {
  const name = form.name.trim()
  if (!name || !pathAvailable.value) return
  emit('create', { name, path: normalizedPath.value })
  close()
}
watch(() => props.open, open => {
  if (!open) return
  form.name = ''
  form.path = ''
})
</script>

<template>
  <Transition name="fade">
    <div v-if="open" class="modal-backdrop" @click.self="close">
      <form class="dialog page-create-dialog" @submit.prevent="submit">
        <header>
          <div><span><AppIcon name="apps" :size="19" /></span><div><h3>新建页面</h3><p>新页面使用独立画布和布局，不会继承系统默认 Header。</p></div></div>
          <button type="button" aria-label="关闭新建页面" @click="close"><AppIcon name="close" :size="18" /></button>
        </header>
        <div class="dialog-body">
          <label><span>页面名称 <i>*</i></span><input v-model="form.name" autofocus placeholder="例如：订单详情" /></label>
          <label><span>页面路径</span><input v-model="form.path" placeholder="例如：/orders/detail" /><small :class="{ 'field-error': !pathAvailable }">{{ pathAvailable ? `将使用 ${normalizedPath}` : `路径 ${normalizedPath} 已存在` }}</small></label>
        </div>
        <footer><span><AppIcon name="layers" :size="14" />创建后进入空白独立画布</span><div><button class="ghost-button" type="button" @click="close">取消</button><button class="primary-button" type="submit" :disabled="!form.name.trim() || !pathAvailable">创建页面</button></div></footer>
      </form>
    </div>
  </Transition>
</template>
