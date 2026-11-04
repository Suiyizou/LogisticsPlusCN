import { buildLogisticsMapModel } from "./logistics-map-model.mjs";

const copy = {
  en: {
    eyebrow: "OCEAN NETWORK",
    title: "Logistics network",
    routeTitle: "Shipment route map",
    map: "Map",
    list: "All nodes",
    nodes: "Nodes",
    lanes: "Connections",
    shipments: "Shipments",
    mappedNode: "Mapped node",
    connection: "Schematic connection",
    routeNote: "Connections link reported locations. Vessel positions are unavailable.",
    choose: "Select a node",
    chooseHint: "Choose a node on the map or in the list to see its related shipments.",
    related: "Related shipments",
    open: "Open shipment",
    close: "Clear node selection",
    empty: "No shipments in this view.",
    loading: "Loading shipments…",
    error: "Shipment data could not be loaded.",
    noNodes: "The reported locations could not be matched to verified map points.",
    noRouteLocations: "No route locations were supplied for this shipment.",
    unmapped: "Unmapped locations",
    noLocation: "Shipments without mapped locations",
    latest: "Latest reported event",
    updated: "Record updated",
    retry: "Retry",
    nearby: "Nearby nodes",
    closeNearby: "Close nearby nodes",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    reset: "Reset map view",
    navigation:
      "Use the arrow keys or drag to pan when zoomed in. Use arrow keys on a focused pin to move between nodes.",
    roles: {
      origin: "Origin",
      destination: "Destination",
      load: "Port of loading",
      discharge: "Port of discharge",
      transshipment: "Transshipment",
      event: "Reported event",
      departure: "Departure",
      arrival: "Arrival",
      pickup: "Pickup",
      delivery: "Delivery"
    }
  },
  zh: {
    eyebrow: "海运网络",
    title: "全球物流网络",
    routeTitle: "运单航线地图",
    map: "地图",
    list: "全部节点",
    nodes: "节点",
    lanes: "连接",
    shipments: "票货物",
    mappedNode: "已定位节点",
    connection: "示意连接",
    routeNote: "连线为已报告地点之间的示意连接。暂无船舶位置信息。",
    choose: "选择节点",
    chooseHint: "在地图或节点列表中选择节点，即可查看相关货物。",
    related: "相关货物",
    open: "查看货物",
    close: "清除节点选择",
    empty: "当前范围内暂无货物。",
    loading: "正在加载货物…",
    error: "无法加载货物数据。",
    noNodes: "已报告的地点无法匹配到可确认的地图位置。",
    noRouteLocations: "这票运单暂无已报告的航线地点。",
    unmapped: "未定位地点",
    noLocation: "暂无已定位地点的货物",
    latest: "最新报告事件",
    updated: "记录更新",
    retry: "重试",
    nearby: "附近节点",
    closeNearby: "关闭附近节点",
    zoomIn: "放大",
    zoomOut: "缩小",
    reset: "重置地图视图",
    navigation: "放大后可拖动地图，或使用方向键平移。焦点位于节点上时，可使用方向键切换节点。",
    roles: {
      origin: "起运地",
      destination: "目的地",
      load: "装货港",
      discharge: "卸货港",
      transshipment: "中转",
      event: "已报告事件",
      departure: "离开",
      arrival: "到达",
      pickup: "提货地",
      delivery: "交付地"
    }
  }
};

const svgNS = "http://www.w3.org/2000/svg";
const land = new URL("./geo/world-land.svg", import.meta.url).href;
const zoomLevels = [1, 1.6, 2.5, 4];
const emptyModel = { nodes: [], edges: [], shipments: [], unresolved: [] };

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function svgElement(tag, attrs) {
  const node = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function button(className, label, action, visibleLabel = label) {
  const node = element("button", className, visibleLabel);
  node.type = "button";
  node.setAttribute("aria-label", label);
  node.addEventListener("click", action);
  return node;
}

function project(point, pacific) {
  const longitude = (point.longitude + 180) / 360;
  return [pacific ? (longitude + 0.5) % 1 : longitude, (90 - point.latitude) / 180];
}

function routePath(from, to, pacific) {
  const [startX, startY] = project(from, pacific);
  let [endX, endY] = project(to, pacific);
  if (endX - startX > 0.5) endX -= 1;
  if (startX - endX > 0.5) endX += 1;

  const distance = Math.hypot((endX - startX) * 1000, (endY - startY) * 500);
  const lift = Math.min(65, distance * 0.27);
  const controlY = Math.max(2, (startY + endY) * 250 - lift);
  const shifts = endX < 0 ? [0, 1] : endX > 1 ? [0, -1] : [0];

  return shifts
    .map((shift) => {
      const left = (startX + shift) * 1000;
      const right = (endX + shift) * 1000;
      return `M${left.toFixed(2)} ${(startY * 500).toFixed(2)} Q${((left + right) / 2).toFixed(2)} ${controlY.toFixed(2)} ${right.toFixed(2)} ${(endY * 500).toFixed(2)}`;
    })
    .join(" ");
}

function roleLabel(t, role) {
  return t.roles[role] || String(role).replace(/[_-]+/g, " ");
}

export function createLogisticsNetworkMap(host, { onOpenShipment, onRetry } = {}) {
  let model = emptyModel;
  let t = copy.en;
  let options = {};
  let mode = "map";
  let selectedId = null;
  let selectionInitialized = false;
  let zoomIndex = 0;
  let pan = [0, 0];
  let selectionRender = () => {};
  let dismissNearby = () => false;

  function nodeName(node) {
    return (t === copy.zh && node.labelZh) || node.label;
  }

  function select(id) {
    selectedId = id;
    selectionRender();
  }

  function render() {
    dismissNearby();
    const compact = Boolean(options.compact);
    const title = compact ? t.routeTitle : t.title;
    const root = element(compact ? "div" : "section", compact ? "lnm lnm-compact" : "lnm");
    if (!compact) root.setAttribute("aria-label", title);
    const head = element("div", "lnm-head");
    const heading = element("div", "lnm-heading");
    const summary = element("div", "lnm-summary");
    const switches = element("div", "lnm-switches");
    const switchMode = (next) => {
      if (next === mode) return;
      mode = next;
      render();
      host.querySelector('[data-lnm-mode="' + mode + '"]').focus();
    };
    for (const [value, label] of [
      ["map", t.map],
      ["list", t.list]
    ]) {
      const control = button("lnm-switch", label, () => switchMode(value));
      control.dataset.lnmMode = value;
      control.setAttribute("aria-pressed", String(mode === value));
      switches.append(control);
    }
    if (!compact) heading.append(element("div", "lnm-kicker", t.eyebrow));
    heading.append(element("h3", "lnm-title", title));
    if (!compact && options.scopeLabel)
      heading.append(element("p", "lnm-scope", options.scopeLabel));
    for (const [label, count] of [
      [t.nodes, model.nodes.length],
      [t.lanes, model.edges.length],
      [t.shipments, model.shipments.length]
    ]) {
      const metric = element("div", "lnm-metric");
      metric.append(element("strong", "", count), element("span", "", label));
      summary.append(metric);
    }
    head.append(heading);
    if (!compact) head.append(summary);
    if (!compact || model.nodes.length > 1) head.append(switches);
    root.append(head);

    const body = element("div", "lnm-body");
    const stage = element("div", "lnm-stage");
    const aside = element("aside", "lnm-details");
    const brief = element("div", "lnm-brief");
    const selectControls = new Map();
    const routes = [];
    const pacific =
      model.edges.filter(({ segments }) => segments.length > 1).length > model.edges.length / 2;
    const byNodeId = new Map(model.nodes.map((node) => [node.id, node]));
    const byShipmentId = new Map(model.shipments.map((shipment) => [shipment.id, shipment]));

    function clearSelection() {
      const control = selectControls.get(selectedId);
      select(null);
      control?.focus();
    }

    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const closed = dismissNearby(true);
      if (!closed && (selectedId === null || !selectControls.size)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!closed) clearSelection();
    });

    function nodeButton(node, className, label, action = () => select(node.id)) {
      const control = button(
        className,
        `${nodeName(node)} · ${node.shipmentIds.length} ${t.shipments}`,
        action,
        label
      );
      control.setAttribute("aria-pressed", "false");
      selectControls.set(node.id, control);
      return control;
    }

    function drawMap() {
      const viewport = element("div", "lnm-viewport");
      const plane = element("div", "lnm-plane");
      const artwork = svgElement("svg", { viewBox: "0 0 1000 500", "aria-hidden": "true" });
      for (const x of pacific ? [-500, 500] : [0]) {
        artwork.append(svgElement("image", { href: land, x, width: 1000, height: 500 }));
      }
      for (const edge of model.edges) {
        const from = byNodeId.get(edge.from);
        const to = byNodeId.get(edge.to);
        const path = svgElement("path", { d: routePath(from, to, pacific), class: "lnm-route" });
        artwork.append(path);
        routes.push([edge, path]);
      }
      plane.append(artwork);
      const markers = [];
      let hovered = null;

      function nearestMarker(event) {
        const bounds = plane.getBoundingClientRect();
        let closest = null;
        let distance = 22 ** 2;
        for (const marker of markers) {
          const dx = event.clientX - bounds.left - marker.x * bounds.width;
          const dy = event.clientY - bounds.top - marker.y * bounds.height;
          const squared = dx ** 2 + dy ** 2;
          if (squared < distance) {
            closest = marker;
            distance = squared;
          }
        }
        return closest;
      }

      function activateMarker(marker, trigger) {
        const { width, height } = plane.getBoundingClientRect();
        const nearby = markers.filter(
          ({ x, y }) => Math.hypot((x - marker.x) * width, (y - marker.y) * height) <= 14
        );
        dismissNearby();
        if (nearby.length < 2) {
          select(marker.id);
          return;
        }

        const chooser = element("div", "lnm-nearby");
        chooser.setAttribute("role", "group");
        chooser.setAttribute("aria-label", t.nearby);
        const heading = element("div", "lnm-nearby-head");
        heading.append(
          element("strong", "", t.nearby),
          button("lnm-tool", t.closeNearby, () => dismissNearby(true), "×")
        );
        const choices = element("ul", "lnm-nearby-list");

        for (const item of nearby) {
          const node = byNodeId.get(item.id);
          const count = `${node.shipmentIds.length} ${t.shipments}`;
          const metadata = [node.locode || node.countryCode, count].filter(Boolean).join(" · ");
          const option = button(
            "lnm-node-row",
            `${nodeName(node)} · ${metadata}`,
            () => {
              select(node.id);
              dismissNearby();
              item.control.focus();
            },
            ""
          );
          const content = element("span", "lnm-node-copy");
          content.append(element("strong", "", nodeName(node)), element("small", "", metadata));
          option.append(content);
          const row = element("li");
          row.append(option);
          choices.append(row);
        }
        choices.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          const row = event.target.closest("li");
          const next =
            event.key === "ArrowUp" ? row?.previousElementSibling : row?.nextElementSibling;
          event.preventDefault();
          next?.querySelector("button").focus();
        });
        chooser.append(heading, choices);
        stage.append(chooser);

        const outside = new AbortController();
        document.addEventListener(
          "pointerdown",
          (event) => {
            if (!chooser.contains(event.target) && !event.target.closest(".lnm-pin"))
              dismissNearby();
          },
          { capture: true, signal: outside.signal }
        );
        dismissNearby = (restoreFocus = false) => {
          outside.abort();
          chooser.remove();
          dismissNearby = () => false;
          if (restoreFocus) trigger.focus();
          return true;
        };
        choices.querySelector("button").focus();
      }

      function showHover(marker) {
        if (marker === hovered) return;
        hovered?.control.classList.remove("lnm-pin-hovered");
        hovered = marker;
        hovered?.control.classList.add("lnm-pin-hovered");
      }

      viewport.addEventListener("pointermove", (event) => {
        if (event.pointerType === "mouse") {
          showHover(event.target.closest(".lnm-pin") ? nearestMarker(event) : null);
        }
      });
      viewport.addEventListener("pointerleave", () => showHover(null));
      for (const node of model.nodes) {
        const [x, y] = project(node, pacific);
        const control = nodeButton(node, "lnm-pin", "", (event) => {
          activateMarker((event.detail && nearestMarker(event)) || marker, control);
        });
        const marker = { id: node.id, control, x, y };
        markers.push(marker);
        control.style.left = `${x * 100}%`;
        control.style.top = `${y * 100}%`;
        control.title = nodeName(node);
        control.addEventListener("focus", () => {
          if (!zoomIndex || !control.matches(":focus-visible")) return;
          const zoom = zoomLevels[zoomIndex];
          pan = [x, y].map((value, index) => {
            const offset = (value - 0.5) * zoom + pan[index];
            return pan[index] + Math.max(-0.44, Math.min(0.44, offset)) - offset;
          });
          position();
        });
        const label = element("span", "lnm-pin-label", nodeName(node));
        label.setAttribute("aria-hidden", "true");
        label.classList.toggle("lnm-pin-label-left", x > 0.67);
        control.append(label);
        plane.append(control);
      }
      viewport.append(plane);
      viewport.tabIndex = 0;
      viewport.setAttribute("aria-label", t.navigation);
      const tools = element("div", "lnm-tools");
      const zoomIn = button("lnm-tool", t.zoomIn, () => changeZoom(zoomIndex + 1), "+");
      const zoomOut = button("lnm-tool", t.zoomOut, () => changeZoom(zoomIndex - 1), "−");
      const reset = button("lnm-tool", t.reset, () => changeZoom(0), "↺");
      tools.append(zoomOut, zoomIn);
      if (!compact) tools.append(reset);
      function position() {
        const zoom = zoomLevels[zoomIndex];
        const limit = (zoom - 1) / 2;
        pan = pan.map((value) => Math.max(-limit, Math.min(limit, value)));
        plane.style.transform = `translate(${pan[0] * 100}%, ${pan[1] * 100}%) scale(${zoom})`;
        plane.style.setProperty("--lnm-marker-scale", 1 / zoom);
        viewport.classList.toggle("lnm-pannable", zoom > 1);
        zoomIn.setAttribute("aria-disabled", String(zoomIndex === zoomLevels.length - 1));
        zoomOut.setAttribute("aria-disabled", String(zoomIndex === 0));
        reset.setAttribute("aria-disabled", String(zoomIndex === 0));
      }
      function changeZoom(next) {
        if (next === zoomIndex || !zoomLevels[next]) return;
        const factor = zoomLevels[next] / zoomLevels[zoomIndex];
        pan = pan.map((value) => value * factor);
        zoomIndex = next;
        position();
      }
      const arrows = {
        ArrowLeft: [1, 0],
        ArrowRight: [-1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1]
      };
      viewport.addEventListener("keydown", (event) => {
        const direction = arrows[event.key];
        if (!direction) return;
        const source = markers.find(({ control }) => control === event.target);
        if (source) {
          event.preventDefault();
          event.stopPropagation();
          let nearest = null;
          let bestScore = Infinity;
          for (const marker of markers) {
            const dx = (marker.x - source.x) * 2;
            const dy = marker.y - source.y;
            const forward = -(dx * direction[0] + dy * direction[1]);
            if (forward <= 0) continue;
            const sideways = dx * direction[1] - dy * direction[0];
            const score = forward ** 2 + 2 * sideways ** 2;
            if (score < bestScore) {
              bestScore = score;
              nearest = marker;
            }
          }
          nearest?.control.focus();
          return;
        }
        if (event.target !== viewport || !zoomIndex) return;
        event.preventDefault();
        pan = pan.map((value, i) => value + direction[i] * 0.1);
        position();
      });
      let drag = null;
      viewport.addEventListener("pointerdown", (event) => {
        if (!zoomIndex || event.button !== 0 || event.target.closest("button")) return;
        drag = { id: event.pointerId, point: [event.clientX, event.clientY], start: pan };
        viewport.setPointerCapture(event.pointerId);
      });
      viewport.addEventListener("pointermove", (event) => {
        if (drag?.id !== event.pointerId) return;
        pan = [
          drag.start[0] + (event.clientX - drag.point[0]) / viewport.clientWidth,
          drag.start[1] + (event.clientY - drag.point[1]) / viewport.clientHeight
        ];
        position();
      });
      viewport.addEventListener("lostpointercapture", () => {
        drag = null;
      });
      position();
      stage.append(viewport, tools);
    }

    function drawList() {
      const list = element("ul", "lnm-node-list");
      const nodes = [...model.nodes].sort((a, b) =>
        nodeName(a).localeCompare(nodeName(b), t === copy.zh ? "zh" : "en")
      );
      for (const node of nodes) {
        const entry = element("li");
        const control = nodeButton(node, "lnm-node-row", "");
        const copyBlock = element("span", "lnm-node-copy");
        copyBlock.append(
          element("strong", "", nodeName(node)),
          element("small", "", node.roles.map((role) => roleLabel(t, role)).join(" · "))
        );
        control.append(copyBlock, element("span", "lnm-node-count", node.shipmentIds.length));
        entry.append(control);
        list.append(entry);
      }
      stage.append(list);
    }

    function drawSelection() {
      const node = model.nodes.find((item) => item.id === selectedId);
      for (const [id, control] of selectControls)
        control.setAttribute("aria-pressed", String(id === selectedId));
      for (const [edge, path] of routes) {
        path.classList.toggle(
          "lnm-route-active",
          Boolean(node && (edge.from === node.id || edge.to === node.id))
        );
      }
      stage.classList.toggle("lnm-has-selection", Boolean(node));
      if (mode === "map") {
        const priority = [...model.nodes].sort(
          (a, b) =>
            Number(b.id === selectedId) - Number(a.id === selectedId) ||
            b.shipmentIds.length - a.shipmentIds.length
        );
        const labeled = [];
        for (const candidate of priority) {
          const [x, y] = project(candidate, pacific);
          const visible =
            labeled.length < 4 &&
            !labeled.some(([left, top]) => Math.abs(x - left) < 0.17 && Math.abs(y - top) < 0.075);
          selectControls.get(candidate.id).classList.toggle("lnm-pin-priority", visible);
          if (visible) labeled.push([x, y]);
        }
      }
      if (compact) {
        const first = model.nodes.find((item) => item.roles.includes("origin")) || model.nodes[0];
        const last =
          model.nodes.findLast((item) => item.roles.includes("destination")) || model.nodes.at(-1);
        const names =
          first.id === last.id ? nodeName(first) : `${nodeName(first)} → ${nodeName(last)}`;
        const label = element("strong", "lnm-brief-route", names);
        label.title = names;
        brief.replaceChildren(label);
        if (node) {
          const metadata = [nodeName(node), node.locode].filter(Boolean).join(" · ");
          const current = element("span", "lnm-brief-node", metadata);
          current.title = metadata;
          current.setAttribute("aria-live", "polite");
          brief.append(current);
        }
        brief.append(element("span", "lnm-brief-caption", t.connection));
        return;
      }
      aside.replaceChildren();
      const detailHead = element("div", "lnm-detail-head");
      const detailCopy = element("div");
      detailCopy.append(
        element("div", "lnm-kicker", t.mappedNode),
        element("h4", "lnm-detail-title", node ? nodeName(node) : t.choose)
      );
      if (node) {
        const metadata = [
          nodeName(node) !== node.label && node.label,
          node.locode,
          node.countryCode
        ].filter(Boolean);
        if (metadata.length) detailCopy.append(element("p", "lnm-node-meta", metadata.join(" · ")));
      }
      detailHead.append(detailCopy);
      if (node) {
        detailHead.append(button("lnm-tool", t.close, clearSelection, "×"));
      }
      aside.append(detailHead);
      if (!node) {
        aside.append(element("p", "lnm-detail-hint", t.chooseHint));
        return;
      }
      const roles = element("div", "lnm-roles");
      for (const role of node.roles) roles.append(element("span", "", roleLabel(t, role)));
      aside.append(
        roles,
        element("h5", "lnm-related-title", `${t.related} · ${node.shipmentIds.length}`)
      );
      const list = element("ul", "lnm-related-list");
      for (const id of node.shipmentIds) {
        const shipment = byShipmentId.get(id);
        if (!shipment) continue;
        const row = element("li");
        const control = onOpenShipment
          ? button(
              "lnm-shipment",
              `${t.open} ${shipment.label}`,
              () => onOpenShipment(id, shipment),
              ""
            )
          : element("div", "lnm-shipment");
        const text = element("span", "lnm-shipment-copy");
        text.append(element("strong", "", shipment.label));
        const secondary = [shipment.carrier, shipment.status].filter(Boolean).join(" · ");
        if (secondary) text.append(element("small", "", secondary));
        const event = shipment.latestEvent;
        if (event) {
          const details = [event.name, event.location, event.reportedTime || event.occurredAt]
            .filter(Boolean)
            .join(" · ");
          text.append(element("small", "lnm-shipment-event", `${t.latest} · ${details}`));
        } else if (shipment.updatedAt) {
          text.append(element("small", "", `${t.updated} · ${shipment.updatedAt}`));
        }
        control.append(text);
        if (onOpenShipment) {
          const arrow = element("span", "lnm-open-icon", "↗");
          arrow.setAttribute("aria-hidden", "true");
          control.append(arrow);
        }
        row.append(control);
        list.append(row);
      }
      aside.append(list);
    }

    const stateLabel = options.loading
      ? t.loading
      : options.error
        ? t.error
        : compact && !model.nodes.length && !model.unresolved.length
          ? t.noRouteLocations
          : !model.shipments.length
            ? t.empty
            : !model.nodes.length
              ? t.noNodes
              : "";
    if (stateLabel) {
      const status = element("p", "lnm-state", stateLabel);
      status.setAttribute("role", "status");
      const state = element("div", "lnm-state-group");
      state.append(status);
      if (options.error && onRetry && !options.loading) {
        state.append(button("lnm-switch lnm-retry", t.retry, () => onRetry()));
      }
      stage.append(state);
    } else {
      if (mode === "map") drawMap();
      else drawList();
      drawSelection();
      selectionRender = drawSelection;
    }
    body.append(stage);
    if (!stateLabel && !compact) body.append(aside);
    root.append(body);
    if (!stateLabel && compact) root.append(brief);
    if (model.nodes.length && !stateLabel && !compact) {
      const legend = element("div", "lnm-legend");
      legend.append(
        element("span", "lnm-legend-dot", t.mappedNode),
        element("span", "lnm-legend-line", t.connection),
        element("p", "", t.routeNote)
      );
      root.append(legend);
    }
    const unmappedCount = model.shipments.filter((shipment) => !shipment.hasLocations).length;
    if (unmappedCount && !compact) {
      root.append(element("p", "lnm-coverage", `${t.noLocation} · ${unmappedCount}`));
    }
    if (model.unresolved.length && !options.loading && !options.error) {
      const unresolved = element("details", "lnm-unresolved");
      unresolved.open = compact && !model.nodes.length;
      unresolved.append(element("summary", "", `${t.unmapped} · ${model.unresolved.length}`));
      const list = element("ul");
      for (const item of model.unresolved) {
        const parts = [
          item.label,
          item.role && roleLabel(t, item.role),
          !compact && byShipmentId.get(item.shipmentId)?.label
        ];
        list.append(element("li", "", parts.filter(Boolean).join(" · ")));
      }
      unresolved.append(list);
      root.append(unresolved);
    }
    host.replaceChildren(root);
  }

  return {
    update(records, nextOptions = {}) {
      options = nextOptions;
      t = /^zh(?:[-_]|$)/i.test(options.language || "") ? copy.zh : copy.en;
      model = options.loading || options.error ? emptyModel : buildLogisticsMapModel(records);
      if (!options.loading && !options.error && model.nodes.length) {
        const current = model.nodes.some(({ id }) => id === selectedId);
        if (!selectionInitialized || (selectedId !== null && !current)) {
          const busiest = model.nodes.reduce((best, node) =>
            node.shipmentIds.length > best.shipmentIds.length ? node : best
          );
          selectedId = busiest.id;
        }
        selectionInitialized = true;
      }
      render();
    },
    destroy() {
      dismissNearby();
      host.replaceChildren();
      selectionRender = () => {};
    }
  };
}
