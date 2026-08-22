const UI_WIDTH = 720;
const UI_HEIGHT = 640;

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, themeColors: true });

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorToHex(paint) {
  if (!paint || paint.type !== 'SOLID' || paint.visible === false) return undefined;
  const channel = value => Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, '0');
  const color = paint.color || { r: 0, g: 0, b: 0 };
  const alpha = paint.opacity === undefined ? 1 : paint.opacity;
  const suffix = alpha < 0.999 ? channel(alpha) : '';
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}${suffix}`;
}

function firstSolidPaint(paints) {
  if (!Array.isArray(paints)) return undefined;
  return paints.map(colorToHex).find(Boolean);
}

function mapTextAlign(value) {
  if (value === 'CENTER') return 'center';
  if (value === 'RIGHT') return 'right';
  return 'left';
}

function mapFontWeight(style) {
  const name = String(style || '').toLowerCase();
  if (name.includes('black')) return 900;
  if (name.includes('extra bold') || name.includes('extrabold')) return 800;
  if (name.includes('bold')) return 700;
  if (name.includes('semi') || name.includes('demi')) return 600;
  if (name.includes('medium')) return 500;
  if (name.includes('light')) return 300;
  if (name.includes('thin')) return 200;
  return 400;
}

function mapNode(node) {
  const typeMap = {
    FRAME: 'frame',
    COMPONENT: 'component',
    COMPONENT_SET: 'component',
    INSTANCE: 'instance',
    GROUP: 'group',
    SECTION: 'section',
    RECTANGLE: 'rectangle',
    ELLIPSE: 'ellipse',
    LINE: 'line',
    TEXT: 'text',
    IMAGE: 'image',
  };
  const result = {
    id: String(node.id),
    name: String(node.name || node.type).slice(0, 240),
    type: typeMap[node.type] || 'unknown',
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    width: Number(node.width) || 1,
    height: Number(node.height) || 1,
    rotation: Number(node.rotation) || 0,
    visible: node.visible !== false,
    locked: node.locked === true,
    opacity: node.opacity === undefined ? 1 : clamp(Number(node.opacity) || 0, 0, 1),
  };

  const fill = firstSolidPaint(node.fills);
  const stroke = firstSolidPaint(node.strokes);
  if (fill) result.fills = [fill];
  if (stroke) result.strokes = [stroke];
  if (typeof node.cornerRadius === 'number') result.cornerRadius = Math.max(0, node.cornerRadius);

  if (node.type === 'TEXT') {
    const fontName = node.fontName && node.fontName !== figma.mixed ? node.fontName : undefined;
    result.text = {
      characters: String(node.characters || '').slice(0, 20000),
      fontSize: typeof node.fontSize === 'number' ? node.fontSize : undefined,
      fontFamily: fontName && fontName.family ? String(fontName.family).slice(0, 200) : undefined,
      fontWeight: fontName && fontName.style ? mapFontWeight(fontName.style) : 400,
      textAlign: mapTextAlign(node.textAlignHorizontal),
    };
  }

  if ('children' in node && Array.isArray(node.children)) {
    result.children = node.children.map(mapNode);
  }
  return result;
}

function makeDocument() {
  const selection = figma.currentPage.selection;
  if (!selection.length) throw new Error('请先在 Figma 画布中选择至少一个节点');
  const nodes = selection.map(mapNode);
  return {
    format: 'codeless-design',
    schemaVersion: 1,
    source: {
      kind: 'figma-plugin',
      name: 'Codeless Figma Local Bridge',
      version: '1.0.0',
    },
    exportedAt: new Date().toISOString(),
    name: selection.length === 1 ? String(selection[0].name || 'Figma Selection') : 'Figma Selection',
    canvas: {
      width: Math.max(1, Math.round(figma.currentPage.width || 960)),
      height: Math.max(1, Math.round(figma.currentPage.height || 720)),
      background: '#f7f8fb',
    },
    nodes,
  };
}

function sendSelection() {
  try {
    figma.ui.postMessage({ type: 'design-document', document: makeDocument() });
  } catch (error) {
    figma.ui.postMessage({ type: 'bridge-error', message: error && error.message ? error.message : '读取 Figma 选区失败' });
  }
}

figma.ui.onmessage = message => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'export-selection') sendSelection();
  if (message.type === 'close') figma.closePlugin();
};

sendSelection();
