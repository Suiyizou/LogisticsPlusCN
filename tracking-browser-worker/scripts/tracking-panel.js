(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const terminal = new Set(['completed','completed_with_gaps','failed','cancelled']);
  const labels = {
    done:'已返回', running:'执行中', pending:'等待执行', queued:'排队中',
    completed:'已完成', completed_with_gaps:'部分需关注', human_required:'等待验证',
    failed:'执行异常', cancelled:'已停止', cancelling:'正在停止',
    no_business_data:'暂无数据', matched_no_structure:'待核对', carrier_not_implemented:'暂不支持',
  };
  const phases = {
    opening:'打开官网并提交查询', waiting:'等待官网返回', extracting:'解析货踪数据',
    saving:'保存结果快照', retrying:'重试查询', reconnecting:'重新连接浏览器', replay_query:'按历史记录回放这票查询',
  };
  const base = new URL(location.pathname.replace(/\/console\/?$/, '/') || '/', location.origin);
  const apiUrl = route => new URL(route.replace(/^\//,''), base).href;
  let token = sessionStorage.getItem('tracking-token') || '';
  let selectedId = new URLSearchParams(location.search).get('job');
  let followExecution = !selectedId && new URLSearchParams(location.search).get('replay') !== '1';
  let generation = 0;
  let job = null;
  let snapshot = null;
  let canonicalItems = new Map();
  let view = null;
  let selection = {kind:'batch',key:'batch'};
  let inspectedValue = null;
  let inspectedSignature = null;
  let layout = new URLSearchParams(location.search).get('layout') || localStorage.getItem('tracking-network-layout-v2') || 'neural';
  if (!['neural','forest','tree','status'].includes(layout)) layout = 'neural';
  let filter = 'all';
  let polling = false;
  let refreshPending = false;
  let refreshTimer;
  let workerState = null;
  let lastContact = 0;
  let lastHeartbeat = 0;
  let networkFailed = false;
  let streamConnected = false;
  let streamController = null;
  let streamGeneration = 0;
  let streamRetryTimer;
  let disposed = false;
  let authFailed = false;
  let resultLoadedFor = null;
  let clockOffset = 0;
  let toastTimer;
  let replay = null;
  let replayBounds = null;
  let pendingReplay = new URLSearchParams(location.search).get('replay') === '1';
  const tree = new window.SnapshotTree($('json-tree'));
  const graph = new window.TaskNetwork($('graph'), {onSelect: selectNode});
  const statusLabel = status => labels[status] || status || '未提供';
  const needsAttention = item => !['done','running','pending','queued','cancelled'].includes(item.status);
  const authHeaders = () => token ? {Authorization:'Bearer ' + token} : {};
  function duration(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return String(Math.floor(value / 60)).padStart(2,'0') + ':' + String(value % 60).padStart(2,'0');
  }
  function message(text) {
    $('toast').textContent = text;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
  }
  async function api(route, options = {}) {
    const requestToken = token;
    const response = await fetch(apiUrl(route), {
      signal:AbortSignal.timeout(10000), ...options, cache:'no-store',
      headers:{...authHeaders(), ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers},
    });
    if (response.status === 401) {
      if (requestToken === token) authFailed = true;
      throw new Error('请在连接设置中填写服务访问令牌。');
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || error.error || '请求失败 ' + response.status);
    }
    return response;
  }
  function updateLink() {
    const url = new URL(location.href);
    if (followExecution) url.searchParams.delete('job');
    else if (selectedId) url.searchParams.set('job',selectedId);
    url.searchParams.set('layout',layout);
    if (replay) url.searchParams.set('replay','1');
    else url.searchParams.delete('replay');
    history.replaceState(null,'',url);
  }
  function selectBatch(id, {automatic = false, refreshNow = true} = {}) {
    if (!automatic) followExecution = false;
    generation += 1;
    selectedId = id;
    job = null;
    snapshot = null;
    view = null;
    resultLoadedFor = null;
    replay = null;
    replayBounds = null;
    pendingReplay = false;
    $('replay-button').disabled = true;
    $('replay-range').disabled = true;
    selection = {kind:'batch',key:'batch'};
    updateLink();
    graph.update({id,label:'载入批次…',items:[]},{layout});
    $('inspector-title').textContent = '载入批次…';
    $('inspect-summary').textContent = '';
    tree.update(null);
    inspectedValue = null;
    inspectedSignature = null;
    $('download-button').disabled = true;
    $('copy-button').disabled = true;
    renderWorker();
    if (refreshNow) requestRefresh();
  }

  function isOnline() {
    return !authFailed && !networkFailed && lastContact > 0 && Date.now() - lastContact < 12000;
  }
  function recordWorker(data, heartbeat = false) {
    workerState = data;
    lastContact = Date.now();
    if (heartbeat) lastHeartbeat = lastContact;
    networkFailed = false;
    if (data.server_time) clockOffset = Date.parse(data.server_time) - Date.now();
    tick();
  }
  function renderWorker() {
    const online = isOnline();
    const worker = workerState?.worker;
    const activeId = worker?.active_job_id;
    $('worker-name').textContent = worker?.name || worker?.id || '本地执行机';
    $('worker-status').textContent = !online ? authFailed ? '需要访问令牌' : lastContact ? '离线 · 状态待确认' : '连接中' :
      worker?.status === 'busy' || workerState?.running > 0 ? '执行中' : '在线待命';
    $('worker-status').classList.toggle('offline',!online);
    $('worker-queue').textContent = online ? '执行 ' + (workerState?.running ?? 0) + ' · 排队 ' + (workerState?.queued ?? 0) : '队列状态待确认';
    const runningTask = !replay && job && job.id === activeId ? job.items.find(item => item.status === 'running') : null;
    $('worker-current').textContent = !online ? '等待重新连接执行机' : runningTask ? runningTask.carrier + ' / ' + runningTask.reference :
      activeId ? '当前批次 ' + activeId : '等待下一批任务';
    $('worker-current').title = $('worker-current').textContent;
    const lastSignal = streamConnected ? lastHeartbeat : lastContact;
    const age = lastSignal ? Math.max(0,Math.floor((Date.now() - lastSignal) / 1000)) : null;
    $('worker-heartbeat').textContent = age === null ? '等待心跳' : (streamConnected ? '心跳 ' : '状态同步 ') + age + ' 秒前';
    $('follow-button').textContent = followExecution ? '● 正在跟随执行任务' : '跟随执行任务';
    $('follow-button').classList.toggle('active',followExecution);
    $('follow-button').setAttribute('aria-pressed',String(followExecution));
    $('connection-label').textContent = authFailed ? '需要令牌' : !online ? lastContact ? '执行机离线' : '连接中' :
      streamConnected ? '实时连接已建立' : '执行机在线 · 轮询';
    $('connection-dot').className = 'dot ' + (online ? 'online' : 'offline');
    const paused = !online && !replay || !!replay && !replay.playing;
    $('graph').classList.toggle('paused',paused);
    const svg = $('graph').querySelector('svg');
    if (svg) { if (paused) svg.pauseAnimations(); else svg.unpauseAnimations(); }
    if (!online && !replay) {
      $('live-bar').classList.remove('executing');
      $('live-state').textContent = lastContact ? 'OFFLINE / 等待重新连接' : 'CONNECTING / 连接执行机';
      $('live-description').textContent = lastContact ? '当前显示最后一次同步记录，执行状态尚未确认' : '等待本地队列与心跳状态';
    }
  }
  function requestRefresh() {
    if (disposed || authFailed) return;
    if (polling) { refreshPending = true; return; }
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); },100);
  }
  function dispatchStreamEvent(event, data) {
    if (event === 'worker') {
      const previous = workerState?.worker?.active_job_id;
      recordWorker(data,true);
      if (followExecution && data.worker?.active_job_id !== previous) requestRefresh();
    } else if (event === 'job') {
      lastContact = Date.now();
      networkFailed = false;
      // A full read reconciles missed events and includes the canonical partial snapshot.
      requestRefresh();
    }
  }
  async function connectStream(version = streamGeneration, delay = 1000) {
    if (disposed || version !== streamGeneration || authFailed) return;
    const controller = new AbortController();
    streamController = controller;
    let timeout;
    const armTimeout = () => { clearTimeout(timeout); timeout = setTimeout(() => controller.abort(),16000); };
    armTimeout();
    try {
      const response = await api('events',{signal:controller.signal,headers:{Accept:'text/event-stream'}});
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('实时连接不可用');
      streamConnected = true;
      renderWorker();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!disposed && version === streamGeneration) {
        const {value,done} = await reader.read();
        if (done) break;
        armTimeout();
        buffer += decoder.decode(value,{stream:true});
        if (buffer.length > 262144) throw new Error('实时事件过大');
        let end;
        while ((end = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const boundary = buffer.slice(end).match(/^\r?\n\r?\n/)[0].length;
          const frame = buffer.slice(0,end);
          buffer = buffer.slice(end + boundary);
          let type = 'message';
          const lines = [];
          for (const line of frame.split(/\r?\n/)) {
            if (line.startsWith('event:')) type = line.slice(6).trim();
            if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
          }
          if (lines.length) {
            try { dispatchStreamEvent(type,JSON.parse(lines.join('\n'))); } catch { /* Ignore malformed frames; reconnect/poll can reconcile state. */ }
          }
        }
      }
      if (!controller.signal.aborted) throw new Error('实时连接已断开');
    } catch {
      if (version !== streamGeneration || disposed) return;
      streamConnected = false;
      // A healthy fallback response can restore online status without pretending SSE is connected.
      networkFailed = true;
      renderWorker();
      requestRefresh();
    } finally {
      clearTimeout(timeout);
      controller.abort();
      if (streamController === controller) streamController = null;
      if (version === streamGeneration && !disposed && !authFailed) {
        streamConnected = false;
        streamRetryTimer = setTimeout(() => connectStream(version,Math.min(delay * 2,10000)),delay);
      }
    }
  }
  function restartStream() {
    streamGeneration += 1;
    clearTimeout(streamRetryTimer);
    streamController?.abort();
    streamConnected = false;
    connectStream(streamGeneration);
  }
  function buildCanonicalIndex() {
    canonicalItems = new Map();
    let resultIndex = 0;
    for (const [index,item] of job.items.entries()) {
      if (item.result_status) canonicalItems.set(index,snapshot?.shipments?.[resultIndex++]);
    }
  }
  function getBounds() {
    const starts = job.items.map(item => Date.parse(item.started_at)).filter(Number.isFinite);
    const ends = job.items.map(item => Date.parse(item.finished_at)).filter(Number.isFinite);
    if (!terminal.has(job.status) || !starts.length || !ends.length) return null;
    const start = Math.min(...starts);
    const end = Math.max(...ends);
    return end > start ? {start,end} : null;
  }
  function displayedJob() {
    if (!replay || !replayBounds) return job;
    const items = job.items.map(item => {
      const start = Date.parse(item.started_at);
      const end = Date.parse(item.finished_at);
      if (!Number.isFinite(start) || replay.time < start) {
        const state = replay.time >= replayBounds.end ? item.status : 'pending';
        return {...item,status:state,result_status:null,phase:null,containers:0};
      }
      if (Number.isFinite(end) && replay.time >= end) return item;
      return {...item,status:'running',result_status:null,phase:'replay_query',containers:0,finished_at:null};
    });
    return {...job,items,status:replay.time >= replayBounds.end ? job.status : 'running'};
  }
  function renderGraph() {
    if (!job) return;
    view = displayedJob();
    if (selection.kind === 'output' && layout !== 'neural') selection = {kind:'batch',key:'batch'};
    graph.update({...view,label:view.items.length + ' 票查询'}, {
      layout,filter,search:$('search').value,selectedKey:selection.key,replay:!!replay,
    });
    const paused = !!replay && !replay.playing;
    $('graph').classList.toggle('paused',paused);
    const svg = $('graph').querySelector('svg');
    if (svg) { if (paused) svg.pauseAnimations(); else svg.unpauseAnimations(); }
    $('batch-id').textContent = job.id;
    $('count-total').textContent = view.items.length;
    $('count-done').textContent = view.items.filter(item => item.status === 'done').length;
    $('count-running').textContent = view.items.filter(item => item.status === 'running').length;
    $('count-attention').textContent = view.items.filter(needsAttention).length;
    $('download-button').disabled = !snapshot?.shipments?.length;
    $('replay-button').disabled = !replayBounds;
    $('replay-range').disabled = !replayBounds;
    $('live-button').hidden = !replay;
    $('mode-tag').classList.toggle('replay',!!replay);
    $('mode-tag').innerHTML = replay ? '<i class="dot"></i>历史回放' : '<i class="dot online"></i>实时';
    $('replay-button').textContent = replay?.playing ? 'Ⅱ 暂停回放' : replay ? '▶ 继续回放' : '▶ 回放执行过程';
    if (replay && replayBounds) {
      $('replay-range').value = Math.round((replay.time - replayBounds.start) / (replayBounds.end - replayBounds.start) * 1000);
      $('replay-time').textContent = duration((replay.time - replayBounds.start) / 1000);
    } else {
      $('replay-range').value = 0;
      $('replay-time').textContent = replayBounds ? duration((replayBounds.end - replayBounds.start) / 1000) : '00:00';
    }
    renderInspector();
    tick();
  }
  function tick() {
    renderWorker();
    if (!view) return;
    const current = view.items.find(item => item.status === 'running');
    const clock = replay ? replay.time : (isOnline() ? Date.now() : lastContact || Date.now()) + clockOffset;
    const settled = view.items.filter(item => !['pending','running','queued'].includes(item.status)).length;
    $('live-bar').classList.toggle('executing',!!current && (replay ? replay.playing : isOnline()));
    $('live-state').textContent = replay ? (replay.playing ? 'REPLAY / 历史执行回放' : 'REPLAY / 已暂停') :
      !isOnline() ? 'OFFLINE / 等待重新连接' : followExecution && !workerState?.running ? 'LIVE / 执行机待命' : 'LIVE / ' + statusLabel(job.status);
    $('live-reference').textContent = current ? current.carrier + '  /  ' + current.reference :
      terminal.has(view.status) ? '执行结束 · ' + view.items.filter(item => item.status === 'done').length + ' 票已返回' : '等待浏览器执行';
    $('live-description').textContent = !replay && !isOnline() ? '当前显示最后一次同步记录，执行状态尚未确认' :
      followExecution && !workerState?.running ? '正在跟随本机队列，新任务开始后自动切换' : current ? phases[current.phase] || '正在查询官网' :
      replay ? '按保存的开始与结束时间重现执行状态' : '点击船司或提单，查看执行记录与结果状态';
    const started = current ? Date.parse(current.started_at) : Date.parse(job.started_at ?? job.created_at);
    const stopped = !current && terminal.has(view.status) ? Date.parse(job.finished_at) : clock;
    $('live-timer').textContent = duration((stopped - started) / 1000);
    $('live-count').textContent = settled + ' / ' + view.items.length + ' 已处理';
  }
  function taskData(index) {
    const item = view.items[index];
    return {
      carrier:item.carrier, reference:item.reference, status:item.status,
      phase:item.phase ?? null, started_at:item.started_at ?? null,
      finished_at:item.status === 'pending' || item.status === 'running' ? null : item.finished_at ?? null,
      result:item.result_status ? canonicalItems.get(index) ?? null : null,
    };
  }
  function summaryFields(fields) {
    return '<div class="summary-grid">' + fields.map(([key,value]) =>
      '<div><span>' + escapeHtml(key) + '</span><b>' + escapeHtml(value ?? '未提供') + '</b></div>').join('') + '</div>';
  }
  function selectNode(node) {
    selection = node;
    renderGraph();
  }
  function renderInspector() {
    if (!view) return;
    let value, title, subtitle, kind, summary;
    if (selection.kind === 'task' && view.items[selection.index]) {
      const item = view.items[selection.index];
      value = taskData(selection.index);
      title = item.reference;
      subtitle = item.carrier_name || item.carrier;
      kind = replay ? 'TASK NODE / 历史时点' : 'TASK NODE / 提单';
      const taskClock = replay ? replay.time : Date.now() + clockOffset;
      const elapsed = item.status === 'pending' ? 0 : ((item.finished_at ? Date.parse(item.finished_at) : taskClock) - Date.parse(item.started_at)) / 1000;
      summary = summaryFields([
        ['任务状态',statusLabel(item.status)],['执行耗时',duration(elapsed)],
        ['当前阶段',phases[item.phase] || (item.result_status ? '执行记录已生成' : '等待执行')],
        ['结果记录',item.result_status ? '已生成' : '尚未生成'],
        ['开始时间',item.started_at ? new Date(item.started_at).toLocaleTimeString('zh-CN',{hour12:false}) : '等待执行'],
        ['完成时间',value.finished_at ? new Date(value.finished_at).toLocaleTimeString('zh-CN',{hour12:false}) : '—'],
      ]);
      const note = item.result_status ? item.error || item.history_limit || item.notes : null;
      if (note) summary += '<div class="summary-note">' + escapeHtml(note) + '</div>';
    } else if (selection.kind === 'output') {
      const results = view.items.map((item,index) => item.result_status ? canonicalItems.get(index) : null).filter(Boolean);
      title = '统一快照';
      subtitle = replay ? '当前回放时点已生成的结果' : '货踪结果供业务页面读取和渲染';
      kind = 'OUTPUT LAYER / 结果汇聚';
      value = replay ? {
        mode:'HISTORY_REPLAY', at:new Date(replay.time).toISOString(),
        available_results:results.length, shipments:results,
      } : snapshot || {schema:'tracking.v1',shipments:[]};
      summary = summaryFields([
        ['已汇聚',results.length + ' / ' + view.items.length + ' 票'],
        ['集装箱',view.items.reduce((sum,item) => sum + (item.result_status ? Number(item.containers) || 0 : 0),0)],
        ['格式','tracking.v1'],['批次状态',statusLabel(view.status)],
      ]);
      if (replay) summary += '<div class="summary-note">只显示此时已经返回的结果。顶部下载按钮始终下载实际结果快照。</div>';
    } else if (selection.kind === 'carrier') {
      const children = view.items.map((item,index) => ({item,index})).filter(({item}) => item.carrier === selection.carrier);
      title = selection.carrier;
      subtitle = children[0]?.item.carrier_name || '船司分支';
      kind = 'CARRIER NODE / 船司';
      value = {carrier:selection.carrier,tasks:children.map(({index}) => taskData(index))};
      summary = summaryFields([
        ['子节点',children.length + ' 票提单'],['已返回',children.filter(({item}) => item.status === 'done').length],
        ['执行中',children.filter(({item}) => item.status === 'running').length],['需关注',children.filter(({item}) => needsAttention(item)).length],
      ]);
      summary += '<div class="summary-children">' + children.map(({item,index}) =>
        '<button data-task="' + index + '">' + escapeHtml(item.reference) + '</button>').join('') + '</div>';
    } else {
      const carriers = [...new Set(view.items.map(item => item.carrier))];
      title = view.items.length + ' 票查询';
      subtitle = job.source || '查询批次';
      kind = 'BATCH ROOT / 批次根节点';
      value = {
        batch:{id:job.id,status:view.status,mode:replay ? 'HISTORY_REPLAY' : 'LIVE'},
        carriers:carriers.map(carrier => ({
          carrier,
          tasks:view.items.map((item,index) => ({item,index})).filter(({item}) => item.carrier === carrier).map(({index}) => taskData(index)),
        })),
      };
      summary = summaryFields([
        ['船司分支',carriers.length],['提单节点',view.items.length],
        ['查询模式','浏览器自动化'],['快照版本',snapshot?.schema || 'tracking.v1'],
      ]);
      summary += '<div class="summary-children">' + carriers.map(carrier =>
        '<button data-carrier="' + escapeHtml(carrier) + '">' + escapeHtml(carrier) + '</button>').join('') + '</div>';
    }
    $('inspector-kind').textContent = kind;
    $('inspector-title').textContent = title;
    $('inspector-subtitle').textContent = subtitle;
    if ($('inspect-summary').innerHTML !== summary) $('inspect-summary').innerHTML = summary;
    inspectedValue = value;
    const signature = JSON.stringify(value);
    if (signature !== inspectedSignature) {
      tree.update(value);
      inspectedSignature = signature;
    }
    $('copy-button').disabled = false;
  }
  async function refresh() {
    if (authFailed || disposed) return;
    if (polling) { refreshPending = true; return; }
    polling = true;
    let version = generation;
    try {
      const [healthResponse,listResponse] = await Promise.all([api('health'),api('jobs')]);
      const [health,list] = await Promise.all([healthResponse.json(),listResponse.json()]);
      if (version !== generation) return;
      recordWorker(health);
      const jobs = list.jobs || [];
      const active = jobs.find(entry => entry.id === health.worker?.active_job_id) || jobs.find(entry => entry.status === 'running');
      const chosen = followExecution ? active?.id || jobs.find(entry => entry.status === 'queued')?.id ||
        jobs[0]?.id :
        (jobs.some(entry => entry.id === selectedId) ? selectedId : active?.id || jobs[0]?.id);
      if (chosen && chosen !== selectedId) {
        selectBatch(chosen,{automatic:true,refreshNow:false});
        version = generation;
      }
      const options = jobs.map(entry => '<option value="' + escapeHtml(entry.id) + '"' +
        (entry.id === selectedId ? ' selected' : '') + '>' + escapeHtml(entry.source || entry.id) + ' · ' +
        (entry.progress?.total ?? 0) + ' 票 · ' + statusLabel(entry.status) + '</option>').join('');
      if ($('batch-select').innerHTML !== options) $('batch-select').innerHTML = options || '<option>暂无批次</option>';
      if (selectedId) {
        const id = selectedId;
        const nextJob = await (await api('jobs/' + encodeURIComponent(id))).json();
        if (id !== selectedId || version !== generation) return;
        let nextSnapshot = resultLoadedFor === id ? snapshot : nextJob.snapshot;
        if (terminal.has(nextJob.status) && resultLoadedFor !== id) {
          const response = await fetch(apiUrl('jobs/' + encodeURIComponent(id) + '/result'),{headers:authHeaders(),cache:'no-store',signal:AbortSignal.timeout(10000)});
          if (response.ok) {
            nextSnapshot = await response.json();
            if (id !== selectedId || version !== generation) return;
            resultLoadedFor = id;
          }
        }
        if (id !== selectedId || version !== generation) return;
        job = nextJob;
        job.source = jobs.find(entry => entry.id === id)?.source || '';
        snapshot = nextSnapshot;
        clockOffset = job.server_time ? Date.parse(job.server_time) - Date.now() : 0;
        buildCanonicalIndex();
        replayBounds = getBounds();
        if (pendingReplay && replayBounds) {
          replay = {time:replayBounds.start,playing:true,last:performance.now()};
          pendingReplay = false;
          updateLink();
        }
        renderGraph();
      }
      renderWorker();
      $('page-alert').hidden = job?.status !== 'failed';
      $('page-alert').textContent = job?.error || '';
      $('last-sync').textContent = '同步于 ' + new Date().toLocaleTimeString('zh-CN',{hour12:false});
    } catch (error) {
      if (version !== generation) return;
      networkFailed = true;
      renderWorker();
      $('page-alert').hidden = false;
      $('page-alert').textContent = error.message;
    } finally {
      polling = false;
      if (refreshPending) { refreshPending = false; requestRefresh(); }
    }
  }
  function startReplay(playing) {
    if (!replayBounds) return;
    followExecution = false;
    if (!replay || replay.time >= replayBounds.end) replay = {time:replayBounds.start,playing,last:performance.now()};
    else { replay.playing = playing; replay.last = performance.now(); }
    updateLink();
    renderGraph();
  }
  $('replay-button').onclick = () => startReplay(!replay?.playing);
  $('live-button').onclick = () => { replay = null; updateLink(); renderGraph(); };
  $('replay-range').oninput = () => {
    if (!replayBounds) return;
    followExecution = false;
    replay = {time:replayBounds.start + Number($('replay-range').value) / 1000 * (replayBounds.end - replayBounds.start),playing:false,last:performance.now()};
    updateLink();
    renderGraph();
  };
  setInterval(() => {
    if (!replay?.playing || !replayBounds) return;
    const now = performance.now();
    replay.time = Math.min(replayBounds.end,replay.time + (now - replay.last) * Number($('replay-speed').value));
    replay.last = now;
    if (replay.time >= replayBounds.end) replay.playing = false;
    renderGraph();
  }, 250);
  document.querySelectorAll('[data-layout]').forEach(button => {
    button.classList.toggle('active',button.dataset.layout === layout);
    button.setAttribute('aria-pressed',String(button.dataset.layout === layout));
    button.onclick = () => {
      layout = button.dataset.layout;
      localStorage.setItem('tracking-network-layout-v2',layout);
      updateLink();
      document.querySelectorAll('[data-layout]').forEach(tab => {
        tab.classList.toggle('active',tab === button);
        tab.setAttribute('aria-pressed',String(tab === button));
      });
      renderGraph();
    };
  });
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.onclick = () => {
      filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(tab => tab.classList.toggle('active',tab === button));
      renderGraph();
    };
  });
  $('batch-select').onchange = event => selectBatch(event.target.value);
  $('follow-button').onclick = () => {
    followExecution = !followExecution;
    if (followExecution) { replay = null; pendingReplay = false; }
    updateLink();
    renderWorker();
    if (job) renderGraph();
    requestRefresh();
  };
  $('search').oninput = renderGraph;
  $('fit-button').onclick = () => graph.fit();
  $('focus-button').onclick = () => graph.focusRunning();
  $('expand-button').onclick = () => tree.expandAll();
  $('collapse-button').onclick = () => tree.collapseAll();
  $('inspect-summary').onclick = event => {
    const task = event.target.closest('[data-task]');
    const carrier = event.target.closest('[data-carrier]');
    if (task) selectNode({kind:'task',key:'task:' + task.dataset.task,index:Number(task.dataset.task)});
    if (carrier) selectNode({kind:'carrier',key:'carrier:' + carrier.dataset.carrier,carrier:carrier.dataset.carrier});
  };
  $('copy-button').onclick = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(inspectedValue,null,2)); message('节点 JSON 已复制'); }
    catch { message('浏览器未允许复制，可下载快照 JSON。'); }
  };
  $('download-button').onclick = () => {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tracking-' + job.id + (terminal.has(job.status) ? '' : '-partial') + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    if (replay) message('已下载实际结果快照，回放时点仅用于可视化。');
  };
  $('settings-button').onclick = () => { $('token-input').value = token; $('settings-dialog').showModal(); };
  $('settings-form').onsubmit = event => {
    event.preventDefault();
    token = $('token-input').value.trim();
    generation += 1;
    sessionStorage.setItem('tracking-token',token);
    authFailed = false;
    $('settings-dialog').close();
    networkFailed = false;
    restartStream();
    requestRefresh();
  };
  document.querySelectorAll('[data-close]').forEach(button => {
    button.onclick = () => $(button.dataset.close).close();
  });
  setInterval(requestRefresh,5000);
  setInterval(tick,1000);
  window.addEventListener('pagehide',() => {
    disposed = true;
    clearTimeout(streamRetryTimer);
    clearTimeout(refreshTimer);
    streamController?.abort();
  });
  window.addEventListener('pageshow',event => {
    if (!event.persisted) return;
    disposed = false;
    restartStream();
    requestRefresh();
  });
  renderWorker();
  restartStream();
  refresh();
})();
