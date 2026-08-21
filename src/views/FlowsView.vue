<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../components/AppIcon.vue'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)
</script>

<template>
      <section class="flow-view">
        <div class="flow-toolbar"><div><span class="section-kicker">AUTOMATION</span><h2>客户创建后自动通知</h2></div><div><span><i></i>流程已启用</span><button class="ghost-button compact"><AppIcon name="play" :size="15" />测试运行</button><button class="primary-button compact" @click="state.notify('流程已保存')"><AppIcon name="save" :size="15" />保存流程</button></div></div>
        <div class="flow-canvas"><div class="flow-grid"></div><div class="flow-tools"><button class="active"><AppIcon name="cursor" :size="17" /></button><button><AppIcon name="plus" :size="17" /></button><i></i><button>＋</button><button>−</button></div><div class="connector c1"></div><div class="connector c2"></div>
          <article class="flow-node trigger"><header><span class="purple"><AppIcon name="database" :size="18" /></span><div><small>触发器</small><strong>新增客户记录</strong></div><button><AppIcon name="more" :size="15" /></button></header><div><span>数据表</span><strong>customers</strong></div><i></i></article>
          <button class="flow-add a1"><AppIcon name="plus" :size="15" /></button>
          <article class="flow-node condition"><header><span class="orange"><AppIcon name="flow" :size="18" /></span><div><small>条件判断</small><strong>客户等级判断</strong></div><button><AppIcon name="more" :size="15" /></button></header><div class="condition-code"><span>如果</span><code>customer.level</code><b>等于</b><em>重要客户</em></div><label>是</label><i></i></article>
          <button class="flow-add a2"><AppIcon name="plus" :size="15" /></button>
          <article class="flow-node action"><header><span class="green"><AppIcon name="bell" :size="18" /></span><div><small>执行动作</small><strong>发送桌面通知</strong></div><button><AppIcon name="more" :size="15" /></button></header><div><span>通知内容</span><strong>有一位新的重要客户</strong></div></article>
          <div class="flow-hint"><AppIcon name="sparkle" :size="16" />流程仅在本机运行，不依赖云端服务</div>
        </div>
      </section>
</template>