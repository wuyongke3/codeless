<script setup lang="ts">
import { ref } from 'vue'
import type { ReviewComment } from '../types/lowcode'

type ReviewUi = Record<string, any>
const props = defineProps<{ ui: ReviewUi }>()
const state = props.ui
const snapshotName = ref('')
const commentText = ref('')
const commentX = ref<string>('')
const commentY = ref<string>('')

function createSnapshot() {
  state.createSnapshot(snapshotName.value)
  snapshotName.value = ''
}

function addComment() {
  const x = commentX.value.trim() === '' ? undefined : Number(commentX.value)
  const y = commentY.value.trim() === '' ? undefined : Number(commentY.value)
  state.addComment(commentText.value, {
    x: Number.isFinite(x) ? x : undefined,
    y: Number.isFinite(y) ? y : undefined,
  })
  commentText.value = ''
  commentX.value = ''
  commentY.value = ''
}

function deleteSnapshot(snapshotId: string) {
  if (window.confirm('???????????')) state.removeSnapshot(snapshotId)
}

function toggleComment(comment: ReviewComment) {
  state.setCommentStatus(comment.id, comment.status === 'open' ? 'resolved' : 'open')
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function diffValue(value: unknown) {
  if (value === undefined) return '?'
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return String(serialized).slice(0, 220)
}
</script>

<template>
  <aside class="review-panel" data-testid="review-panel">
    <header class="review-panel-header">
      <div>
        <strong>????</strong>
        <small>????????? Diff ??????</small>
      </div>
      <button class="icon-button tiny" title="????" @click="state.toggleReviewPanel()">?</button>
    </header>

    <section class="review-section">
      <div class="review-section-title"><span>??</span><small>{{ state.reviewState.snapshots.length }}/12</small></div>
      <div class="review-create-row">
        <input v-model="snapshotName" placeholder="????????" @keydown.enter="createSnapshot" />
        <button class="primary-button compact" :disabled="state.reviewState.snapshots.length >= 12" @click="createSnapshot">??</button>
      </div>
      <div v-if="!state.reviewState.snapshots.length" class="review-empty">??????????????????</div>
      <div v-else class="review-snapshot-list">
        <article
          v-for="snapshot in state.reviewState.snapshots"
          :key="snapshot.id"
          :class="['review-snapshot', { active: snapshot.id === state.reviewState.activeSnapshotId }]"
          @click="state.chooseSnapshot(snapshot.id)"
        >
          <div class="review-snapshot-main">
            <strong>{{ snapshot.name }}</strong>
            <small>{{ formatDate(snapshot.createdAt) }}</small>
          </div>
          <button class="icon-button tiny danger-text" title="????" @click.stop="deleteSnapshot(snapshot.id)">?</button>
        </article>
      </div>
    </section>

    <section class="review-section">
      <div class="review-section-title"><span>Diff ??</span><small v-if="state.activeSnapshot">???{{ state.activeSnapshot.name }}</small></div>
      <div v-if="state.currentDiff" class="review-diff-summary">
        <span><b>{{ state.currentDiff.summary.added }}</b> ??</span>
        <span><b>{{ state.currentDiff.summary.changed }}</b> ??</span>
        <span><b>{{ state.currentDiff.summary.removed }}</b> ??</span>
      </div>
      <div v-if="!state.activeSnapshot" class="review-empty">?????????</div>
      <div v-else-if="!state.currentDiff.entries.length" class="review-empty">??????????????</div>
      <div v-else class="review-diff-list">
        <div v-for="entry in state.currentDiff.entries" :key="`${entry.kind}-${entry.path}`" class="review-diff-entry">
          <span :class="['review-diff-kind', entry.kind]">{{ entry.kind }}</span>
          <code>{{ entry.path }}</code>
          <small v-if="entry.kind === 'changed'">{{ diffValue(entry.before) }} ? {{ diffValue(entry.after) }}</small>
        </div>
      </div>
    </section>

    <section class="review-section">
      <div class="review-section-title"><span>????</span><small>???????????</small></div>
      <textarea v-model="commentText" rows="3" placeholder="?????????..." @keydown.ctrl.enter.prevent="addComment" @keydown.meta.enter.prevent="addComment"></textarea>
      <div class="review-anchor-row">
        <input v-model="commentX" type="number" placeholder="X????" />
        <input v-model="commentY" type="number" placeholder="Y????" />
      </div>
      <small class="review-context">???{{ state.currentProject?.currentPageId || '???' }} ? ???{{ state.selectedWidgetId || '???' }}</small>
      <button class="ghost-button compact review-full-button" :disabled="!commentText.trim()" @click="addComment">??????</button>
    </section>

    <section class="review-section review-comments-section">
      <div class="review-section-title"><span>??</span><small>{{ state.openComments.length }} ????</small></div>
      <div v-if="!state.reviewState.comments.length" class="review-empty">???????</div>
      <article v-for="comment in state.reviewState.comments.slice().reverse()" :key="comment.id" :class="['review-comment', { resolved: comment.status === 'resolved' }]">
        <div class="review-comment-meta"><span>{{ comment.status === 'resolved' ? '???' : '???' }}</span><small>{{ formatDate(comment.createdAt) }}</small></div>
        <p>{{ comment.text }}</p>
        <small>?? {{ comment.pageId || '?' }} ? ?? {{ comment.widgetId || '?' }}</small>
        <button class="ghost-button compact" @click="toggleComment(comment)">{{ comment.status === 'resolved' ? '????' : '?????' }}</button>
      </article>
    </section>

    <footer class="review-panel-footer">
      <button class="primary-button compact" @click="state.exportReviewPackage()">???????</button>
      <small>JSON ???????????????????</small>
    </footer>
  </aside>
</template>

<style scoped>
.review-panel {
  position: fixed;
  z-index: 30;
  top: 72px;
  right: 18px;
  bottom: 18px;
  width: min(420px, calc(100vw - 36px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #1f2430;
  background: #fff;
  border: 1px solid #dfe3ee;
  border-radius: 14px;
  box-shadow: 0 18px 45px rgb(32 39 63 / 18%);
}
.review-panel-header,
.review-section-title,
.review-create-row,
.review-anchor-row,
.review-comment-meta,
.review-panel-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.review-panel-header {
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid #edf0f6;
}
.review-panel-header strong,
.review-panel-header small { display: block; }
.review-panel-header small,
.review-section-title small,
.review-context,
.review-panel-footer small { color: #7c8495; font-size: 11px; }
.review-panel > section { padding: 13px 16px; border-bottom: 1px solid #edf0f6; }
.review-section-title { justify-content: space-between; margin-bottom: 9px; font-size: 13px; font-weight: 700; }
.review-create-row input,
.review-anchor-row input,
.review-section textarea {
  min-width: 0;
  box-sizing: border-box;
  width: 100%;
  padding: 8px 9px;
  color: inherit;
  background: #f8f9fc;
  border: 1px solid #dfe3ee;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
}
.review-create-row input { flex: 1; }
.review-anchor-row { margin-top: 8px; }
.review-section textarea { resize: vertical; }
.review-snapshot-list,
.review-diff-list,
.review-comments-section { overflow: auto; }
.review-snapshot-list { max-height: 150px; margin-top: 9px; }
.review-snapshot { display: flex; align-items: center; justify-content: space-between; padding: 8px; border: 1px solid transparent; border-radius: 8px; cursor: pointer; }
.review-snapshot:hover { background: #f7f8fc; }
.review-snapshot.active { background: #f0efff; border-color: #c8c3ff; }
.review-snapshot-main strong,
.review-snapshot-main small { display: block; }
.review-snapshot-main small { margin-top: 2px; color: #7c8495; font-size: 11px; }
.review-empty { color: #8a91a1; font-size: 12px; line-height: 1.5; }
.review-diff-summary { display: flex; gap: 10px; margin-bottom: 8px; color: #5f6879; font-size: 11px; }
.review-diff-summary b { color: #252b38; }
.review-diff-list { max-height: 180px; }
.review-diff-entry { padding: 7px 0; border-top: 1px solid #f0f1f5; }
.review-diff-kind { display: inline-block; min-width: 52px; margin-right: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.review-diff-kind.added { color: #168a59; }
.review-diff-kind.removed { color: #c94b57; }
.review-diff-kind.changed { color: #8a62d1; }
.review-diff-entry code { color: #40495b; font-size: 10px; word-break: break-all; }
.review-diff-entry small { display: block; margin-top: 4px; color: #7c8495; font-size: 10px; word-break: break-word; }
.review-context { display: block; margin: 7px 0; }
.review-full-button { width: 100%; justify-content: center; }
.review-comment { margin-top: 8px; padding: 9px; background: #fafbfe; border: 1px solid #e6e9f1; border-radius: 8px; }
.review-comment.resolved { opacity: .68; }
.review-comment-meta { justify-content: space-between; color: #6e7688; font-size: 10px; }
.review-comment p { margin: 7px 0 4px; font-size: 12px; line-height: 1.45; white-space: pre-wrap; }
.review-comment > small { display: block; margin-bottom: 7px; color: #8a91a1; font-size: 10px; }
.review-comments-section { flex: 1; min-height: 90px; }
.review-panel-footer { flex-direction: column; align-items: stretch; padding: 12px 16px; }
.review-panel-footer small { text-align: center; }
</style>
