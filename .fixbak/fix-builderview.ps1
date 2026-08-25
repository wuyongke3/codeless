# Targeted mojibake repairs for src\views\BuilderView.vue
# Ops are applied top-down; each op is scoped to one line (by current index) unless All=true.
$ErrorActionPreference = 'Stop'
$path = 'src\views\BuilderView.vue'
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.UTF8Encoding]::new($false))

function Apply([int]$lineIdx, [string]$find, [string]$replace, [switch]$all) {
  if ($lineIdx -ge $script:lines.Count) { throw "line idx $lineIdx out of range" }
  $l = $script:lines[$lineIdx]
  $rx = New-Object System.Text.RegularExpressions.Regex($find)
  $new = if ($all) { $rx.Replace($l, $replace) } else { $rx.Replace($l, $replace, 1) }
  if ($new -eq $l) { Write-Output ("  WARN no-match L{0}: {1}" -f ($lineIdx+1), $find.Substring(0,[Math]::Min(60,$find.Length))) }
  else { Write-Output ("  ok L{0}" -f ($lineIdx+1)) }
  $script:lines[$lineIdx] = $new
}

Write-Output "== pass 1: global token-option cleanup =="
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match 'tokenOptionsFor') {
    Apply $i '<option value="">[^<]*</option><option v-for="option in tokenOptionsFor' ('<option value="">未设置</option><option v-for="option in tokenOptionsFor')
  }
}

Write-Output "== pass 2: targeted lines =="
Apply 714  'title="[^"]*"'                                    'title="拖拽调整组件面板宽度"'
Apply 837  '<strong>.*</p></div>'                             '<strong>从左侧拖入第一个组件</strong><p>也可以单击组件，将它快速添加到画布</p></div>'
Apply 864  '>灞炴一<'                                          '>属性<'
Apply 870  '<strong>鎬庝箞鐢</strong>'                          '<strong>怎么用</strong>'
Apply 870  [regex]::Escape('统一协议 v1 路 ')                    '统一协议 v1 · '
Apply 933  '<span>[^<]*</span><AppIcon name="chevron-down"'    '<span>基础信息</span><AppIcon name="chevron-down"'
Apply 936  '<span>[^<]*</span><input v-model="state.selectedWidget.name"' '<span>组件名称</span><input v-model="state.selectedWidget.name"'
Apply 939  '<span>\{\{.*\}\}</span><input v-model="state.selectedWidget.config.content.text"' "<span>{{ state.selectedWidget.type === 'stat' ? '指标名称' : state.selectedWidget.type === 'image' ? '占位标题' : '显示文字' }}</span><input v-model=`"state.selectedWidget.config.content.text`""
Apply 948  '<span>[^<]*</span><input v-model="state.selectedWidget.config.content.placeholder"' '<span>占位提示</span><input v-model="state.selectedWidget.config.content.placeholder"'
Apply 954  '<span>[^<]*</span><textarea'                       '<span>表格列（字段|显示名|宽度）</span><textarea'
Apply 954  'placeholder="name[^"]*"'                           'placeholder="name|客户名称|180"'
Apply 957  '<span>[^<]*</span><input v-model="state.selectedWidget.config.content.value"' '<span>静态数值</span><input v-model="state.selectedWidget.config.content.value"'
Apply 966  '<option value="datetime">.*</select>'              '<option value="datetime">日期时间</option></select>'
Apply 969  '</i>[^<]*</span>'                                  '</i>设为必填</span>'
Apply 1038 '<span>鑳屾櫙鑹</span>'                               '<span>背景色</span>'
Apply 1041 '<span>[^<]*</span><select :value="state.selectedWidget.config.style.tokenRefs\?\.color"' '<span>文本色</span><select :value="state.selectedWidget.config.style.tokenRefs?.color"'
Apply 1050 '<span>[^<]*Token</span>'                           '<span>内边距 Token</span>'
Apply 1080 '</i>[^<]*</span></label></section>'                '</i>在预览中隐藏</span></label></section>'
Apply 1086 '<option value="">[^<]*</option><option v-for="table in state.tables" :key="table.name" :value="table.name">\{\{ table\.titl[^<]*</option>' '<option value="">不绑定，使用静态数据</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option>'
Apply 1092 '<span>查询[^<]*</span>'                            '<span>查询模式</span>'
Apply 1092 '<option value="list">[^<]*</option>'               '<option value="list">多行列表</option>'
Apply 1092 '<option value="count[^<]*</option>'                '<option value="count">记录数</option>'
Apply 1092 '<option value="aggregate[^<]*</option>'            '<option value="aggregate">聚合计算</option>'
Apply 1095 '<span>[^<]*</span><input v-model="state.selectedWidget.config.data.labelField"' '<span>显示字段</span><input v-model="state.selectedWidget.config.data.labelField"'
Apply 1095 '<span>值字</span>'                                 '<span>值字段</span>'
Apply 1101 '<span>[^<]*</span><input v-model="state.selectedWidget.config.data.where"' '<span>过滤条件</span><input v-model="state.selectedWidget.config.data.where"'
Apply 1101 [regex]::Escape("status = 跟进繘'")                   "status = '跟进'"
Apply 1110 '<span>[^<]*</span><AppIcon name="chevron-down"'    '<span>兼容表单提交</span><AppIcon name="chevron-down"'
Apply 1110 '<span>提[^<]*/span>'                               '<span>提交到数据表</span>'
Apply 1110 '>不提<'                                            '>不提交<'
Apply 1110 [regex]::Escape('{{ table.title }（{坽{ table.name }}锛') '{{ table.title }}（{{ table.name }}）'
Apply 1110 '<small class="field-help"[^<]*</small>'            '<small class="field-help">更复杂的提交、提示和导航，请在“交互”中配置动作链</small>'
Apply 1119 '<strong>[^<]*互</strong>'                          '<strong>组件交互</strong>'
Apply 1119 '<small[^<]*</small>'                               '<small>配置事件触发后的动作</small>'
Apply 1122 '<p>.*</p></div>'                                   '<p>为这个组件添加事件。表格支持“行点击时”，输入框和下拉框支持“值变化时”。</p></div>'
Apply 1128 '<option value="">[^<]*</option><option v-for="table in state.tables" :key="table.name" :value="table.name">\{\{ table\.title（[^<]*</option>' '<option value="">选择提交的数据表</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option>'
# showModal/hideModal empty option: scope after the showModal marker by splitting manually
$l = $lines[1128]; $k = $l.IndexOf("action.type === 'showModal'")
if ($k -ge 0) {
  $headPart = $l.Substring(0, $k); $tailPart = $l.Substring($k)
  $tailPart = [regex]::Replace($tailPart, '<option value=""[^<]*</option>', '<option value="">全部弹窗</option>', 1)
  $lines[1128] = $headPart + $tailPart; Write-Output "  ok L1129 (modal option)"
} else { Write-Output "  WARN modal anchor missing" }
Apply 1128 [regex]::Escape('鍏ㄩ儴 Loading')                     '全部 Loading'
Apply 1128 '\{\{ row\.id \}\}.''[^'']*''"'                      '{{ row.id }}；提交数据时，可用 {{ value }} / {{ row.name }}''"'
Apply 1128 '值或 JSON / [^"@]*@input'                            '值或 JSON / 模板" @input'
Apply 1128 ':size="13[^<>]*>[^<]*</button>'                    ':size="13" />添加动作</button>'
Apply 1134 '<span>.*</span></div>'                             '<span>动作按从上到下执行；行点击事件中可使用 {{ row.field }}，表单字段可使用 {{ form.field }}</span></div>'
Apply 1140 '/>[^<]*</button><button @click="state.toggleSelectedLocked"'        '/>置顶</button><button @click="state.toggleSelectedLocked"'
Apply 1149 '<span>[^<]*</span><AppIcon name="settings"'         '<span>页面属性</span><AppIcon name="settings"'
Apply 1149 [regex]::Escape('}}×脳 {{')                           '}} × {{'
Apply 1197 '<span>[^<]*</span><div class="color-control"><input :value="designColorValue(''canvas'')"' '<span>画布色</span><div class="color-control"><input :value="designColorValue(''canvas'')"'
Apply 1200 '<span>琛ㄩ潰鑹</span>'                               '<span>表面色</span>'
Apply 1200 '<span>[^<]*</span><div class="color-control"><input :value="designColorValue(''text'')"' '<span>文字色</span><div class="color-control"><input :value="designColorValue(''text'')"'
Apply 1206 '<small class="field-help">[^<]*</small>'           '<small class="field-help">主题和 Token 保存在当前本地项目中，不依赖云同步。</small>'
Apply 1212 '<span v-if="[^>]*>[^<]*</span><span v-else>[^<]*</span>' '<span v-if="state.currentProject.entryPageId === state.currentPage?.id">当前入口</span><span v-else>设为入口</span>'
Apply 1212 '<p>.*</p></div></div><div class="page-danger-zone">' '<p>在画布中选择组件，编辑 content、style、data 和 interaction。Shift 可多选，Delete 删除，Ctrl/Cmd+C/V 复制粘贴</p></div></div><div class="page-danger-zone">'

[System.IO.File]::WriteAllLines($path, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "saved."
