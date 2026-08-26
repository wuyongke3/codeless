<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDesignerCommandSearch, type DesignerCommandContext } from '../composables/commandRegistry'

type Props = { ui: DesignerCommandContext; open: boolean }
const props = defineProps<Props>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const open = computed({ get: () => props.open, set: value => emit('update:open', value) })
const inputRef = ref<HTMLInputElement | null>(null)
const highlightedIndex = ref(0)
const { query, filteredCommands, close } = useDesignerCommandSearch(props.ui, open)

const groupedCommands = computed(() => {
  const groups = new Map<string, typeof filteredCommands.value>()
  for (const command of filteredCommands.value) {
    const current = groups.get(command.group) || []
    current.push(command)
    groups.set(command.group, current)
  }
  return [...groups.entries()]
})
const flatCommands = computed(() => groupedCommands.value.flatMap(([, commands]) => commands))

watch(() => props.open, async value => {
  if (!value) return
  highlightedIndex.value = 0
  await nextTick()
  inputRef.value?.focus()
})
watch(query, () => { highlightedIndex.value = 0 })

function run(command: (typeof filteredCommands.value)[number]) {
  void command.run(props.ui)
  close()
}
function move(delta: number) {
  const count = flatCommands.value.length
  if (!count) return
  highlightedIndex.value = (highlightedIndex.value + delta + count) % count
}
function onKeydown(event: KeyboardEvent) {
  if (!props.open) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      open.value = true
    }
    return
  }
  if (event.key === 'Escape') { event.preventDefault(); close(); return }
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return }
  if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
  if (event.key === 'Enter') {
    event.preventDefault()
    const command = flatCommands.value[highlightedIndex.value]
    if (command) run(command)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="command-palette">
      <div v-if="open" class="command-palette-backdrop" @mousedown.self="close">
        <section class="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
          <header class="command-palette-search"><span>⌘</span><input ref="inputRef" v-model="query" placeholder="搜索命令、页面或组件" aria-label="搜索命令" /><kbd>Esc</kbd></header>
          <div v-if="flatCommands.length" class="command-palette-list">
            <template v-for="([group, commands]) in groupedCommands" :key="group">
              <p class="command-palette-group">{{ group }}</p>
              <button v-for="command in commands" :key="command.id" class="command-palette-item" :class="{ highlighted: flatCommands[highlightedIndex]?.id === command.id }" @mouseenter="highlightedIndex = flatCommands.findIndex(item => item.id === command.id)" @click="run(command)">
                <span><strong>{{ command.label }}</strong><small v-if="command.description">{{ command.description }}</small></span><kbd v-if="command.shortcut">{{ command.shortcut }}</kbd>
              </button>
            </template>
          </div>
          <div v-else class="command-palette-empty">没有匹配的命令</div>
          <footer><span>↑↓ 选择</span><span>Enter 执行</span><span>⌘K 打开</span></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
