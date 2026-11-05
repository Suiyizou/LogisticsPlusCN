// Adapted from the local shipping-tracking task-network.js topology renderer.
// This module renders supplied data only; it never contacts the execution queue.
import { carrierIdentity } from "../../components/brand/carrierIdentity.js";
import { stateOf, taskStateColors as COLORS, taskStatusForGroup as groupState } from "./shipmentTaskNetworkModel.js";

const CARD = {
  batch: {width:112,height:54},
  carrier: {width:106,height:40},
  task: {width:144,height:34},
  output: {width:112,height:54},
};
const ROW_STEP = 42;
const COLUMN_STEP = 156;
const PAD = 16;
const LABEL_FONT = "'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif";
const REFERENCE_FONT = "Consolas,'SFMono-Regular',monospace";
let textContext;

const NS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes = {}, text) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function point(radius, angle) { return {x:Math.cos(angle) * radius, y:Math.sin(angle) * radius}; }

function textWidth(value,size,mono = false) {
  textContext ||= document.createElement('canvas').getContext('2d');
  const weight = size === 10 ? 500 : mono ? 600 : 650;
  textContext.font = `${weight} ${size}px ${mono ? REFERENCE_FONT : LABEL_FONT}`;
  return textContext.measureText(String(value)).width;
}

function compactText(value,maxWidth,size,mono = false) {
  const text = String(value);
  if (textWidth(text,size,mono) <= maxWidth) return text;
  const characters = [...text];
  for (let count = characters.length - 1; count > 1; count--) {
    const tail = mono ? Math.ceil(count * .55) : 0;
    const first = characters.slice(0,count - tail).join('');
    const last = tail ? characters.slice(-tail).join('') : '';
    const shortened = first + '…' + last;
    if (textWidth(shortened,size,mono) <= maxWidth) return shortened;
  }
  return '…';
}

export class TaskNetwork {
  constructor(container, {onSelect, onHover, copy, carrierLabel, statusLabel} = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.copy = copy;
    this.carrierLabel = carrierLabel;
    this.statusLabel = statusLabel;
    this.onHover = onHover;
    this.nodes = new Map();
    this.edges = new Map();
    this.job = null;
    this.options = {layout:'neural',filter:'all',search:''};
    this.signature = '';
    this.view = {x:0,y:0,scale:1};
    this.size = {width:container.clientWidth || 900,height:container.clientHeight || 620};
    this.flashTimers = new Set();
    container.classList.add('task-network');
    this.style = document.createElement('style');
    this.style.textContent = `
      .task-network{position:relative;isolation:isolate;min-height:240px;overflow:hidden;touch-action:pan-y;}
      .task-network svg.net-canvas{width:100%;height:100%;display:block;outline:none;cursor:grab;user-select:none;}
      .task-network svg.net-canvas.dragging{cursor:grabbing;}
      .task-network svg.net-canvas.zoomed{touch-action:none;}
      /* Keep pan and zoom immediate under the site's reduced-motion rule. */
      .task-network svg.net-canvas > g{transition:none!important;}
      .task-network .net-guide{fill:none;stroke:#89a7c3;stroke-opacity:.26;stroke-dasharray:3 7;pointer-events:none;}
      .task-network .net-wire,.task-network .net-flow{fill:none;pointer-events:none;stroke-linecap:round;stroke-linejoin:round;}
      .task-network .net-wire{stroke:#7396b8;stroke-width:1.2;opacity:var(--wire-opacity,.31);}
      .task-network .net-flow{stroke:#0284c7;stroke-width:1.55;stroke-dasharray:3 14;opacity:0;}
      .task-network .net-edge.returned .net-wire{stroke:var(--node-color);opacity:.32;}
      .task-network .net-edge.connected .net-wire{stroke:#4084b8;opacity:.64;}
      .task-network .net-edge.active .net-wire{stroke:#0284c7;opacity:.56;}
      .task-network .net-edge.active .net-flow{opacity:.92;animation:net-flow 1.8s linear infinite;}
      .task-network .net-edge.dim{opacity:.18;}
      .task-network .net-node{cursor:pointer;outline:none;transition:opacity .16s;}
      .task-network .net-node.dim{opacity:.22;}
      .task-network .net-node.dim:hover,.task-network .net-node.dim:focus-visible,.task-network .net-node.selected{opacity:1;}
      .task-network .net-node text{font-family:${LABEL_FONT};pointer-events:none;}
      .task-network .node-hit{fill:transparent;pointer-events:all;}
      .task-network .node-shadow{fill:#4c7393;opacity:.075;pointer-events:none;}
      .task-network .node-body{fill:#fff;stroke:#bcd0e2;stroke-width:1.1;}
      .task-network .net-batch .node-body,.task-network .net-output .node-body{fill:#f6fbff;stroke:#8fb3d0;}
      .task-network .node-dot{fill:var(--node-color);pointer-events:none;}
      .task-network .node-brand-bg{fill:#f3f7fc;stroke:#e3edf5;stroke-width:1;}
      .task-network .node-brand{pointer-events:none;}
      .task-network .net-node .node-monogram{fill:#47627d;font-size:9px;font-weight:700;}
      .task-network .net-node .node-label{fill:#26384c;font-size:12px;font-weight:650;}
      .task-network .net-task .node-label{font-family:${REFERENCE_FONT};font-weight:600;}
      .task-network .net-node .node-meta{fill:#516780;font-size:10px;font-weight:500;}
      .task-network .net-node.active .node-body{stroke:var(--node-color);stroke-width:1.5;}
      .task-network .net-node:hover .node-body{stroke:#3d85b9;stroke-width:1.5;}
      .task-network .net-node.selected .node-body,.task-network .net-node:focus-visible .node-body{stroke:#0b659d;stroke-width:2;fill:#eff8ff;}
      .task-network .net-node.just-done .node-body{animation:net-return .85s ease-out;}
      .task-network .net-edge.just-returned .net-wire{animation:net-result 1.2s ease-out;}
      .task-network .net-round .node-label,.task-network .net-round .node-meta{paint-order:stroke;stroke:#f8fafc;stroke-width:3px;stroke-linejoin:round;}
      .task-network .net-round:hover .node-label,.task-network .net-round.selected .node-label,.task-network .net-round:focus-visible .node-label{visibility:visible!important;}
      .task-network .net-layer-title{font:650 12px 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;fill:#274663;}
      .task-network .net-layer-caption,.task-network .net-group-label{font:600 10px 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;fill:#55738d;}
      .task-network .net-layer-title,.task-network .net-layer-caption,.task-network .net-group-label{paint-order:stroke;stroke:#f7fafc;stroke-width:3px;stroke-linejoin:round;}
      .task-network .net-stage-line{stroke:#adc5d9;stroke-width:1;stroke-opacity:.65;}
      .task-network .net-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#64748b;font:12px 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;pointer-events:none;}
      .task-network .net-empty strong{font-size:16px;font-weight:500;color:#334155;}
      .task-network .net-empty[hidden]{display:none;}
      @keyframes net-flow{to{stroke-dashoffset:-34;}}
      @keyframes net-return{from{fill:#dceff9;}}
      @keyframes net-result{from{opacity:.9;stroke-width:2;}}
      .task-network.net-paused *{animation-play-state:paused!important;}
      @media(prefers-reduced-motion:reduce){
        .task-network .net-node{transition:none!important;}
        .task-network .net-edge.active .net-flow{opacity:0;}
        .task-network .net-edge.active .net-flow,.task-network .net-node.just-done .node-body,.task-network .net-edge.just-returned .net-wire{animation:none!important;}
      }
    `;
    this.svg = svgElement('svg', {class:'net-canvas',role:'group','aria-label':this.copy('graphLabel')});
    this.world = svgElement('g');
    this.guides = svgElement('g', {'aria-hidden':'true'});
    this.links = svgElement('g', {'aria-hidden':'true'});
    this.captions = svgElement('g', {'aria-hidden':'true'});
    this.vertices = svgElement('g');
    this.world.append(this.guides,this.links,this.captions,this.vertices);
    this.svg.append(this.world);
    this.empty = document.createElement('div');
    this.empty.className = 'net-empty';
    this.emptyTitle = document.createElement('strong');
    this.emptyHint = document.createElement('span');
    this.empty.append(this.emptyTitle,this.emptyHint);
    container.append(this.style,this.svg,this.empty);
    this.bindInteractions();
    this.resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      if (rect.width < 10 || rect.height < 10) return;
      if (Math.abs(this.size.width - rect.width) < .5 && Math.abs(this.size.height - rect.height) < .5 && this.svg.hasAttribute('viewBox')) return;
      this.size = {width:rect.width,height:rect.height};
      this.svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
      this.layout();
      this.fit();
    });
    this.resizeObserver.observe(container);
  }

  bindInteractions() {
    this.svg.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      this.zoomBy(Math.exp(-event.deltaY * .0015),{x:event.clientX - rect.left,y:event.clientY - rect.top});
    },{passive:false});
    this.svg.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.drag = {id:event.pointerId,x:event.clientX,y:event.clientY,viewX:this.view.x,viewY:this.view.y,moved:false};
      this.svg.setPointerCapture(event.pointerId);
    });
    this.svg.addEventListener('pointermove', event => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      if (!this.drag.moved) return;
      this.svg.classList.add('dragging');
      this.viewIsFitted = false;
      this.view.x = this.drag.viewX + dx;
      this.view.y = this.drag.viewY + dy;
      this.applyView(false);
    });
    this.svg.addEventListener('pointerup', event => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const moved = this.drag.moved;
      this.drag = null;
      this.svg.classList.remove('dragging');
      this.svg.releasePointerCapture(event.pointerId);
      if (!moved) {
        const hit = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-key]');
        if (hit && this.svg.contains(hit)) this.select(hit.dataset.key);
      }
    });
    this.svg.addEventListener('pointercancel',() => { this.drag = null; this.svg.classList.remove('dragging'); });
    this.svg.addEventListener('keydown', event => {
      const hit = event.target.closest('[data-key]');
      if (hit && ['Enter',' '].includes(event.key)) { event.preventDefault(); this.focus(hit.dataset.key); }
    });
    this.svg.addEventListener('pointerover', event => {
      const node = this.nodes.get(event.target.closest('[data-key]')?.dataset.key);
      if (node && this.onHover) this.onHover(this.selection(node));
    });
  }

  selection(node) { return {kind:node.kind,key:node.key,carrier:node.carrier,index:node.index}; }

  select(key) {
    const node = this.nodes.get(key);
    if (!node) return;
    this.options.selectedKey = key;
    this.paint();
    this.onSelect?.(this.selection(node));
  }

  update(job, options = {}) {
    this.job = job;
    this.options = {...this.options,...options};
    this.svg.setAttribute('aria-label',this.copy('graphLabel'));
    this.emptyTitle.textContent = this.copy(job ? 'noNodes' : 'emptyGraph');
    this.emptyHint.textContent = this.copy(job ? 'noNodesHint' : 'emptyGraphHint');
    this.empty.hidden = !!job?.items?.length;
    const signature = JSON.stringify([job?.id,this.options.locale,this.options.layout,(job?.items || []).map(item => [item.carrier,item.reference])]);
    this.container.classList.toggle('neural',this.options.layout === 'neural');
    const topologyChanged = signature !== this.signature;
    const states = (job?.items || []).map(item => stateOf(item.status)).join('|');
    const layoutChanged = topologyChanged || this.options.layout === 'status' && this.previousStates !== states;
    if (topologyChanged) {
      this.signature = signature;
      this.build();
    }
    if (layoutChanged) this.layout();
    this.previousStates = states;
    this.paint();
    if (topologyChanged || layoutChanged && this.viewIsFitted) this.fit();
  }

  build() {
    this.nodes.clear();
    this.edges.clear();
    this.vertices.replaceChildren();
    this.links.replaceChildren();
    this.groups = [];
    if (!this.job?.items?.length) return;
    const grouped = new Map();
    this.job.items.forEach((item,index) => {
      const carrier = item.carrier || 'UNKNOWN';
      if (!grouped.has(carrier)) grouped.set(carrier,{carrier,indices:[]});
      grouped.get(carrier).indices.push(index);
    });
    this.groups = [...grouped.values()];
    const neural = this.options.layout === 'neural';
    this.addNode({key:'batch',kind:'batch',label:this.copy('batchNode')});
    for (const group of this.groups) {
      const key = 'carrier:' + group.carrier;
      this.addNode({key,kind:'carrier',carrier:group.carrier,label:this.carrierLabel(group.carrier),indices:group.indices});
      this.addEdge('batch',key);
      for (const index of group.indices) {
        const item = this.job.items[index];
        const childKey = 'task:' + index;
        this.addNode({key:childKey,kind:'task',carrier:group.carrier,index,label:item.reference || this.copy('noReference')});
        this.addEdge(key,childKey);
      }
    }
    if (neural) {
      this.addNode({key:'output:snapshot',kind:'output',label:this.copy('outputNode')});
      this.job.items.forEach((item,index) => this.addEdge('task:' + index,'output:snapshot','result:' + index));
    }
  }

  addNode(node) {
    const round = this.options.layout === 'forest' && ['carrier','task'].includes(node.kind);
    const radius = node.kind === 'carrier' ? 19 : 6;
    const width = round ? radius * 2 : CARD[node.kind].width;
    const height = round ? width : CARD[node.kind].height;
    const box = {x:-width / 2,y:-height / 2,width,height,rx:node.kind === 'task' ? 7 : 10};
    const element = svgElement('g',{class:'net-node net-' + node.kind + (round ? ' net-round' : ''),'data-key':node.key,tabindex:'0',role:'button'});
    const hit = svgElement('rect',{class:'node-hit',...box,'aria-hidden':'true'});
    const shadow = round ? svgElement('circle',{class:'node-shadow',r:radius,cy:2})
      : svgElement('rect',{class:'node-shadow',...box,y:box.y + 2});
    const body = round ? svgElement('circle',{class:'node-body',r:radius}) : svgElement('rect',{class:'node-body',...box});
    const label = svgElement('text',{class:'node-label','dominant-baseline':'middle'});
    const meta = svgElement('text',{class:'node-meta','dominant-baseline':'middle'});
    const title = svgElement('title');
    element.append(title,hit,shadow,body);
    if (node.kind === 'carrier') {
      const badgeX = round ? 0 : -34;
      const identity = carrierIdentity(node.carrier);
      element.append(svgElement('rect',{class:'node-brand-bg',x:badgeX - 13,y:-13,width:26,height:26,rx:6}));
      if (identity.logo) {
        element.append(svgElement('image',{class:'node-brand',x:badgeX - 10,y:-10,width:20,height:20,href:identity.logo,preserveAspectRatio:'xMidYMid meet'}));
      } else {
        const initials = [...String(node.label || identity.code)].slice(0,2).join('').toUpperCase();
        element.append(svgElement('text',{class:'node-monogram',x:badgeX,y:0,'dominant-baseline':'middle','text-anchor':'middle'},initials));
      }
      element.append(svgElement('circle',{class:'node-dot',cx:round ? 14 : -23,cy:10,r:3.3}));
    } else if (node.kind === 'task') {
      element.append(svgElement('circle',{class:'node-dot',cx:round ? 0 : -59,r:round ? 2.8 : 3.5}));
    } else {
      element.append(svgElement('circle',{class:'node-dot',cx:width / 2 - 10,cy:-height / 2 + 10,r:3}));
    }
    element.append(label,meta);
    this.vertices.append(element);
    Object.assign(node,{
      element,hitElement:hit,labelElement:label,metaElement:meta,titleElement:title,
      round,width,height,x:0,y:0,
      anchor:node.kind === 'task' || node.kind === 'carrier' && !round ? 'start' : 'middle',
      labelX:node.kind === 'task' ? -49 : node.kind === 'carrier' && !round ? -15 : 0,
      labelY:node.kind === 'task' ? 0 : round ? 31 : -7,
      metaY:round ? 45 : 9,
    });
    this.nodes.set(node.key,node);
  }

  addEdge(from,to,key = to) {
    const element = svgElement('g',{class:'net-edge','data-from':from,'data-to':to});
    const wire = svgElement('path',{class:'net-wire'});
    const flow = svgElement('path',{class:'net-flow'});
    element.append(wire,flow);
    this.links.append(element);
    this.edges.set(key,{element,from,to,wire,flow});
  }

  layout() {
    this.guides.replaceChildren();
    this.captions.replaceChildren();
    this.layoutBounds = null;
    this.taskGrid = null;
    if (!this.nodes.size) return;
    this.vertical = this.options.layout !== 'forest' && this.size.width < 600;
    this.svg.style.setProperty('--wire-opacity',this.vertical && this.job.items.length > 24 ? '.11' : '.31');
    if (this.options.layout === 'status') this.statusLayout();
    else if (this.options.layout === 'forest') this.forestLayout();
    else this.layeredLayout(this.options.layout === 'neural');
    for (const node of this.nodes.values()) {
      node.element.setAttribute('transform',`translate(${node.x} ${node.y})`);
      for (const [label,y] of [[node.labelElement,node.labelY],[node.metaElement,node.metaY]]) {
        label.setAttribute('x',node.labelX);
        label.setAttribute('y',y);
        label.setAttribute('text-anchor',node.anchor);
      }
    }
    for (const edge of this.edges.values()) {
      const curve = this.edgePath(this.nodes.get(edge.from),this.nodes.get(edge.to));
      edge.wire.setAttribute('d',curve);
      edge.flow.setAttribute('d',curve);
    }
  }

  edgePath(from,to) {
    if (this.options.layout === 'forest') {
      const ratio = from.kind === 'batch' ? .55 : .72;
      return `M ${from.x} ${from.y} C ${from.x * 1.35} ${from.y * 1.35} ${to.x * ratio} ${to.y * ratio} ${to.x} ${to.y}`;
    }
    if (this.vertical) {
      const start = from.y + from.height / 2;
      const end = to.y - to.height / 2;
      const grid = this.taskGrid;
      if (grid && to.kind === 'task' && to.row > 0) {
        const laneY = grid.top - 7;
        const target = to.x - to.width / 2;
        const middle = (start + laneY) / 2;
        return `M ${from.x} ${start} C ${from.x} ${middle} ${target - 4} ${middle} ${target - 4} ${laneY} V ${to.y - 4} Q ${target - 4} ${to.y} ${target} ${to.y}`;
      }
      if (grid && from.kind === 'task' && from.row < grid.rows - 1) {
        const laneY = grid.bottom + 7;
        const target = from.x + from.width / 2;
        const middle = (laneY + end) / 2;
        return `M ${target} ${from.y} Q ${target + 4} ${from.y} ${target + 4} ${from.y + 4} V ${laneY} C ${target + 4} ${middle} ${to.x} ${middle} ${to.x} ${end}`;
      }
      const middle = (start + end) / 2;
      return `M ${from.x} ${start} C ${from.x} ${middle} ${to.x} ${middle} ${to.x} ${end}`;
    }
    const start = from.x + from.width / 2;
    const end = to.x - to.width / 2;
    if (to.kind === 'task' && to.column > 0) {
      const lane = this.taskGrid.left - 8;
      const middle = (start + lane) / 2;
      const target = to.y - to.height / 2;
      return `M ${start} ${from.y} C ${middle} ${from.y} ${middle} ${target - 4} ${lane} ${target - 4} H ${to.x - 4} Q ${to.x} ${target - 4} ${to.x} ${target}`;
    }
    if (from.kind === 'task' && from.column < this.taskGrid.columns - 1) {
      const lane = this.taskGrid.right + 8;
      const middle = (lane + end) / 2;
      const target = from.y + from.height / 2;
      return `M ${from.x} ${target} Q ${from.x} ${target + 4} ${from.x + 4} ${target + 4} H ${lane} C ${middle} ${target + 4} ${middle} ${to.y} ${end} ${to.y}`;
    }
    const middle = (start + end) / 2;
    return `M ${start} ${from.y} C ${middle} ${from.y} ${middle} ${to.y} ${end} ${to.y}`;
  }

  chooseColumns(count,measure) {
    let best = 1;
    let bestScale = 0;
    for (let columns = 1; columns <= Math.min(count,4); columns++) {
      const {width,height} = measure(columns);
      const scale = this.scaleFor(width,height);
      if (scale <= bestScale) continue;
      best = columns;
      bestScale = scale;
    }
    return best;
  }

  scaleFor(width,height) {
    const pad = Math.min(PAD,this.size.width / 5,this.size.height / 5);
    return Math.min((this.size.width - pad * 2) / width,(this.size.height - pad * 2) / height,1.08);
  }

  extendBounds(left,top,right,bottom) {
    const previous = this.layoutBounds;
    this.layoutBounds = previous ? {
      left:Math.min(left,previous.left),top:Math.min(top,previous.top),
      right:Math.max(right,previous.right),bottom:Math.max(bottom,previous.bottom),
    } : {left,top,right,bottom};
  }

  stage(x,y,title,caption,width) {
    this.captions.append(svgElement('text',{class:'net-layer-title',x,y,'text-anchor':'middle'},title));
    if (caption) {
      this.captions.append(svgElement('text',{class:'net-layer-caption',x,y:y + 15,'text-anchor':'middle'},caption));
    }
    const lineY = y + (this.vertical ? 8 : 23);
    this.guides.append(svgElement('line',{class:'net-stage-line',x1:x - width / 2,x2:x + width / 2,y1:lineY,y2:lineY}));
    this.extendBounds(x - width / 2,y - 13,x + width / 2,lineY);
  }

  placeTasks(indices,left,top,columns) {
    indices.forEach((index,offset) => {
      const column = offset % columns;
      Object.assign(this.nodes.get('task:' + index),{
        x:left + CARD.task.width / 2 + column * COLUMN_STEP,
        y:top + CARD.task.height / 2 + Math.floor(offset / columns) * ROW_STEP,
        column,row:Math.floor(offset / columns),
      });
    });
  }

  mobileHead(width,columns,layered) {
    const center = width / 2;
    const carriers = this.groups.length;
    const carrierColumns = Math.min(columns,carriers);
    const carrierStep = CARD.carrier.width + 12;
    const batch = this.nodes.get('batch');
    Object.assign(batch,{x:center,y:22 + batch.height / 2});
    this.stage(center,0,this.copy(layered ? 'layerInput' : 'batchNode'),null,90);
    const headerY = 22 + batch.height + 29;
    this.stage(center,headerY,this.copy(layered ? 'layerRouting' : 'carrier'),null,90);
    this.groups.forEach((group,index) => {
      const row = Math.floor(index / carrierColumns);
      const rowCount = Math.min(carrierColumns,carriers - row * carrierColumns);
      const node = this.nodes.get('carrier:' + group.carrier);
      Object.assign(node,{
        x:center + (index % carrierColumns - (rowCount - 1) / 2) * carrierStep,
        y:headerY + 22 + node.height / 2 + row * 48,
      });
    });
    return headerY + 22 + CARD.carrier.height + (Math.ceil(carriers / carrierColumns) - 1) * 48 + 30;
  }

  layeredLayout(output) {
    const count = this.job.items.length;
    const indices = this.groups.flatMap(group => group.indices);
    const carrierX = CARD.batch.width + 44 + CARD.carrier.width / 2;
    const taskLeft = carrierX + CARD.carrier.width / 2 + 44;
    const carrierHeight = (this.groups.length - 1) * 48 + CARD.carrier.height;
    const gridWidth = columns => (columns - 1) * COLUMN_STEP + CARD.task.width;
    const gridHeight = columns => (Math.ceil(count / columns) - 1) * ROW_STEP + CARD.task.height;
    const columns = this.chooseColumns(count,columns => this.vertical ? {
      width:gridWidth(columns),
      height:202 + (Math.ceil(this.groups.length / columns) - 1) * 48 + gridHeight(columns) + (output ? 106 : 0),
    } : {
      width:taskLeft + gridWidth(columns) + (output ? 48 + CARD.output.width : 0),
      height:52 + Math.max(gridHeight(columns),carrierHeight,CARD.batch.height),
    });
    const width = gridWidth(columns);
    const height = gridHeight(columns);
    const outputNode = this.nodes.get('output:snapshot');
    if (this.vertical) {
      const headerY = this.mobileHead(width,columns,output);
      this.stage(width / 2,headerY,this.copy('layerExecution'),null,90);
      this.placeTasks(indices,0,headerY + 22,columns);
      this.taskGrid = {top:headerY + 22,bottom:headerY + 22 + height,rows:Math.ceil(count / columns)};
      if (outputNode) {
        const outputY = headerY + 22 + height + 30;
        this.stage(width / 2,outputY,this.copy('layerOutput'),null,90);
        Object.assign(outputNode,{x:width / 2,y:outputY + 22 + outputNode.height / 2});
      }
      return;
    }
    const frameHeight = Math.max(height,carrierHeight,CARD.batch.height);
    const center = 50 + frameHeight / 2;
    const batch = this.nodes.get('batch');
    Object.assign(batch,{x:batch.width / 2,y:center});
    this.placeTasks(indices,taskLeft,center - height / 2,columns);
    const carriers = this.groups.map(group => {
      const node = this.nodes.get('carrier:' + group.carrier);
      const average = group.indices.reduce((sum,index) => sum + this.nodes.get('task:' + index).y,0) / group.indices.length;
      return {node,average};
    });
    let previousY = 50 - 48 + CARD.carrier.height / 2;
    carriers.forEach(({node,average},index) => {
      const lastAvailable = 50 + frameHeight - CARD.carrier.height / 2 - (carriers.length - index - 1) * 48;
      const y = Math.max(previousY + 48,Math.min(average,lastAvailable));
      Object.assign(node,{x:carrierX,y});
      previousY = y;
    });
    this.taskGrid = {left:taskLeft,right:taskLeft + width,columns};
    this.stage(batch.x,12,this.copy(output ? 'layerInput' : 'batchNode'),this.copy('rowCount',{count}),batch.width);
    this.stage(carrierX,12,this.copy(output ? 'layerRouting' : 'carrier'),this.copy('carrierCount',{count:this.groups.length}),CARD.carrier.width);
    this.stage(taskLeft + width / 2,12,this.copy('layerExecution'),this.copy('rowCount',{count}),width);
    if (outputNode) {
      Object.assign(outputNode,{x:taskLeft + width + 48 + outputNode.width / 2,y:center});
      this.stage(outputNode.x,12,this.copy('layerOutput'),null,outputNode.width);
    }
  }

  forestLayout() {
    const count = this.job.items.length;
    const carrierRadius = this.groups.length > 8 ? 148 : count > 6 ? 124 : 104;
    const leafRadius = carrierRadius + (count > 24 ? 120 : 85);
    const totalWeight = this.groups.reduce((sum,group) => sum + Math.sqrt(group.indices.length) + 1,0);
    let angle = -Math.PI / 2 - Math.PI / this.groups.length;
    for (const radius of [carrierRadius,leafRadius]) this.guides.append(svgElement('circle',{class:'net-guide',r:radius}));
    for (const group of this.groups) {
      const sweep = (Math.sqrt(group.indices.length) + 1) / totalWeight * Math.PI * 2;
      const center = angle + sweep / 2;
      const ship = this.nodes.get('carrier:' + group.carrier);
      Object.assign(ship,point(carrierRadius,center));
      const capacity = Math.max(3,Math.floor(sweep * leafRadius / 37));
      group.indices.forEach((index,offset) => {
        const row = Math.floor(offset / capacity);
        const rowCount = Math.min(capacity,group.indices.length - row * capacity);
        const column = offset % capacity;
        const fan = Math.min(sweep * .82,rowCount * .15);
        const leafAngle = center + (column - (rowCount - 1) / 2) * (rowCount > 1 ? fan / (rowCount - 1) : 0);
        const radius = leafRadius + row * 48;
        const node = this.nodes.get('task:' + index);
        const labelRight = Math.cos(leafAngle) >= 0;
        Object.assign(node,point(radius,leafAngle),{anchor:labelRight ? 'start' : 'end',labelX:labelRight ? 12 : -12});
      });
      angle += sweep;
    }
  }

  statusLayout() {
    const buckets = new Map(Object.keys(COLORS).map(state => [state,[]]));
    this.job.items.forEach((item,index) => buckets.get(stateOf(item.status)).push(index));
    const visible = [...buckets].filter(([,indices]) => indices.length);
    const carrierX = CARD.batch.width + 36 + CARD.carrier.width / 2;
    const taskLeft = carrierX + CARD.carrier.width / 2 + 36;
    const boxHeight = (count,columns) => (Math.ceil(count / columns) - 1) * ROW_STEP + 76;
    const totalHeight = columns => visible.reduce((sum,[,indices]) => sum + boxHeight(indices.length,columns) + 10,0) - 10;
    const columns = this.chooseColumns(Math.max(...visible.map(([,indices]) => indices.length)),columns => {
      const width = (columns - 1) * COLUMN_STEP + CARD.task.width + 24;
      return this.vertical ? {
        width,height:180 + (Math.ceil(this.groups.length / columns) - 1) * 48 + totalHeight(columns),
      } : {
        width:taskLeft + width,height:Math.max(totalHeight(columns),this.groups.length * 48),
      };
    });
    const boxWidth = (columns - 1) * COLUMN_STEP + CARD.task.width + 24;
    let top = 0;
    let boxLeft = taskLeft;
    if (this.vertical) {
      top = this.mobileHead(boxWidth,columns,false);
      boxLeft = 0;
    } else {
      const height = totalHeight(columns);
      const batch = this.nodes.get('batch');
      Object.assign(batch,{x:batch.width / 2,y:height / 2});
      this.groups.forEach((group,index) => Object.assign(this.nodes.get('carrier:' + group.carrier),{
        x:carrierX,y:height / 2 + (index - (this.groups.length - 1) / 2) * 48,
      }));
      this.taskGrid = {left:boxLeft + 12,right:boxLeft + boxWidth - 12,columns};
    }
    for (const [state,indices] of visible) {
      const height = boxHeight(indices.length,columns);
      this.guides.append(
        svgElement('rect',{x:boxLeft,y:top,width:boxWidth,height,rx:10,fill:COLORS[state],'fill-opacity':'.045',stroke:COLORS[state],'stroke-opacity':'.22'}),
      );
      this.captions.append(svgElement('text',{class:'net-group-label',x:boxLeft + 12,y:top + 21},`${this.copy('state.' + state)} · ${this.copy('rowCount',{count:indices.length})}`));
      this.placeTasks(indices,boxLeft + 12,top + 32,columns);
      this.extendBounds(boxLeft,top,boxLeft + boxWidth,top + height);
      top += height + 10;
    }
  }

  paint() {
    if (!this.job?.items) return;
    const search = String(this.options.search || '').trim().toLowerCase();
    const filter = this.options.filter;
    const matched = new Set();
    const received = this.job.items.filter(item => item.resultReady).length;
    const writing = this.job.items.some(item => item.status === 'PERSISTING');
    const allSettled = this.job.items.every(item => ['SUCCEEDED','FAILED','MANUAL','PARTIAL','CANCELLED'].includes(item.status));
    const outputState = this.job.draft ? 'draft' : writing ? 'persisting' :
      allSettled ? groupState(this.job.items) : 'pending';
    for (const node of this.nodes.values()) {
      const item = node.kind === 'task' ? this.job.items[node.index] : null;
      const state = item ? stateOf(item.status) : node.kind === 'carrier' ? groupState(node.indices.map(index => this.job.items[index])) :
        node.kind === 'output' ? outputState : this.job.tone;
      const color = COLORS[state];
      node.element.style.setProperty('--node-color',color);
      node.element.classList.toggle('active',['running','persisting'].includes(state));
      node.element.classList.toggle('selected',this.options.selectedKey === node.key);
      node.element.dataset.state = state;
      if (node.lastState === 'running' && state === 'done') {
        node.element.classList.add('just-done');
        const timer = setTimeout(() => { node.element.classList.remove('just-done'); this.flashTimers.delete(timer); },900);
        this.flashTimers.add(timer);
      }
      node.lastState = state;
      if (item) {
        const matchesFilter = !filter || filter === 'all' || filter === state || filter === 'issues' && ['attention','failed','cancelled','waiting','unknown'].includes(state);
        const matchesSearch = !search || [item.reference,item.carrier,this.carrierLabel(item.carrier),item.item?.sourceRow,item.originalReference].join(' ').toLowerCase().includes(search);
        if (matchesFilter && matchesSearch) {
          matched.add(node.key);
          matched.add('carrier:' + node.carrier);
          matched.add('batch');
          matched.add('output:snapshot');
        }
        if (!node.round) node.labelElement.textContent = compactText(node.label,node.width - 34,12,true);
        node.metaElement.textContent = '';
        node.titleElement.textContent = `${this.carrierLabel(node.carrier)} · ${node.label}\n${this.statusLabel(item.status)}`;
      } else if (node.kind === 'carrier') {
        const identity = carrierIdentity(node.carrier);
        const label = node.round && this.groups.length > 6 && identity.logo ? identity.code : node.label;
        node.labelElement.textContent = compactText(label,node.round ? 92 : node.width / 2 + 8,12);
        const done = node.indices.filter(index => this.job.items[index].resultReady).length;
        node.metaElement.textContent = this.copy('groupMeta',{done,total:node.indices.length});
        node.titleElement.textContent = `${node.label} · ${this.copy('rowCount',{count:node.indices.length})} · ${this.copy('state.' + state)}`;
      } else if (node.kind === 'output') {
        node.labelElement.textContent = compactText(node.label,node.width - 14,12);
        node.metaElement.textContent = this.job.draft ? this.copy('draftCaption') : this.copy('groupMeta',{done:received,total:this.job.items.length});
        node.titleElement.textContent = `${node.label} · ${this.job.draft ? this.copy('draftCaption') : this.copy('outputCount',{count:received})}`;
        if (node.lastReceived !== undefined && received > node.lastReceived) {
          node.element.classList.add('just-done');
          const timer = setTimeout(() => { node.element.classList.remove('just-done'); this.flashTimers.delete(timer); },900);
          this.flashTimers.add(timer);
        }
        node.lastReceived = received;
      } else {
        node.labelElement.textContent = compactText(this.copy(this.job.draft ? 'draftNode' : 'batchNode'),node.width - 14,12);
        node.metaElement.textContent = this.copy('rowCount',{count:this.job.items.length});
        node.titleElement.textContent = `${this.job.label || this.job.id}\n${this.statusLabel(this.job.status)}`;
      }
      node.element.setAttribute('aria-label',node.titleElement.textContent.replace('\n',', '));
      node.element.setAttribute('aria-pressed',String(this.options.selectedKey === node.key));
    }
    for (const node of this.nodes.values()) node.element.classList.toggle('dim',!matched.has(node.key));
    for (const edge of this.edges.values()) {
      const child = this.nodes.get(edge.to);
      const selected = this.options.selectedKey;
      edge.element.classList.toggle('connected',selected !== 'batch' && (edge.to === selected || edge.from === selected));
      if (child.kind === 'output') {
        const task = this.nodes.get(edge.from);
        const item = this.job.items[task.index];
        const returned = item.resultReady;
        const active = item.status === 'PERSISTING';
        edge.element.style.setProperty('--node-color',COLORS[active ? 'persisting' : returned ? task.lastState : this.job.draft ? 'draft' : 'pending']);
        edge.element.classList.toggle('active',active);
        edge.element.classList.toggle('returned',returned);
        edge.element.classList.toggle('dim',!matched.has(task.key));
        if (edge.lastReturned === false && returned) {
          edge.element.classList.add('just-returned');
          const timer = setTimeout(() => { edge.element.classList.remove('just-returned'); this.flashTimers.delete(timer); },1200);
          this.flashTimers.add(timer);
        }
        edge.lastReturned = returned;
      } else {
        edge.element.classList.toggle('active',['running','persisting'].includes(child.lastState));
        edge.element.classList.toggle('dim',!matched.has(child.key));
      }
    }
    this.arrangeLabels();
  }

  fit() {
    if (!this.nodes.size) return;
    let {left,top,right,bottom} = this.layoutBounds || {left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
    for (const node of this.nodes.values()) {
      const box = node.round ? this.roundBounds(node,node.kind === 'task' ? this.forestTaskLabel(node,1) : undefined) : {
        left:-node.width / 2 - 2,top:-node.height / 2 - 2,right:node.width / 2 + 2,bottom:node.height / 2 + 3,
      };
      left = Math.min(left,node.x + box.left);
      top = Math.min(top,node.y + box.top);
      right = Math.max(right,node.x + box.right);
      bottom = Math.max(bottom,node.y + box.bottom);
    }
    this.fitScale = this.scaleFor(right - left,bottom - top);
    this.viewIsFitted = true;
    this.view = {
      scale:this.fitScale,
      x:this.size.width / 2 - (left + right) / 2 * this.fitScale,
      y:this.size.height / 2 - (top + bottom) / 2 * this.fitScale,
    };
    this.applyView();
  }

  applyView(updateLabels = true) {
    this.world.setAttribute('transform',`translate(${this.view.x} ${this.view.y}) scale(${this.view.scale})`);
    this.svg.dataset.zoom = this.view.scale.toFixed(2);
    this.svg.classList.toggle('zoomed',this.view.scale > this.fitScale + .01);
    if (updateLabels) this.arrangeLabels();
  }

  forestTaskLabel(node,scale) {
    return scale >= 1.3 ? node.label : compactText(node.label,this.job.items.length > 24 ? 70 : 126,12,true);
  }

  roundBounds(node,nodeLabel = node.labelElement.textContent,labelSize = 12) {
    let left = -node.width / 2 - 4;
    let right = node.width / 2 + 4;
    const top = -node.height / 2 - 4;
    let bottom = node.height / 2 + 4;
    for (const [label,y,size] of [[nodeLabel,node.labelY,labelSize],[node.metaElement.textContent,node.metaY,10]]) {
      if (!label) continue;
      const width = textWidth(label,size,node.kind === 'task');
      const x = node.labelX - (node.anchor === 'end' ? width : node.anchor === 'middle' ? width / 2 : 0);
      left = Math.min(left,x - 4);
      right = Math.max(right,x + width + 4);
      bottom = Math.max(bottom,y + size / 2 + 4);
    }
    return {left,top,right,bottom};
  }

  arrangeLabels() {
    if (this.options.layout !== 'forest') return;
    const round = [...this.nodes.values()].filter(node => node.round);
    const tasks = round.filter(node => node.kind === 'task');
    const carriers = round.filter(node => node.kind === 'carrier');
    const occupied = carriers.map(node => {
      const box = this.roundBounds(node);
      return {left:node.x + box.left,right:node.x + box.right,top:node.y + box.top,bottom:node.y + box.bottom};
    });
    tasks.sort((a,b) => Number(b.key === this.options.selectedKey) - Number(a.key === this.options.selectedKey)
      || Number(['running','persisting'].includes(b.lastState)) - Number(['running','persisting'].includes(a.lastState)));
    const labelSize = 12 / Math.sqrt(Math.max(1,this.view.scale));
    for (const node of tasks) {
      const label = node.labelElement;
      label.textContent = this.forestTaskLabel(node,this.view.scale);
      label.style.fontSize = labelSize + 'px';
      const width = textWidth(label.textContent,labelSize,true);
      const left = node.x + node.labelX - (node.anchor === 'end' ? width : 0);
      const bounds = {left,right:left + width,top:node.y - labelSize / 2,bottom:node.y + labelSize / 2};
      const priority = node.key === this.options.selectedKey || ['running','persisting'].includes(node.lastState);
      const hidden = !priority && occupied.some(box =>
        bounds.left < box.right + 3 && bounds.right + 3 > box.left && bounds.top < box.bottom + 3 && bounds.bottom + 3 > box.top);
      label.style.visibility = hidden ? 'hidden' : 'visible';
      if (!hidden && !node.element.classList.contains('dim')) occupied.push(bounds);
    }
    for (const node of round) {
      const box = this.roundBounds(node,node.labelElement.style.visibility === 'hidden' ? '' : undefined,node.kind === 'task' ? labelSize : 12);
      for (const [name,value] of Object.entries({x:box.left,y:box.top,width:box.right - box.left,height:box.bottom - box.top})) {
        node.hitElement.setAttribute(name,value);
      }
    }
  }

  zoomBy(factor,anchor = {x:this.size.width / 2,y:this.size.height / 2}) {
    const next = Math.max(Math.min(.2,(this.fitScale || .5) * .5),Math.min(4,this.view.scale * factor));
    const ratio = next / this.view.scale;
    this.view.x = anchor.x - (anchor.x - this.view.x) * ratio;
    this.view.y = anchor.y - (anchor.y - this.view.y) * ratio;
    this.view.scale = next;
    this.viewIsFitted = false;
    this.applyView();
  }

  focus(key) {
    const node = this.nodes.get(key);
    if (!node) return;
    this.view.scale = Math.max(this.fitScale || 1,1.2);
    this.viewIsFitted = false;
    this.view.x = this.size.width / 2 - node.x * this.view.scale;
    this.view.y = this.size.height / 2 - node.y * this.view.scale;
    this.applyView();
    this.select(node.key);
  }

  focusRunning() {
    const node = [...this.nodes.values()].find(candidate => candidate.kind === 'task' && ['running','persisting'].includes(candidate.lastState));
    if (node) this.focus(node.key);
  }

  destroy() {
    this.resizeObserver.disconnect();
    for (const timer of this.flashTimers) clearTimeout(timer);
    this.style.remove();
    this.svg.remove();
    this.empty.remove();
    this.container.classList.remove('task-network');
    this.container.classList.remove('neural');
  }
}
