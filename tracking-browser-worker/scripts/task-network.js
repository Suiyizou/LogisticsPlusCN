/* Browser-only task topology. Coordinates are deterministic; state comes from the queue. */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = {running:'#0369a1',done:'#16a34a',pending:'#94a3b8',attention:'#d97706',failed:'#dc2626',cancelled:'#94a3b8'};
  const LABELS = {running:'执行中',done:'已返回',pending:'等待查询',attention:'等待处理',failed:'执行异常',cancelled:'已停止'};
  const CARRIER_LABELS = {CMA_CGM:'CMA CGM',HAPAG_LLOYD:'Hapag-Lloyd',WAN_HAI:'WAN HAI',EVERGREEN:'Evergreen'};

  function svgElement(tag, attributes = {}, text) {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function stateOf(status) {
    if (status === 'running') return 'running';
    if (['done','completed','QUERY_COMPLETED'].includes(status)) return 'done';
    if (['human_required','no_business_data','matched_no_structure','completed_with_gaps'].includes(status)) return 'attention';
    if (['failed','carrier_not_implemented'].includes(status)) return 'failed';
    if (['cancelled','cancelling'].includes(status)) return 'cancelled';
    return 'pending';
  }

  function groupState(items) {
    const states = items.map(item => stateOf(item.status));
    for (const state of ['running','failed','attention','pending']) if (states.includes(state)) return state;
    return states.length && states.every(state => state === 'done') ? 'done' : 'cancelled';
  }

  function point(radius, angle) { return {x:Math.cos(angle) * radius, y:Math.sin(angle) * radius}; }
  function carrierLabel(code) { return CARRIER_LABELS[code] || code || '未识别船司'; }

  class TaskNetwork {
    constructor(container, {onSelect, onHover} = {}) {
      this.container = container;
      this.onSelect = onSelect;
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
        .task-network{position:relative;isolation:isolate;min-height:240px;overflow:hidden;touch-action:none;}
        .task-network svg.net-canvas{width:100%;height:100%;display:block;outline:none;cursor:grab;user-select:none;}
        .task-network svg.net-canvas.dragging{cursor:grabbing;}
        .task-network .net-guide{fill:none;stroke:#94a3b8;stroke-opacity:.18;stroke-dasharray:2 9;pointer-events:none;}
        .task-network .net-wire{fill:none;stroke-width:1;stroke:var(--node-color);opacity:.24;pointer-events:none;}
        .task-network .net-flow{fill:none;stroke:var(--node-color);stroke-width:1.5;stroke-dasharray:3 15;stroke-linecap:round;opacity:0;pointer-events:none;}
        .task-network .net-edge.active .net-wire{opacity:.38;stroke-width:1.3;}
        .task-network .net-edge.active .net-flow{opacity:.8;animation:net-flow 1.8s linear infinite;}
        .task-network .net-particle{fill:var(--node-color);opacity:0;pointer-events:none;}
        .task-network .net-edge.active .net-particle{opacity:1;filter:drop-shadow(0 0 5px var(--node-color));}
        .task-network .net-edge.dim{opacity:.1;}
        .task-network .net-node{cursor:pointer;outline:none;transition:opacity .2s;}
        .task-network .net-node.dim{opacity:.15;}
        .task-network .net-node text{font-family:'Fira Sans','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;pointer-events:all;}
        .task-network .node-hit{fill:transparent;pointer-events:all;}
        .task-network .net-node .node-label{fill:#334155;font-size:11px;font-weight:500;paint-order:stroke;stroke:#f8fafc;stroke-width:4px;stroke-linejoin:round;}
        .task-network .net-node .node-meta{fill:#64748b;font-size:9px;letter-spacing:.3px;paint-order:stroke;stroke:#f8fafc;stroke-width:3px;}
        .task-network .node-halo{fill:var(--node-color);opacity:.045;pointer-events:none;}
        .task-network .node-body{fill:#fff;stroke:var(--node-color);stroke-opacity:.8;stroke-width:1.2;}
        .task-network .node-dot{fill:var(--node-color);}
        .task-network .node-ring{fill:none;stroke:var(--node-color);stroke-width:1;opacity:0;pointer-events:none;}
        .task-network .net-node.active .node-ring{opacity:.55;animation:net-pulse 2.6s ease-out infinite;transform-box:fill-box;transform-origin:center;}
        .task-network .net-node.active .node-body{stroke-opacity:1;filter:drop-shadow(0 0 6px #0369a133);}
        .task-network .net-node.active .node-label{fill:#075985;}
        .task-network .net-node.selected .node-body,.task-network .net-node:focus-visible .node-body{stroke:#075985;stroke-width:2;stroke-opacity:1;}
        .task-network .net-node.selected .node-halo{opacity:.15;}
        .task-network .net-node:hover .node-label,.task-network .net-node:focus-visible .node-label{fill:#0f172a;}
        .task-network .net-node:hover .node-label,.task-network .net-node.selected .node-label,.task-network .net-node:focus-visible .node-label{visibility:visible!important;}
        .task-network .net-node:hover .node-body{stroke-opacity:1;stroke-width:2;}
        .task-network .net-node.just-done .node-halo{animation:net-return .85s ease-out;}
        .task-network .net-batch .node-label{fill:#1e293b;font-size:13px;font-weight:600;stroke-width:0;}
        .task-network .net-batch .node-meta{font-size:9px;fill:#64748b;stroke-width:0;}
        .task-network .net-carrier .node-label{font-size:11px;font-weight:600;}
        .task-network .net-output .node-label{fill:#1e293b;font-size:12px;font-weight:600;stroke-width:0;}
        .task-network .net-output .node-meta{font-size:9px;stroke-width:0;}
        .task-network .net-layer-title{font:600 12px 'Fira Sans','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;fill:#334155;letter-spacing:1.3px;}
        .task-network .net-layer-number{font:9px Consolas,monospace;fill:#0369a1;letter-spacing:2px;}
        .task-network .net-layer-caption{font:10px 'Fira Sans','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;fill:#64748b;}
        .task-network.neural .node-body{fill:#fff;}
        .task-network.neural .net-wire{stroke-opacity:.9;opacity:.24;}
        .task-network.neural .net-edge.active .net-wire{opacity:.5;}
        .task-network .net-edge.just-returned .net-wire{animation:net-result 1.2s ease-out;}
        @keyframes net-result{0%{opacity:.9;stroke-width:2;}100%{opacity:.19;stroke-width:1;}}
        .task-network .net-group-label{font:10px 'Fira Sans','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;fill:#64748b;letter-spacing:1px;}
        .task-network .net-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#64748b;font:12px 'Fira Sans','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;pointer-events:none;}
        .task-network .net-empty strong{font-size:16px;font-weight:500;color:#334155;}
        .task-network .net-empty[hidden]{display:none;}
        @keyframes net-flow{to{stroke-dashoffset:-36;}}
        @keyframes net-pulse{0%{transform:scale(.8);opacity:.6;}100%{transform:scale(1.65);opacity:0;}}
        @keyframes net-return{0%{opacity:.4;}100%{opacity:.045;}}
        @media(prefers-reduced-motion:reduce){.task-network .net-edge.active .net-flow,.task-network .net-node.active .node-ring,.task-network .net-node.just-done .node-halo{animation:none;}.task-network .net-particle{display:none;}}
      `;
      this.svg = svgElement('svg', {class:'net-canvas',role:'group','aria-label':'货踪任务网络，可拖动平移、滚轮缩放'});
      this.world = svgElement('g');
      this.guides = svgElement('g', {'aria-hidden':'true'});
      this.links = svgElement('g', {'aria-hidden':'true'});
      this.vertices = svgElement('g');
      this.world.append(this.guides,this.links,this.vertices);
      this.svg.append(this.world);
      this.empty = document.createElement('div');
      this.empty.className = 'net-empty';
      const emptyTitle = document.createElement('strong');
      emptyTitle.textContent = '等待任务进入网络';
      const emptyHint = document.createElement('span');
      emptyHint.textContent = '选择一个批次，或新建货踪查询';
      this.empty.append(emptyTitle,emptyHint);
      container.append(this.style,this.svg,this.empty);
      this.bindInteractions();
      this.resizeObserver = new ResizeObserver(entries => {
        const rect = entries[0].contentRect;
        if (rect.width < 10 || rect.height < 10) return;
        this.size = {width:rect.width,height:rect.height};
        this.svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
        this.fit();
      });
      this.resizeObserver.observe(container);
    }

    bindInteractions() {
      this.svg.addEventListener('wheel', event => {
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
        this.view.x = this.drag.viewX + dx;
        this.view.y = this.drag.viewY + dy;
        this.applyView();
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
        if (hit && ['Enter',' '].includes(event.key)) { event.preventDefault(); this.select(hit.dataset.key); }
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
      const previousLayout = this.options.layout;
      this.job = job;
      this.options = {...this.options,...options};
      this.empty.hidden = !!job?.items?.length;
      const signature = JSON.stringify([job?.id,this.options.layout === 'neural',(job?.items || []).map(item => [item.carrier,item.reference])]);
      this.container.classList.toggle('neural',this.options.layout === 'neural');
      const topologyChanged = signature !== this.signature;
      if (topologyChanged) {
        this.signature = signature;
        this.build();
      }
      const states = (job?.items || []).map(item => stateOf(item.status)).join('|');
      const layoutChanged = topologyChanged || previousLayout !== this.options.layout;
      if (layoutChanged || this.options.layout === 'status' && this.previousStates !== states) this.layout();
      this.previousStates = states;
      this.paint();
      if (layoutChanged) this.fit();
    }

    build() {
      this.nodes.clear();
      this.edges.clear();
      this.vertices.replaceChildren();
      this.links.replaceChildren();
      this.groups = [];
      if (!this.job?.items?.length) { this.guides.replaceChildren(); return; }
      const grouped = new Map();
      this.job.items.forEach((item,index) => {
        const carrier = item.carrier || 'UNKNOWN';
        if (!grouped.has(carrier)) grouped.set(carrier,{carrier,indices:[]});
        grouped.get(carrier).indices.push(index);
      });
      this.groups = [...grouped.values()];
      const neural = this.options.layout === 'neural';
      this.addNode({key:'batch',kind:'batch',label:'查询批次',radius:36});
      for (const group of this.groups) {
        const key = 'carrier:' + group.carrier;
        this.addNode({key,kind:'carrier',carrier:group.carrier,label:carrierLabel(group.carrier),indices:group.indices,radius:neural ? 14 : 20});
        this.addEdge('batch',key);
        for (const index of group.indices) {
          const item = this.job.items[index];
          const childKey = 'task:' + index;
          this.addNode({key:childKey,kind:'task',carrier:group.carrier,index,label:item.reference || '未提供单号',radius:neural ? 7.5 : 5.5});
          this.addEdge(key,childKey);
        }
      }
      if (neural) {
        this.addNode({key:'output:snapshot',kind:'output',label:'结果快照',radius:36});
        this.job.items.forEach((item,index) => this.addEdge('task:' + index,'output:snapshot','result:' + index));
      }
    }

    addNode(node) {
      const element = svgElement('g',{class:'net-node net-' + node.kind,'data-key':node.key,tabindex:'0',role:'button'});
      const hit = svgElement('rect',{class:'node-hit',rx:4,'aria-hidden':'true'});
      const halo = svgElement('circle',{class:'node-halo',r:node.radius * (node.kind === 'task' ? 3.5 : 2.2)});
      const ring = svgElement('circle',{class:'node-ring',r:node.radius + (node.kind === 'task' ? 6 : 10)});
      const body = node.kind === 'carrier' && this.options.layout !== 'neural'
        ? svgElement('path',{class:'node-body',d:'M 0 -21 L 18 -10.5 L 18 10.5 L 0 21 L -18 10.5 L -18 -10.5 Z'})
        : svgElement('circle',{class:'node-body',r:node.radius});
      const dot = svgElement('circle',{class:'node-dot',r:node.kind === 'task' ? 2 : 2.5});
      const label = svgElement('text',{class:'node-label','dominant-baseline':'middle'});
      const meta = svgElement('text',{class:'node-meta','dominant-baseline':'middle'});
      const title = svgElement('title');
      element.append(hit,halo,ring,body,dot,label,meta,title);
      this.vertices.append(element);
      Object.assign(node,{element,hitElement:hit,labelElement:label,metaElement:meta,titleElement:title,x:0,y:0,anchor:'start',labelX:13,labelY:0});
      this.nodes.set(node.key,node);
    }

    addEdge(from,to,key = to) {
      const element = svgElement('g',{class:'net-edge','data-from':from,'data-to':to});
      const wire = svgElement('path',{class:'net-wire'});
      const flow = svgElement('path',{class:'net-flow'});
      const particle = svgElement('circle',{class:'net-particle',r:'2.4'});
      const motion = svgElement('animateMotion',{dur:'2.8s',repeatCount:'indefinite',rotate:'auto'});
      particle.append(motion);
      element.append(wire,flow,particle);
      this.links.append(element);
      this.edges.set(key,{element,from,to,wire,flow,motion});
    }

    layout() {
      if (!this.nodes.size) return;
      this.guides.replaceChildren();
      this.layoutBounds = null;
      if (this.options.layout === 'neural') this.neuralLayout();
      else if (this.options.layout === 'tree') this.treeLayout();
      else if (this.options.layout === 'status') this.statusLayout();
      else this.forestLayout();
      for (const node of this.nodes.values()) {
        node.element.setAttribute('transform',`translate(${node.x} ${node.y})`);
        node.labelElement.setAttribute('x',node.labelX);
        node.labelElement.setAttribute('y',node.labelY);
        node.labelElement.setAttribute('text-anchor',node.anchor);
        node.metaElement.setAttribute('x',node.labelX);
        node.metaElement.setAttribute('y',node.labelY + 16);
        node.metaElement.setAttribute('text-anchor',node.anchor);
      }
      for (const edge of this.edges.values()) {
        const from = this.nodes.get(edge.from);
        const to = this.nodes.get(edge.to);
        let curve;
        if (['neural','tree','status'].includes(this.options.layout)) {
          const middle = (from.x + to.x) / 2;
          curve = `M ${from.x} ${from.y} C ${middle} ${from.y} ${middle} ${to.y} ${to.x} ${to.y}`;
        } else {
          const ratio = edge.from === 'batch' ? .55 : .72;
          curve = `M ${from.x} ${from.y} C ${from.x * 1.35} ${from.y * 1.35} ${to.x * ratio} ${to.y * ratio} ${to.x} ${to.y}`;
        }
        edge.wire.setAttribute('d',curve);
        edge.flow.setAttribute('d',curve);
        edge.motion.setAttribute('path',curve);
      }
    }

    rootPosition(x,y) {
      Object.assign(this.nodes.get('batch'),{x,y,anchor:'middle',labelX:0,labelY:-4});
    }

    neuralLayout() {
      const count = this.job.items.length;
      const columns = count > 48 ? 3 : count > 24 ? 2 : 1;
      const rowStep = count <= 6 ? 58 : count <= 12 ? 40 : count <= 24 ? 30 : 26;
      const groupGap = this.groups.length > 8 ? 5 : 20;
      const heights = this.groups.map(group => (Math.ceil(group.indices.length / columns) - 1) * rowStep);
      const span = heights.reduce((sum,height) => sum + height,0) + (this.groups.length - 1) * (rowStep + groupGap);
      const frameHeight = Math.max(340,span + 38);
      const top = -frameHeight / 2;
      this.rootPosition(-460,0);
      Object.assign(this.nodes.get('output:snapshot'),{x:500,y:0,anchor:'middle',labelX:0,labelY:-4});
      let cursor = -span / 2;
      this.groups.forEach((group,groupIndex) => {
        const ship = this.nodes.get('carrier:' + group.carrier);
        Object.assign(ship,{x:-170,y:cursor + heights[groupIndex] / 2,anchor:'start',labelX:25,labelY:-6});
        group.indices.forEach((index,offset) => {
          const node = this.nodes.get('task:' + index);
          const column = offset % columns;
          Object.assign(node,{
            x:170 + (column - (columns - 1) / 2) * 38,
            y:cursor + Math.floor(offset / columns) * rowStep,
            anchor:'start',labelX:17,labelY:0,shortLabel:count > 24,
          });
        });
        cursor += heights[groupIndex] + rowStep + groupGap;
      });
      const layers = [
        [-460,'01 / INPUT','批次输入','追踪任务进入队列'],
        [-170,'02 / ROUTING','船司分流',this.groups.length + ' 家船司'],
        [170,'03 / EXECUTION','提单执行',count + ' 票独立任务'],
        [500,'04 / OUTPUT','快照汇聚','供业务页面更新'],
      ];
      for (const [x,number,label,caption] of layers) {
        this.guides.append(
          svgElement('line',{class:'net-guide',x1:x,x2:x,y1:top - 10,y2:frameHeight / 2 + 25}),
          svgElement('text',{class:'net-layer-number',x,y:top - 58,'text-anchor':'middle'},number),
          svgElement('text',{class:'net-layer-title',x,y:top - 37,'text-anchor':'middle'},label),
          svgElement('text',{class:'net-layer-caption',x,y:frameHeight / 2 + 50,'text-anchor':'middle'},caption),
        );
      }
      for (const x of [-315,0,335]) {
        this.guides.append(svgElement('path',{d:'M ' + (x-5) + ' ' + (top-42) + ' l 5 5 -5 5',fill:'none',stroke:'#46657a','stroke-width':1,'stroke-opacity':.65}));
      }
      this.layoutBounds = {left:-520,right:560,top:top - 76,bottom:frameHeight / 2 + 65};
    }

    forestLayout() {
      this.rootPosition(0,0);
      const count = this.job.items.length;
      const carrierRadius = this.groups.length > 8 ? 176 : 145;
      const leafRadius = this.groups.length > 8 ? 294 : 265;
      const totalWeight = this.groups.reduce((sum,group) => sum + Math.sqrt(group.indices.length) + 1,0);
      let angle = -Math.PI / 2 - Math.PI / this.groups.length;
      for (const radius of [85,carrierRadius,leafRadius]) this.guides.append(svgElement('circle',{class:'net-guide',r:radius}));
      for (const group of this.groups) {
        const sweep = (Math.sqrt(group.indices.length) + 1) / totalWeight * Math.PI * 2;
        const center = angle + sweep / 2;
        const ship = this.nodes.get('carrier:' + group.carrier);
        const coordinates = point(carrierRadius,center);
        Object.assign(ship,coordinates,{anchor:'middle',labelX:0,labelY:34});
        const capacity = Math.max(3,Math.floor(sweep * leafRadius / 32));
        group.indices.forEach((index,offset) => {
          const row = Math.floor(offset / capacity);
          const rowCount = Math.min(capacity,group.indices.length - row * capacity);
          const column = offset % capacity;
          const fan = Math.min(sweep * .82,rowCount * .14);
          const leafAngle = center + (column - (rowCount - 1) / 2) * (rowCount > 1 ? fan / (rowCount - 1) : 0);
          const radius = leafRadius + row * 48;
          const node = this.nodes.get('task:' + index);
          const labelRight = Math.cos(leafAngle) >= 0;
          Object.assign(node,point(radius,leafAngle),{anchor:labelRight ? 'start' : 'end',labelX:labelRight ? 13 : -13,labelY:0,shortLabel:count > 24});
        });
        angle += sweep;
      }
    }

    treeLayout() {
      const totalHeight = this.job.items.length * 31 + this.groups.length * 23;
      this.rootPosition(-390,0);
      let y = -totalHeight / 2;
      for (const group of this.groups) {
        const height = group.indices.length * 31;
        const ship = this.nodes.get('carrier:' + group.carrier);
        Object.assign(ship,{x:-100,y:y + height / 2 - 15,anchor:'end',labelX:-30,labelY:-7});
        group.indices.forEach((index,offset) => {
          Object.assign(this.nodes.get('task:' + index),{x:190,y:y + offset * 31,anchor:'start',labelX:15,labelY:0,shortLabel:false});
        });
        y += height + 23;
      }
      for (const x of [-390,-100,190]) this.guides.append(svgElement('line',{class:'net-guide',x1:x,x2:x,y1:-totalHeight / 2 - 35,y2:totalHeight / 2 + 15}));
      for (const [label,x] of [['批次',-390],['船司',-100],['提单',190]]) this.guides.append(svgElement('text',{class:'net-group-label',x,y:-totalHeight / 2 - 55,'text-anchor':'middle'},label));
    }

    statusLayout() {
      const states = ['pending','running','done','attention','failed','cancelled'];
      const buckets = new Map(states.map(state => [state,[]]));
      this.job.items.forEach((item,index) => buckets.get(stateOf(item.status)).push(index));
      this.rootPosition(-470,0);
      const carrierHeight = Math.max(360,this.groups.length * 58);
      this.groups.forEach((group,index) => Object.assign(this.nodes.get('carrier:' + group.carrier),{
        x:-260,y:(index - (this.groups.length - 1) / 2) * (carrierHeight / this.groups.length),anchor:'end',labelX:-30,labelY:-7,
      }));
      const visible = states.filter(state => buckets.get(state).length || ['pending','running','done','attention'].includes(state));
      const columns = this.job.items.length > 36 ? 4 : 3;
      const boxWidth = columns * 155 + 30;
      const heights = visible.map(state => Math.max(100,Math.ceil(buckets.get(state).length / columns) * 30 + 64));
      const totalHeight = heights.reduce((sum,height) => sum + height,0);
      let top = -totalHeight / 2;
      visible.forEach((state,bucketIndex) => {
        const bucketHeight = heights[bucketIndex];
        const y = top + bucketHeight / 2;
        const indices = buckets.get(state);
        const box = svgElement('rect',{x:-45,y:y - bucketHeight / 2 + 8,width:boxWidth,height:bucketHeight - 16,rx:18,fill:COLORS[state],'fill-opacity':'.025',stroke:COLORS[state],'stroke-opacity':'.11'});
        this.guides.append(box,svgElement('text',{class:'net-group-label',x:-25,y:y - bucketHeight / 2 + 29},`${LABELS[state]} / ${indices.length}`));
        indices.forEach((index,offset) => {
          const column = offset % columns;
          const row = Math.floor(offset / columns);
          Object.assign(this.nodes.get('task:' + index),{x:-13 + column * 155,y:y - bucketHeight / 2 + 53 + row * 30,anchor:'start',labelX:12,labelY:0,shortLabel:true});
        });
        top += bucketHeight;
      });
      this.layoutBounds = {left:-45,right:boxWidth - 45,top:-totalHeight / 2,bottom:totalHeight / 2};
    }

    paint() {
      if (!this.job?.items) return;
      const search = String(this.options.search || '').trim().toLowerCase();
      const filter = this.options.filter;
      const matched = new Set();
      const received = this.job.items.filter(item => !!item.result_status).length;
      const writing = this.job.items.some(item => item.status === 'running' && ['extracting','saving'].includes(item.phase));
      const allSettled = this.job.items.every(item => !['running','pending','queued'].includes(item.status));
      for (const node of this.nodes.values()) {
        const item = node.kind === 'task' ? this.job.items[node.index] : null;
        const state = item ? stateOf(item.status) : node.kind === 'carrier' ? groupState(node.indices.map(index => this.job.items[index])) :
          node.kind === 'output' ? writing ? 'running' : received ? allSettled ? groupState(this.job.items) : 'done' : 'pending' : groupState(this.job.items);
        const color = COLORS[state];
        node.element.style.setProperty('--node-color',color);
        node.element.classList.toggle('active',state === 'running');
        node.element.classList.toggle('selected',this.options.selectedKey === node.key);
        node.element.dataset.state = state;
        if (node.lastState === 'running' && state === 'done') {
          node.element.classList.add('just-done');
          const timer = setTimeout(() => { node.element.classList.remove('just-done'); this.flashTimers.delete(timer); },900);
          this.flashTimers.add(timer);
        }
        node.lastState = state;
        if (item) {
          const matchesFilter = !filter || filter === 'all' || filter === state || filter === 'attention' && ['attention','failed','cancelled'].includes(state);
          const matchesSearch = !search || [item.reference,item.carrier,item.carrier_name].join(' ').toLowerCase().includes(search);
          if (matchesFilter && matchesSearch) { matched.add(node.key); matched.add('carrier:' + node.carrier); matched.add('batch'); matched.add('output:snapshot'); }
          node.labelElement.textContent = node.shortLabel && this.view.scale < 1.3 ? String(node.label).slice(-9) : node.label;
          node.metaElement.textContent = '';
          node.titleElement.textContent = `${carrierLabel(node.carrier)} · ${node.label}\n${LABELS[state]}${item.phase ? ' · ' + item.phase : ''}`;
        } else if (node.kind === 'carrier') {
          node.labelElement.textContent = node.label;
          const done = node.indices.filter(index => stateOf(this.job.items[index].status) === 'done').length;
          node.metaElement.textContent = `${done} / ${node.indices.length} 票`;
          node.titleElement.textContent = `${node.label} · ${node.indices.length} 票 · ${LABELS[state]}`;
        } else if (node.kind === 'output') {
          node.labelElement.textContent = node.label;
          node.metaElement.textContent = `${received} / ${this.job.items.length} 已汇聚`;
          node.titleElement.textContent = `${node.label} · ${received} 票结果记录已生成，等待业务端使用`;
          if (node.lastReceived !== undefined && received > node.lastReceived) {
            node.element.classList.add('just-done');
            const timer = setTimeout(() => { node.element.classList.remove('just-done'); this.flashTimers.delete(timer); },900);
            this.flashTimers.add(timer);
          }
          node.lastReceived = received;
        } else {
          node.labelElement.textContent = this.options.replay ? '历史回放' : '查询批次';
          node.metaElement.textContent = `${this.job.items.length} 票 / ${this.groups.length} 船司`;
          node.titleElement.textContent = `${this.job.label || this.job.id || '查询批次'}\n${LABELS[state]}`;
        }
        node.element.setAttribute('aria-label',node.titleElement.textContent.replace('\n','，'));
        node.element.setAttribute('aria-pressed',String(this.options.selectedKey === node.key));
      }
      for (const node of this.nodes.values()) node.element.classList.toggle('dim',!matched.has(node.key));
      for (const edge of this.edges.values()) {
        const child = this.nodes.get(edge.to);
        if (child.kind === 'output') {
          const task = this.nodes.get(edge.from);
          const item = this.job.items[task.index];
          const returned = !!item.result_status;
          const active = item.status === 'running' && ['extracting','saving'].includes(item.phase);
          edge.element.style.setProperty('--node-color',COLORS[active ? 'running' : returned ? task.lastState : 'pending']);
          edge.element.classList.toggle('active',active);
          edge.element.classList.toggle('dim',!matched.has(task.key));
          if (edge.lastReturned === false && returned) {
            edge.element.classList.add('just-returned');
            const timer = setTimeout(() => { edge.element.classList.remove('just-returned'); this.flashTimers.delete(timer); },1200);
            this.flashTimers.add(timer);
          }
          edge.lastReturned = returned;
        } else {
          edge.element.style.setProperty('--node-color',COLORS[child.lastState]);
          edge.element.classList.toggle('active',child.lastState === 'running');
          edge.element.classList.toggle('dim',!matched.has(child.key));
        }
      }
      this.arrangeLabels();
    }

    fit() {
      if (!this.nodes.size) return;
      const points = [...this.nodes.values()];
      let left = Infinity,top = Infinity,right = -Infinity,bottom = -Infinity;
      for (const node of points) {
        const labelLength = node.kind === 'task' && node.shortLabel ? 65 : Math.min(155,String(node.label).length * 6.5);
        const labelLeft = node.anchor === 'end' ? node.labelX - labelLength : node.anchor === 'middle' ? -labelLength / 2 : node.labelX;
        const labelRight = node.anchor === 'start' ? node.labelX + labelLength : node.anchor === 'middle' ? labelLength / 2 : node.labelX;
        left = Math.min(left,node.x - node.radius - 20,node.x + labelLeft - 14);
        right = Math.max(right,node.x + node.radius + 20,node.x + labelRight + 14);
        top = Math.min(top,node.y - node.radius - 30,node.y + node.labelY - 22);
        bottom = Math.max(bottom,node.y + node.radius + 20,node.y + node.labelY + 30);
      }
      if (this.layoutBounds) {
        left = Math.min(left,this.layoutBounds.left);
        right = Math.max(right,this.layoutBounds.right);
        top = Math.min(top,this.layoutBounds.top);
        bottom = Math.max(bottom,this.layoutBounds.bottom);
      }
      const width = right - left;
      const height = bottom - top;
      const scale = Math.min((this.size.width - 60) / width,(this.size.height - 56) / height,1.45);
      this.fitScale = Math.max(.12,scale);
      this.view = {scale:this.fitScale,x:this.size.width / 2 - (left + right) / 2 * this.fitScale,y:this.size.height / 2 - (top + bottom) / 2 * this.fitScale};
      this.applyView();
    }

    applyView() {
      this.world.setAttribute('transform',`translate(${this.view.x} ${this.view.y}) scale(${this.view.scale})`);
      this.svg.dataset.zoom = this.view.scale.toFixed(2);
      for (const node of this.nodes.values()) {
        if (node.kind === 'task' && node.shortLabel) node.labelElement.textContent = this.view.scale >= 1.3 ? node.label : String(node.label).slice(-9);
      }
      this.arrangeLabels();
    }

    arrangeLabels() {
      const occupied = [];
      const tasks = [...this.nodes.values()].filter(node => node.kind === 'task');
      // At dense scales, retain the active/selected bill labels and reveal others on hover.
      // Text stays readable while zooming, so neighbouring nodes can separate on screen.
      tasks.sort((a,b) => Number(b.key === this.options.selectedKey) - Number(a.key === this.options.selectedKey)
        || Number(b.lastState === 'running') - Number(a.lastState === 'running'));
      const fontSize = 11 / Math.max(1,this.view.scale);
      for (const node of tasks) {
        node.labelElement.style.fontSize = fontSize + 'px';
        const width = node.labelElement.textContent.length * fontSize * .58;
        const x = node.x + node.labelX - (node.anchor === 'end' ? width : 0);
        const y = node.y + node.labelY - fontSize / 2;
        const bounds = {x,y,right:x + width,bottom:y + fontSize + 3};
        const collision = this.options.layout === 'forest' && tasks.length > 24 && occupied.some(box =>
          bounds.x < box.right + 3 && bounds.right + 3 > box.x && bounds.y < box.bottom + 3 && bounds.bottom + 3 > box.y);
        const hidden = collision || ((this.options.layout === 'neural' && tasks.length > 24 && this.view.scale < 1.3) || tasks.length > 200 && this.view.scale < .8) && node.lastState !== 'running' && node.key !== this.options.selectedKey;
        node.labelElement.style.visibility = hidden ? 'hidden' : 'visible';
        if (!hidden && !node.element.classList.contains('dim')) occupied.push(bounds);
      }
      // Cover the visible neuron and its labels, without the much larger decorative halo.
      // Tight vertical bounds keep neighbouring bills independently selectable.
      for (const node of this.nodes.values()) {
        let left = -node.radius - 4, right = node.radius + 4;
        let top = -node.radius - 4, bottom = node.radius + 4;
        for (const label of [node.labelElement,node.metaElement]) {
          if (!label.textContent || label.style.visibility === 'hidden') continue;
          const bounds = label.getBBox();
          left = Math.min(left,bounds.x - 4);
          right = Math.max(right,bounds.x + bounds.width + 4);
          top = Math.min(top,bounds.y - 3);
          bottom = Math.max(bottom,bounds.y + bounds.height + 3);
        }
        node.hitElement.setAttribute('x',left);
        node.hitElement.setAttribute('y',top);
        node.hitElement.setAttribute('width',right - left);
        node.hitElement.setAttribute('height',bottom - top);
      }
    }

    zoomBy(factor,anchor = {x:this.size.width / 2,y:this.size.height / 2}) {
      const next = Math.max(Math.min(.2,(this.fitScale || .5) * .5),Math.min(4,this.view.scale * factor));
      const ratio = next / this.view.scale;
      this.view.x = anchor.x - (anchor.x - this.view.x) * ratio;
      this.view.y = anchor.y - (anchor.y - this.view.y) * ratio;
      this.view.scale = next;
      this.applyView();
    }

    focusRunning() {
      const node = [...this.nodes.values()].find(candidate => candidate.kind === 'task' && candidate.lastState === 'running');
      if (!node) { this.fit(); return; }
      this.view.scale = Math.max(this.fitScale || 1,1.2);
      this.view.x = this.size.width / 2 - node.x * this.view.scale;
      this.view.y = this.size.height / 2 - node.y * this.view.scale;
      this.applyView();
      this.select(node.key);
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

  window.TaskNetwork = TaskNetwork;
})();
