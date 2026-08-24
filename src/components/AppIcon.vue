<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  size?: number
  strokeWidth?: number
}>(), {
  size: 18,
  strokeWidth: 1.8,
})
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'home'">
      <path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" />
    </template>
    <template v-else-if="name === 'users'"><circle cx="9" cy="9" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 4.5a3 3 0 0 1 0 5.8M18 14a4.5 4.5 0 0 1 3 4" /></template>
    <template v-else-if="name === 'apps'">
      <rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" />
    </template>
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </template>
    <template v-else-if="name === 'flow'">
      <rect x="3" y="3" width="7" height="6" rx="2" /><rect x="14" y="15" width="7" height="6" rx="2" /><path d="M6.5 9v3a3 3 0 0 0 3 3H14" /><path d="m12 13 2 2-2 2" />
    </template>
    <template v-else-if="name === 'activity'">
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </template>
    <template v-else-if="name === 'puzzle'">
      <path d="M8.5 4.5a2.5 2.5 0 1 1 4.9 0H19a1 1 0 0 1 1 1v4.6a2.5 2.5 0 1 0 0 4.9V19a1 1 0 0 1-1 1h-4.6a2.5 2.5 0 1 0-4.9 0H5a1 1 0 0 1-1-1v-4.6a2.5 2.5 0 1 0 0-4.9V5a1 1 0 0 1 1-1h4.6c-.1.2-.1.3-.1.5Z" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </template>
    <template v-else-if="name === 'info'"><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" /></template>
    <template v-else-if="name === 'help'">
      <circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 4 1.8c-1 .7-1.8 1.1-1.8 2.5" /><path d="M12 17h.01" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'chevron-down'"><path d="m7 10 5 5 5-5" /></template>
    <template v-else-if="name === 'chevron-right'"><path d="m9 6 6 6-6 6" /></template>
    <template v-else-if="name === 'monitor'">
      <rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" />
    </template>
    <template v-else-if="name === 'mobile'">
      <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" />
    </template>
    <template v-else-if="name === 'undo'"><path d="m9 7-5 5 5 5" /><path d="M20 17a7 7 0 0 0-7-7H4" /></template>
    <template v-else-if="name === 'redo'"><path d="m15 7 5 5-5 5" /><path d="M4 17a7 7 0 0 1 7-7h9" /></template>
    <template v-else-if="name === 'eye'"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></template>
    <template v-else-if="name === 'save'"><path d="M5 3h12l3 3v15H4V3h1Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></template>
    <template v-else-if="name === 'download'"><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 20h14" /></template>
    <template v-else-if="name === 'upload'"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 20h14" /></template>
    <template v-else-if="name === 'play'"><path d="m8 5 11 7-11 7V5Z" /></template>
    <template v-else-if="name === 'heading'"><path d="M5 5v14M19 5v14M5 12h14" /></template>
    <template v-else-if="name === 'text'"><path d="M5 6h14M5 10h10M5 14h14M5 18h8" /></template>
    <template v-else-if="name === 'button'"><rect x="3" y="7" width="18" height="10" rx="3" /><path d="M9 12h6" /></template>
    <template v-else-if="name === 'input'"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10v4M5 10h4M5 14h4" /></template>
    <template v-else-if="name === 'select'"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="m15 11 2 2 2-2" /></template>
    <template v-else-if="name === 'table'"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 9v11M15 9v11" /></template>
    <template v-else-if="name === 'chart'"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></template>
    <template v-else-if="name === 'image'"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="2" /><path d="m21 15-5-5L5 20" /></template>
    <template v-else-if="name === 'divider'"><path d="M3 12h18" /></template>
    <template v-else-if="name === 'modal'"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 9h16M8 7h.01M11 7h.01" /></template>
    <template v-else-if="name === 'loading'"><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 3v4M12 3h4" /></template>
    <template v-else-if="name === 'badge'"><circle cx="12" cy="12" r="8" /><path d="M9 12h6" /></template>
    <template v-else-if="name === 'tag'"><path d="M4 5v6l8 8 8-8-8-8H4Z" /><circle cx="8" cy="9" r="1" /></template>
    <template v-else-if="name === 'alert'"><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5M12 17h.01" /></template>
    <template v-else-if="name === 'progress'"><path d="M4 7h16M4 12h16M4 17h16" /><path d="M4 7h7M4 12h12M4 17h4" /></template>
    <template v-else-if="name === 'toggle'"><rect x="3" y="7" width="18" height="10" rx="5" /><circle cx="16" cy="12" r="3" /></template>
    <template v-else-if="name === 'checkbox'"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></template>
    <template v-else-if="name === 'radio'"><circle cx="8" cy="12" r="4" /><circle cx="16" cy="12" r="4" /><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'calendar'"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></template>
    <template v-else-if="name === 'pagination'"><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'breadcrumb'"><path d="M4 7h4l2 5 2-5h4l4 5-4 5h-4l-2-5-2 5H4l4-5-4-5Z" /></template>
    <template v-else-if="name === 'tabs'"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 7h3M14 7h3M7 14h10" /></template>
    <template v-else-if="name === 'collapse'"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m9 10 3 3 3-3" /></template>
    <template v-else-if="name === 'avatar'"><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></template>
    <template v-else-if="name === 'link'"><path d="m10 13 4-4" /><path d="M8 16H6a4 4 0 0 1 0-8h4M16 8h2a4 4 0 0 1 0 8h-4" /></template>
    <template v-else-if="name === 'unlink'"><path d="m9 15-3 3" /><path d="m15 9 3-3" /><path d="M7.5 8.5 6 8a4 4 0 0 0 0 8h4" /><path d="m16.5 15.5 1.5.5a4 4 0 0 0 0-8h-4" /></template>
    <template v-else-if="name === 'tooltip'"><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8M8 12h5" /></template>
    <template v-else-if="name === 'spacer'"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" /></template>
    <template v-else-if="name === 'card'"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></template>
    <template v-else-if="name === 'frame'"><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M8 4v4h4M4 8h4M20 16h-4v4M16 20v-4" /></template>
    <template v-else-if="name === 'stack'"><path d="m12 3 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></template>
    <template v-else-if="name === 'grid'"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></template>
    <template v-else-if="name === 'drawer'"><path d="M5 3h14v18H5z" /><path d="M9 3v18M12 12h4" /></template>
    <template v-else-if="name === 'sparkle'"><path d="m12 3 1.3 4.1L17 9l-3.7 1.9L12 15l-1.3-4.1L7 9l3.7-1.9L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></template>
    <template v-else-if="name === 'cloud'"><path d="M6 19h12a4 4 0 0 0 .4-8A6 6 0 0 0 7 9a5 5 0 0 0-1 10Z" /><path d="m9 14 3-3 3 3M12 11v7" /></template>
    <template v-else-if="name === 'check'"><path d="m5 12 4 4L19 6" /></template>
    <template v-else-if="name === 'code'"><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></template>
    <template v-else-if="name === 'more'"><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'copy'"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></template>
    <template v-else-if="name === 'clipboard'"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M8 9h8M8 13h6M8 17h4" /></template>
    <template v-else-if="name === 'scissors'"><circle cx="6" cy="7" r="2" /><circle cx="6" cy="17" r="2" /><path d="m8 8 11 9M8 16 19 7" /></template>
    <template v-else-if="name === 'edit'"><path d="m4 16-.8 4.8L8 20l11-11-3.8-3.8L4 16Z" /><path d="m13.8 6.2 3.8 3.8" /></template>
    <template v-else-if="name === 'eye-off'"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 7 9.5 7c1 0 2-.2 2.8-.5" /></template>
    <template v-else-if="name === 'unlock'"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.4-2.1" /></template>
    <template v-else-if="name === 'arrow-up'"><path d="M12 19V5M6 11l6-6 6 6" /></template>
    <template v-else-if="name === 'arrow-down'"><path d="M12 5v14M18 13l-6 6-6-6" /></template>
    <template v-else-if="name === 'trash'"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></template>
    <template v-else-if="name === 'close'"><path d="m6 6 12 12M18 6 6 18" /></template>
    <template v-else-if="name === 'window-minimize'"><path d="M5 18h14" /></template>
    <template v-else-if="name === 'window-maximize'"><rect x="5" y="5" width="14" height="14" rx="1" /></template>
    <template v-else-if="name === 'window-restore'"><rect x="7" y="4" width="12" height="12" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h11" /></template>

    <template v-else-if="name === 'cursor'"><path d="m5 3 14 9-6 2-3 6L5 3Z" /></template>
    <template v-else-if="name === 'lock'"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></template>
    <template v-else-if="name === 'bell'"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></template>
    <template v-else-if="name === 'layers'"><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></template>
    <template v-else><circle cx="12" cy="12" r="9" /></template>
  </svg>
</template>
