from pathlib import Path
p=Path('src/composables/useDesigner.ts')
s=p.read_text(encoding='utf-8')
start=s.index("  /** Return the local content box used by both editor and runtime. */")
end=s.index("  function addWidget", start)
s=s[:start]+s[end:]
s=s.replace('panelWidthLimits(', 'designerPanelWidthLimits(', 2)
s=s.replace('savePanelWidth(', 'saveDesignerPanelWidth(', 2)
p.write_text(s,encoding='utf-8')