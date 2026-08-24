<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { ReviewAttachment, ReviewComment, ReviewDiffEntry } from '../types/lowcode'

type ReviewUi = Record<string, any>

const props = defineProps<{ ui: ReviewUi }>()
const state = reactive(props.ui)
const snapshotName = ref('')
const commentText = ref('')
const commentX = ref('')
const commentY = ref('')
const commentAttachments = ref<ReviewAttachment[]>([])
const diffPageId = ref('')
const diffWidgetId = ref('')
const diffProperty = ref('')
const importing = ref(false)

function getPathPart(path: string, collection: 'pages' | 'widgets') {
  return path.match(new RegExp(`${collection}\\[([^\\]]+)\\]`))?.[1] || ''
}

function getPropertyPath(path: string) {
  const widgetIndex = path.lastIndexOf('.widgets[')
  if (widgetIndex >= 0) return path.slice(path.indexOf('].', widgetIndex) + 2) || 'widget'
  const pageIndex = path.lastIndexOf('.pages[')
  if (pageIndex >= 0) return path.slice(path.indexOf('].', pageIndex) + 2) || 'page'
  return path.split('.')[0] || '$'
}

const currentDiff = computed(() => {
  const candidate = state.currentDiff
  if (!candidate) return null
  return {
    entries: Array.isArray(candidate.entries) ? candidate.entries as ReviewDiffEntry[] : [],
    summary: {
      added: Number(candidate.summary?.added) || 0,
      changed: Number(candidate.summary?.changed) || 0,
      removed: Number(candidate.summary?.removed) || 0,
    },
  }
})
const diffEntries = computed<ReviewDiffEntry[]>(() => currentDiff.value?.entries || [])
const diffPageIds = computed(() => [...new Set(diffEntries.value.map(entry => getPathPart(entry.path, 'pages')).filter(Boolean))].sort())
const diffWidgetIds = computed(() => [...new Set(diffEntries.value.map(entry => getPathPart(entry.path, 'widgets')).filter(Boolean))].sort())
const diffProperties = computed(() => [...new Set(diffEntries.value.map(entry => getPropertyPath(entry.path)).filter(Boolean))].sort())
const filteredDiffEntries = computed(() => diffEntries.value.filter((entry) => {
  const pageId = getPathPart(entry.path, 'pages')
  const widgetId = getPathPart(entry.path, 'widgets')
  const property = getPropertyPath(entry.path)
  return (!diffPageId.value || pageId === diffPageId.value)
    && (!diffWidgetId.value || widgetId === diffWidgetId.value)
    && (!diffProperty.value || property === diffProperty.value)
}))
const reviewState = computed(() => {
  const candidate = state.reviewState
  return {
    snapshots: Array.isArray(candidate?.snapshots) ? candidate.snapshots : [],
    comments: Array.isArray(candidate?.comments) ? candidate.comments : [],
    activity: Array.isArray(candidate?.activity) ? candidate.activity : [],
    activeSnapshotId: typeof candidate?.activeSnapshotId === 'string' ? candidate.activeSnapshotId : null,
  }
})
const openCommentCount = computed(() =>
  reviewState.value.comments.filter((comment: ReviewComment) => comment.status === 'open').length,
)
const recentActivity = computed(() => reviewState.value.activity.slice(-10).reverse())

function createSnapshot() {
  state.createSnapshot(snapshotName.value)
  snapshotName.value = ''
}

function addComment() {
  const x = commentX.value.trim() === '' ? undefined : Number(commentX.value)
  const y = commentY.value.trim() === '' ? undefined : Number(commentY.value)
  const comment = state.addComment(commentText.value, {
    x: Number.isFinite(x) ? x : undefined,
    y: Number.isFinite(y) ? y : undefined,
  }, commentAttachments.value)
  if (!comment) return
  commentText.value = ''
  commentX.value = ''
  commentY.value = ''
  commentAttachments.value = []
}

async function attachScreenshot(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const attachment = await state.createReviewImageAttachment(file)
    commentAttachments.value = [...commentAttachments.value, attachment]
  } catch (error) {
    console.error(error)
  }
}

function removeAttachment(attachmentId: string) {
  commentAttachments.value = commentAttachments.value.filter(attachment => attachment.id !== attachmentId)
}

function deleteSnapshot(snapshotId: string) {
  if (window.confirm('Delete this snapshot and its linked comments?')) state.removeSnapshot(snapshotId)
}

function toggleComment(comment: ReviewComment) {
  state.setCommentStatus(comment.id, comment.status === 'open' ? 'resolved' : 'open')
}

async function importReviewPackage() {
  importing.value = true
  try {
    await state.importReviewPackage()
  } catch (error) {
    console.error(error)
  } finally {
    importing.value = false
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function diffValue(value: unknown) {
  if (value === undefined) return '—'
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return String(serialized).slice(0, 220)
}
</script>

<template>
  <aside class="review-panel" data-testid="review-panel">
    <header class="review-panel-header">
      <div>
        <strong>审阅交付</strong>
        <small>本地快照、评论、Diff 与可离线交换的审阅包</small>
      </div>
      <button class="icon-button tiny" title="关闭审阅面板" @click="state.toggleReviewPanel()">×</button>
    </header>

    <section class="review-section">
      <div class="review-section-title"><span>版本快照</span><small>{{ reviewState.snapshots.length }}/12</small></div>
      <div class="review-create-row">
        <input v-model="snapshotName" placeholder="例如：交付候选版" @keydown.enter="createSnapshot" />
        <button class="primary-button compact" :disabled="reviewState.snapshots.length >= 12" @click="createSnapshot">创建</button>
      </div>
      <div v-if="!reviewState.snapshots.length" class="review-empty">先创建快照，再将当前版本的变更与评论打包交付。</div>
      <div v-else class="review-snapshot-list">
        <article v-for="snapshot in reviewState.snapshots" :key="snapshot.id" :class="['review-snapshot', { active: snapshot.id === reviewState.activeSnapshotId }]" @click="state.chooseSnapshot(snapshot.id)">
          <div class="review-snapshot-main">
            <strong>{{ snapshot.name }}</strong>
            <small>{{ formatDate(snapshot.createdAt) }} · 源版本 {{ formatDate(snapshot.sourceUpdatedAt) }}</small>
          </div>
          <button class="icon-button tiny danger-text" title="删除快照" @click.stop="deleteSnapshot(snapshot.id)">×</button>
        </article>
      </div>
    </section>

    <section class="review-section">
      <div class="review-section-title"><span>Diff 筛选</span><small v-if="state.activeSnapshot">基于 {{ state.activeSnapshot.name }}</small></div>
      <div v-if="currentDiff" class="review-diff-summary">
        <span><b>{{ currentDiff.summary.added }}</b> 新增</span>
        <span><b>{{ currentDiff.summary.changed }}</b> 修改</span>
        <span><b>{{ currentDiff.summary.removed }}</b> 删除</span>
      </div>
      <div class="review-filter-grid" :class="{ disabled: !state.activeSnapshot }">
        <select v-model="diffPageId" :disabled="!state.activeSnapshot"><option value="">所有页面</option><option v-for="pageId in diffPageIds" :key="pageId" :value="pageId">页面：{{ pageId }}</option></select>
        <select v-model="diffWidgetId" :disabled="!state.activeSnapshot"><option value="">所有节点</option><option v-for="widgetId in diffWidgetIds" :key="widgetId" :value="widgetId">节点：{{ widgetId }}</option></select>
        <select v-model="diffProperty" :disabled="!state.activeSnapshot"><option value="">所有属性</option><option v-for="property in diffProperties" :key="property" :value="property">属性：{{ property }}</option></select>
      </div>
      <div v-if="!state.activeSnapshot" class="review-empty">选择或创建一个快照后即可查看变更。</div>
      <div v-else-if="!currentDiff || !currentDiff.entries.length" class="review-empty">当前版本与快照没有内容差异。</div>
      <div v-else-if="!filteredDiffEntries.length" class="review-empty">没有符合当前页面、节点和属性筛选条件的差异。</div>
      <div v-else class="review-diff-list">
        <div v-for="entry in filteredDiffEntries" :key="`${entry.kind}-${entry.path}`" class="review-diff-entry">
          <span :class="['review-diff-kind', entry.kind]">{{ entry.kind }}</span>
          <code>{{ entry.path }}</code>
          <small v-if="entry.kind === 'changed'">{{ diffValue(entry.before) }} → {{ diffValue(entry.after) }}</small>
        </div>
      </div>
    </section>

    <section class="review-section">
      <div class="review-section-title"><span>添加评论</span><small>自动关联当前页面与选中节点</small></div>
      <textarea v-model="commentText" rows="3" placeholder="记录需要确认的问题或修改建议…" @keydown.ctrl.enter.prevent="addComment" @keydown.meta.enter.prevent="addComment"></textarea>
      <div class="review-anchor-row">
        <input v-model="commentX" type="number" placeholder="X 坐标（可选）" />
        <input v-model="commentY" type="number" placeholder="Y 坐标（可选）" />
      </div>
      <small class="review-context">页面：{{ state.currentProject?.currentPageId || '未指定' }} · 节点：{{ state.selectedWidgetId || '未指定' }}</small>
      <div v-if="commentAttachments.length" class="review-attachment-list">
        <article v-for="attachment in commentAttachments" :key="attachment.id" class="review-attachment-chip">
          <img :src="attachment.dataUrl" :alt="attachment.name" />
          <span>{{ attachment.name }}</span>
          <button class="icon-button tiny" title="移除截图" @click="removeAttachment(attachment.id)">×</button>
        </article>
      </div>
      <div class="review-comment-actions">
        <label class="ghost-button compact review-attachment-button"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="attachScreenshot" />附加截图</label>
        <button class="ghost-button compact" :disabled="!commentText.trim()" @click="addComment">添加评论</button>
      </div>
    </section>

    <section class="review-section review-comments-section">
      <div class="review-section-title"><span>评论</span><small>{{ openCommentCount }} 条待处理</small></div>
      <div v-if="!reviewState.comments.length" class="review-empty">尚未添加本地评论。</div>
      <article v-for="comment in reviewState.comments.slice().reverse()" :key="comment.id" :class="['review-comment', { resolved: comment.status === 'resolved' }]">
        <div class="review-comment-meta"><span>{{ comment.status === 'resolved' ? '已解决' : '待处理' }}</span><small>{{ formatDate(comment.createdAt) }}</small></div>
        <p>{{ comment.text }}</p>
        <small>页面 {{ comment.pageId || '—' }} · 节点 {{ comment.widgetId || '—' }} · 坐标 {{ comment.x ?? '—' }}, {{ comment.y ?? '—' }}</small>
        <div v-if="comment.attachments?.length" class="review-comment-images">
          <a v-for="attachment in comment.attachments" :key="attachment.id" :href="attachment.dataUrl" :download="attachment.name" :title="attachment.name"><img :src="attachment.dataUrl" :alt="attachment.name" /></a>
        </div>
        <button class="ghost-button compact" @click="toggleComment(comment)">{{ comment.status === 'resolved' ? '重新打开' : '标为已解决' }}</button>
      </article>
    </section>

    <section v-if="recentActivity.length" class="review-section review-activity-section">
      <div class="review-section-title"><span>操作记录</span><small>最近 {{ recentActivity.length }} 项</small></div>
      <ol class="review-activity-list"><li v-for="activity in recentActivity" :key="activity.id"><span>{{ activity.message }}</span><small>{{ formatDate(activity.createdAt) }}</small></li></ol>
    </section>

    <footer class="review-panel-footer">
      <div class="review-package-actions">
        <button class="ghost-button compact" :disabled="importing" @click="importReviewPackage">{{ importing ? '导入中…' : '导入审阅包' }}</button>
        <button class="primary-button compact" @click="state.exportReviewPackage()">导出审阅包</button>
      </div>
      <small>审阅包为本地 JSON，包含版本上下文、快照、评论、截图和 Diff。</small>
    </footer>
  </aside>
</template>

<style scoped>
.review-panel { position: fixed; z-index: 30; top: 72px; right: 18px; bottom: 18px; width: min(440px, calc(100vw - 36px)); display: flex; flex-direction: column; overflow: hidden; color: #1f2430; background: #fff; border: 1px solid #dfe3ee; border-radius: 14px; box-shadow: 0 18px 45px rgb(32 39 63 / 18%); }
.review-panel-header, .review-section-title, .review-create-row, .review-anchor-row, .review-comment-meta, .review-panel-footer, .review-comment-actions, .review-package-actions { display: flex; align-items: center; gap: 8px; }
.review-panel-header { justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #edf0f6; }
.review-panel-header strong, .review-panel-header small { display: block; }
.review-panel-header small, .review-section-title small, .review-context, .review-panel-footer small { color: #7c8495; font-size: 11px; }
.review-section { padding: 13px 16px; border-bottom: 1px solid #f0f1f6; }
.review-section-title { justify-content: space-between; margin-bottom: 9px; font-size: 13px; font-weight: 700; }
.review-create-row input, .review-anchor-row input, .review-section textarea, .review-filter-grid select { min-width: 0; box-sizing: border-box; width: 100%; padding: 8px 9px; color: inherit; background: #f8f9fc; border: 1px solid #dfe3ee; border-radius: 7px; font: inherit; font-size: 12px; }
.review-create-row input { flex: 1; }.review-anchor-row { margin-top: 8px; }.review-section textarea { resize: vertical; }.review-filter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }.review-filter-grid.disabled { opacity: .55; }
.review-snapshot-list, .review-diff-list, .review-comments-section { overflow: auto; }.review-snapshot-list { max-height: 150px; margin-top: 9px; }
.review-snapshot { display: flex; align-items: center; justify-content: space-between; padding: 8px; border: 1px solid transparent; border-radius: 8px; cursor: pointer; }.review-snapshot:hover { background: #f7f8fc; }.review-snapshot.active { background: #f0efff; border-color: #c8c3ff; }.review-snapshot-main strong, .review-snapshot-main small { display: block; }.review-snapshot-main small { margin-top: 2px; color: #7c8495; font-size: 11px; }
.review-empty { color: #8a91a1; font-size: 12px; line-height: 1.5; }.review-diff-summary { display: flex; gap: 10px; margin-bottom: 8px; color: #5f6879; font-size: 11px; }.review-diff-summary b { color: #252b38; }.review-diff-list { max-height: 180px; }.review-diff-entry { padding: 7px 0; border-top: 1px solid #f0f1f5; }.review-diff-kind { display: inline-block; min-width: 52px; margin-right: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; }.review-diff-kind.added { color: #168a59; }.review-diff-kind.removed { color: #c94b57; }.review-diff-kind.changed { color: #8a62d1; }.review-diff-entry code { color: #40495b; font-size: 10px; word-break: break-all; }.review-diff-entry small { display: block; margin-top: 4px; color: #7c8495; font-size: 10px; word-break: break-word; }
.review-context { display: block; margin: 7px 0; }.review-comment-actions { justify-content: space-between; }.review-attachment-button input { display: none; }.review-attachment-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }.review-attachment-chip { display: flex; align-items: center; gap: 5px; max-width: 100%; padding: 4px; border: 1px solid #e2e5ed; border-radius: 6px; font-size: 10px; }.review-attachment-chip img { width: 24px; height: 24px; object-fit: cover; border-radius: 4px; }.review-attachment-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.review-comments-section { flex: 1; min-height: 90px; }.review-comment { margin-top: 8px; padding: 9px; background: #fafbfe; border: 1px solid #e6e9f1; border-radius: 8px; }.review-comment.resolved { opacity: .68; }.review-comment-meta { justify-content: space-between; color: #6e7688; font-size: 10px; }.review-comment p { margin: 7px 0 4px; font-size: 12px; line-height: 1.45; white-space: pre-wrap; }.review-comment > small { display: block; margin-bottom: 7px; color: #8a91a1; font-size: 10px; }.review-comment-images { display: flex; flex-wrap: wrap; gap: 6px; margin: 7px 0; }.review-comment-images img { width: 48px; height: 48px; object-fit: cover; border: 1px solid #e1e4ec; border-radius: 5px; }
.review-activity-section { max-height: 128px; overflow: auto; }.review-activity-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }.review-activity-list li { display: flex; justify-content: space-between; gap: 8px; color: #50586a; font-size: 11px; }.review-activity-list small { color: #8a91a1; font-size: 10px; white-space: nowrap; }.review-panel-footer { flex-direction: column; align-items: stretch; padding: 12px 16px; }.review-package-actions { justify-content: stretch; }.review-package-actions button { flex: 1; justify-content: center; }.review-panel-footer small { text-align: center; }
@media (max-width: 560px) { .review-panel { top: 60px; right: 8px; bottom: 8px; width: calc(100vw - 16px); }.review-filter-grid { grid-template-columns: 1fr; } }
</style>
