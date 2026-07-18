import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  BalanceState,
  SceneCargo,
  SceneControllerCallbacks,
  SceneData,
  SceneRenderOptions,
  SceneViewPreset
} from "./packingSceneTypes";
import { translateUiText } from "../i18n/uiText";

const DEFAULT_OPTIONS: SceneRenderOptions = {
  showLabels: true,
  showAxes: true,
  axisScale: 1.25,
  showGrid: true,
  showCenter: true,
  showShell: true,
  showClearanceEnvelope: true,
  translucentCargo: false,
  showHeatmap: false,
  showRemaining: false,
  showMassBalance: true,
  sliceAxis: "none",
  slicePercent: 100,
  hiddenSkuKeys: new Set(),
  viewMode: "3d",
  locale: "zh-CN"
};

export class PackingSceneRenderer {
  private host: HTMLElement;
  private callbacks: SceneControllerCallbacks;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private root = new THREE.Group();
  private hoverMeshes: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private resizeObserver?: ResizeObserver;
  private frameId = 0;
  private data: SceneData | null = null;
  private balance: BalanceState | null = null;
  private options: SceneRenderOptions = DEFAULT_OPTIONS;
  private currentView: SceneViewPreset = "iso";
  private renderKey = "";
  private pulseMaterials: THREE.Material[] = [];

  constructor(host: HTMLElement, callbacks: SceneControllerCallbacks = {}) {
    this.host = host;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#f8fafc");
    this.scene.fog = new THREE.Fog("#f8fafc", 26, 62);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.82;
    this.controls.panSpeed = 0.68;

    this.scene.add(this.root);
    this.addLights();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.animate();
  }

  update(data: SceneData, balance: BalanceState, options: Partial<SceneRenderOptions> = {}) {
    const nextKey = `${data.container?.id || data.container?.name || "none"}-${data.cargos.length}-${data.stats.totalWeightKg}`;
    const dataChanged = nextKey !== this.renderKey;
    this.data = data;
    this.balance = balance;
    this.options = { ...DEFAULT_OPTIONS, ...this.options, ...options };
    this.renderKey = nextKey;
    this.draw();
    this.resize();
    this.controls.enableRotate = this.options.viewMode === "3d";
    if (dataChanged) this.setView("iso");
  }

  setOptions(options: Partial<SceneRenderOptions>) {
    this.options = { ...this.options, ...options };
    this.controls.enableRotate = this.options.viewMode === "3d";
    this.draw();
  }

  setView(view: SceneViewPreset) {
    this.currentView = view;
    const container = this.data?.container;
    if (!container) return;
    const target = new THREE.Vector3(0, container.heightCm * this.data!.scale * 0.34, 0);
    const distance = 18;
    const positions: Record<SceneViewPreset, THREE.Vector3> = {
      iso: new THREE.Vector3(12.5, 8.5, 12.5),
      top: new THREE.Vector3(0.01, distance, 0.01),
      front: new THREE.Vector3(0, 5.4, distance),
      side: new THREE.Vector3(distance, 5.2, 0)
    };
    this.camera.position.copy(positions[view]);
    this.controls.target.copy(view === "top" ? new THREE.Vector3(0, 0, 0) : target);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  zoom(multiplier: number) {
    const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const nextLength = THREE.MathUtils.clamp(direction.length() * multiplier, 4, 48);
    direction.setLength(nextLength);
    this.camera.position.copy(this.controls.target).add(direction);
    this.controls.update();
  }

  handlePointerMove(event: PointerEvent) {
    if (!this.hoverMeshes.length) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.hoverMeshes, false)[0];
    if (!hit) {
      this.callbacks.onHover?.(null);
      return null;
    }
    const item = hit.object.userData.item as SceneCargo;
    const payload = { item, clientX: event.clientX - rect.left, clientY: event.clientY - rect.top };
    this.callbacks.onHover?.(payload);
    return payload;
  }

  handlePointerLeave() {
    this.callbacks.onHover?.(null);
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.controls.dispose();
    this.disposeChildren(this.root);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#c6d2e0", 1.65));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
    keyLight.position.set(10, 17, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.left = -24;
    keyLight.shadow.camera.right = 24;
    keyLight.shadow.camera.top = 24;
    keyLight.shadow.camera.bottom = -24;
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#dbeafe", 1);
    fillLight.position.set(-12, 10, -10);
    this.scene.add(fillLight);
  }

  private draw() {
    this.disposeChildren(this.root);
    this.root.clear();
    this.hoverMeshes = [];
    this.pulseMaterials = [];
    if (!this.data?.container) return;
    const { container, scale } = this.data;
    this.root.scale.setScalar(scale);

    this.addFloor(container);
    if (this.options.showAxes) this.addCoordinateAxes(container);
    if (this.options.showShell) this.addContainerShell(container);
    if (this.options.showHeatmap && !this.data.stats.performanceMode) this.addHeatmap(container);
    if (this.options.showRemaining && !this.data.stats.performanceMode) this.addRemainingSpaces(container);
    this.addCargoMeshes(container);
    if (this.options.showMassBalance && this.balance?.valid) this.addMassBalance(container);
    if (this.balance?.valid && this.balance.severity !== "green") this.addHotZoneHighlight(container);
    if (this.options.sliceAxis !== "none") this.addSlicePlane(container);
  }

  private addFloor(container: any) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(container.lengthCm, container.widthCm),
      new THREE.MeshStandardMaterial({ color: "#eef7f3", roughness: 0.88, transparent: true, opacity: 0.82 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.34, 0);
    floor.receiveShadow = true;
    this.root.add(floor);

    if (!this.options.showGrid) return;
    const size = Math.max(container.lengthCm, container.widthCm);
    const divisions = Math.max(8, Math.round(size / 100));
    const grid = new THREE.GridHelper(size, divisions, "#8fb3da", "#d5e1ef");
    grid.position.set(0, -0.26, 0);
    grid.scale.x = container.lengthCm / size;
    grid.scale.z = container.widthCm / size;
    this.root.add(grid);
  }

  private addContainerShell(container: any) {
    const geometry = new THREE.BoxGeometry(container.lengthCm, container.heightCm, container.widthCm);
    const shell = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: "#9fb7d4", transparent: true, opacity: 0.15, depthWrite: false })
    );
    shell.position.set(0, container.heightCm / 2, 0);
    this.root.add(shell);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: "#165DFF", transparent: true, opacity: 0.86 })
    );
    edges.position.copy(shell.position);
    this.root.add(edges);

    this.addDimensionLabels(container);
  }

  private addDimensionLabels(container: any) {
    const y = container.heightCm + 18;
    const z = container.widthCm / 2 + 18;
    const x = container.lengthCm / 2 + 18;
    this.root.add(createTextSprite(this.t("scene.lengthCm", { value: container.lengthCm }), new THREE.Vector3(0, y, z), "#165DFF", 54));
    this.root.add(createTextSprite(this.t("scene.widthCm", { value: container.widthCm }), new THREE.Vector3(x, y, 0), "#165DFF", 54));
    this.root.add(createTextSprite(this.t("scene.heightCm", { value: container.heightCm }), new THREE.Vector3(x, container.heightCm / 2, z), "#165DFF", 54));
    [
      [-container.lengthCm / 2, -container.widthCm / 2],
      [container.lengthCm / 2, -container.widthCm / 2],
      [-container.lengthCm / 2, container.widthCm / 2],
      [container.lengthCm / 2, container.widthCm / 2]
    ].forEach(([cx, cz], index) => {
      this.root.add(createTextSprite(this.t("scene.corner", { value: index + 1 }), new THREE.Vector3(cx, 10, cz), "#64748b", 34));
    });
  }

  private addCoordinateAxes(container: any) {
    const origin = new THREE.Vector3(-container.lengthCm / 2, 4, -container.widthCm / 2);
    const axisScale = THREE.MathUtils.clamp(Number(this.options.axisScale || 1), 0.65, 1.9);
    const xLength = Math.max(95, Math.min(container.lengthCm * 0.36, 220)) * axisScale;
    const yLength = Math.max(80, Math.min(container.widthCm * 0.55, 165)) * axisScale;
    const zLength = Math.max(85, Math.min(container.heightCm * 0.58, 175)) * axisScale;
    const headLength = THREE.MathUtils.clamp(Math.min(xLength, yLength, zLength) * 0.16, 12, 44);
    const headWidth = headLength * 0.48;
    const labelGap = 22 * axisScale;

    this.root.add(this.axisArrow(new THREE.Vector3(1, 0, 0), origin, xLength, "#ef4444", headLength, headWidth));
    this.root.add(this.axisArrow(new THREE.Vector3(0, 0, 1), origin, yLength, "#10b981", headLength, headWidth));
    this.root.add(this.axisArrow(new THREE.Vector3(0, 1, 0), origin, zLength, "#2563eb", headLength, headWidth));
    this.root.add(createTextSprite(this.t("scene.origin"), origin.clone().add(new THREE.Vector3(-24, 16, -14)), "#0f172a", 42));
    this.root.add(createTextSprite(this.t("scene.axisX"), origin.clone().add(new THREE.Vector3(xLength + labelGap, 7, 0)), "#ef4444", 48));
    this.root.add(createTextSprite(this.t("scene.axisY"), origin.clone().add(new THREE.Vector3(0, 7, yLength + labelGap)), "#10b981", 48));
    this.root.add(createTextSprite(this.t("scene.axisZ"), origin.clone().add(new THREE.Vector3(0, zLength + labelGap, 0)), "#2563eb", 48));
  }

  private axisArrow(direction: THREE.Vector3, origin: THREE.Vector3, length: number, color: string, headLength: number, headWidth: number) {
    const arrow = new THREE.ArrowHelper(direction, origin, length, color, headLength, headWidth);
    arrow.renderOrder = 96;
    arrow.traverse((item: any) => {
      item.renderOrder = 96;
      if (item.material) {
        item.material.depthTest = false;
        item.material.depthWrite = false;
        item.material.transparent = true;
        item.material.opacity = 0.94;
      }
    });
    return arrow;
  }

  private t(key: string, params: Record<string, unknown> = {}) {
    return translateUiText(key, this.options.locale || "zh-CN", params);
  }

  private addCargoMeshes(container: any) {
    const labelsEnabled = this.options.showLabels && !this.data!.stats.performanceMode;
    this.data!.cargos
      .filter((cargo) => !this.options.hiddenSkuKeys.has(cargo.skuKey))
      .filter((cargo) => this.visibleBySlice(cargo, container))
      .forEach((cargo, index) => {
        const group = new THREE.Group();
        const layerTone = Math.min(0.16, Number(cargo.zCm || 0) / Math.max(1, container.heightCm) * 0.22);
        const color = new THREE.Color(cargo.color).offsetHSL(0, -0.03, layerTone - 0.04);
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.68,
          metalness: 0.04,
          transparent: true,
          opacity: this.options.translucentCargo ? 0.48 : 0.94
        });
        const envelopeOffset = new THREE.Vector3(
          cargo.xCm + cargo.lengthCm / 2 - (cargo.physicalXCm + cargo.physicalLengthCm / 2),
          cargo.zCm + cargo.heightCm / 2 - (cargo.physicalZCm + cargo.physicalHeightCm / 2),
          cargo.yCm + cargo.widthCm / 2 - (cargo.physicalYCm + cargo.physicalWidthCm / 2)
        );
        if (this.options.showClearanceEnvelope && cargo.hasClearance && !this.data!.stats.performanceMode) {
          const envelopeGeometry = new THREE.BoxGeometry(cargo.lengthCm, cargo.heightCm, cargo.widthCm);
          const envelopeMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.055,
            depthWrite: false
          });
          const envelope = new THREE.Mesh(envelopeGeometry, envelopeMaterial);
          envelope.position.copy(envelopeOffset);
          envelope.userData.item = cargo;
          group.add(envelope);
          this.hoverMeshes.push(envelope);
          const envelopeEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(envelopeGeometry),
            new THREE.LineBasicMaterial({ color: "#2563eb", transparent: true, opacity: 0.38 })
          );
          envelopeEdges.position.copy(envelopeOffset);
          group.add(envelopeEdges);
        }
        const geometry = new THREE.BoxGeometry(cargo.physicalLengthCm, cargo.physicalHeightCm, cargo.physicalWidthCm);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.item = cargo;
        group.add(mesh);
        this.hoverMeshes.push(mesh);

        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: new THREE.Color(cargo.color).offsetHSL(0, -0.2, -0.18), transparent: true, opacity: 0.52 })
        );
        group.add(edge);

        const topLine = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.max(1, cargo.physicalLengthCm * 0.92), Math.max(1, cargo.physicalWidthCm * 0.92)),
          new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.16, depthWrite: false })
        );
        topLine.rotation.x = -Math.PI / 2;
        topLine.position.y = cargo.physicalHeightCm / 2 + 0.08;
        group.add(topLine);

        if (labelsEnabled) {
          group.add(createTextSprite(`#${cargo.displayNo}`, new THREE.Vector3(0, cargo.physicalHeightCm / 2 + 6, 0), "#0f172a", 30));
        }

        group.position.set(
          cargo.physicalXCm + cargo.physicalLengthCm / 2 - container.lengthCm / 2,
          cargo.physicalZCm + cargo.physicalHeightCm / 2,
          cargo.physicalYCm + cargo.physicalWidthCm / 2 - container.widthCm / 2
        );
        this.root.add(group);
      });
  }

  private addMassBalance(container: any) {
    const balance = this.balance!;
    const point = new THREE.Vector3(
      balance.center.xCm - container.lengthCm / 2,
      balance.center.zCm,
      balance.center.yCm - container.widthCm / 2
    );
    const geo = new THREE.Vector3(0, balance.geometricCenter.zCm, 0);
    const radius = Math.max(5, Math.max(container.lengthCm, container.widthCm, container.heightCm) * 0.014);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.45, 36, 22),
      new THREE.MeshBasicMaterial({ color: balance.sphereColor, depthTest: false, depthWrite: false })
    );
    marker.position.copy(point);
    marker.renderOrder = 90;
    this.root.add(marker);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 3.1, Math.max(0.9, radius * 0.18), 8, 56),
      new THREE.MeshBasicMaterial({ color: balance.sphereColor, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(point.x, 1.1, point.z);
    ring.renderOrder = 91;
    this.root.add(ring);

    if (this.options.showCenter) {
      this.addLine(new THREE.Vector3(-container.lengthCm / 2, geo.y, 0), new THREE.Vector3(container.lengthCm / 2, geo.y, 0), "#ffffff", 0.95, 92);
      this.addLine(new THREE.Vector3(0, geo.y, -container.widthCm / 2), new THREE.Vector3(0, geo.y, container.widthCm / 2), "#ffffff", 0.95, 92);
      this.addLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, container.heightCm, 0), "#ffffff", 0.75, 92);
      this.addLine(geo, point, balance.sphereColor, 0.58, 91);
      this.root.add(createTextSprite("几何中心", new THREE.Vector3(0, geo.y + 10, 0), "#ffffff", 30));
      this.root.add(createTextSprite("货物重心", point.clone().add(new THREE.Vector3(0, radius * 3.2, 0)), balance.sphereColor, 32));
    }
  }

  private addLine(from: THREE.Vector3, to: THREE.Vector3, color: string, opacity: number, renderOrder = 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
    );
    line.renderOrder = renderOrder;
    this.root.add(line);
  }

  private addHeatmap(container: any) {
    const loads = this.balance?.loads || {};
    const zones = [
      { key: "frontLeft", x: -container.lengthCm / 4, z: -container.widthCm / 4, value: Number(loads.frontLeftPercent || 0) },
      { key: "frontRight", x: -container.lengthCm / 4, z: container.widthCm / 4, value: Number(loads.frontRightPercent || 0) },
      { key: "rearLeft", x: container.lengthCm / 4, z: -container.widthCm / 4, value: Number(loads.rearLeftPercent || 0) },
      { key: "rearRight", x: container.lengthCm / 4, z: container.widthCm / 4, value: Number(loads.rearRightPercent || 0) }
    ];
    zones.forEach((zone) => {
      const intensity = Math.min(1, zone.value / 40);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(container.lengthCm / 2, container.widthCm / 2),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color("#f97316").lerp(new THREE.Color("#dc2626"), intensity),
          transparent: true,
          opacity: 0.08 + intensity * 0.2,
          depthWrite: false
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(zone.x, 0.05, zone.z);
      this.root.add(mesh);
    });
  }

  private addHotZoneHighlight(container: any) {
    const hotZones = this.balance?.hotZones || [];
    if (!hotZones.length) return;
    const severityColor = this.balance?.severity === "red" ? "#ef4444" : "#f59e0b";
    const zones = resolveZoneBoxes(container, hotZones);
    zones.forEach((zone) => {
      const material = new THREE.MeshBasicMaterial({ color: severityColor, transparent: true, opacity: 0.12, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(zone.length, container.heightCm, zone.width), material);
      mesh.position.set(zone.x, container.heightCm / 2, zone.z);
      mesh.renderOrder = 60;
      this.pulseMaterials.push(material);
      this.root.add(mesh);
    });
  }

  private addSlicePlane(container: any) {
    const { sliceAxis, slicePercent } = this.options;
    const percent = THREE.MathUtils.clamp(slicePercent, 0, 100) / 100;
    let geometry: THREE.PlaneGeometry;
    let position: THREE.Vector3;
    let rotation = new THREE.Euler();
    let label = "";
    if (sliceAxis === "z") {
      geometry = new THREE.PlaneGeometry(container.lengthCm, container.widthCm);
      position = new THREE.Vector3(0, container.heightCm * percent, 0);
      rotation.x = -Math.PI / 2;
      label = `Z ${Math.round(container.heightCm * percent)} cm`;
    } else if (sliceAxis === "x") {
      geometry = new THREE.PlaneGeometry(container.widthCm, container.heightCm);
      position = new THREE.Vector3(container.lengthCm * percent - container.lengthCm / 2, container.heightCm / 2, 0);
      rotation.y = Math.PI / 2;
      label = `X ${Math.round(container.lengthCm * percent)} cm`;
    } else if (sliceAxis === "y") {
      geometry = new THREE.PlaneGeometry(container.lengthCm, container.heightCm);
      position = new THREE.Vector3(0, container.heightCm / 2, container.widthCm * percent - container.widthCm / 2);
      label = `Y ${Math.round(container.widthCm * percent)} cm`;
    } else {
      return;
    }
    const plane = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: "#165DFF", transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    plane.position.copy(position);
    plane.rotation.copy(rotation);
    this.root.add(plane);
    this.root.add(createTextSprite(label, position.clone().add(new THREE.Vector3(0, 12, 0)), "#165DFF", 32));
  }

  private addRemainingSpaces(container: any) {
    const spaces = buildRemainingSpaces(container, this.data!.cargos);
    const material = new THREE.MeshBasicMaterial({ color: "#8bc36d", transparent: true, opacity: 0.1, depthWrite: false });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: "#4d8f34", transparent: true, opacity: 0.24 });
    spaces.forEach((space) => {
      const geometry = new THREE.BoxGeometry(space.lengthCm, space.heightCm, space.widthCm);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        space.xCm + space.lengthCm / 2 - container.lengthCm / 2,
        space.zCm + space.heightCm / 2,
        space.yCm + space.widthCm / 2 - container.widthCm / 2
      );
      this.root.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      this.root.add(edges);
    });
  }

  private visibleBySlice(cargo: SceneCargo, container: any) {
    const { sliceAxis, slicePercent } = this.options;
    if (sliceAxis === "none") return true;
    const percent = THREE.MathUtils.clamp(slicePercent, 0, 100) / 100;
    if (sliceAxis === "z") return cargo.zCm <= container.heightCm * percent + 0.1;
    if (sliceAxis === "x") return cargo.xCm <= container.lengthCm * percent + 0.1;
    if (sliceAxis === "y") return cargo.yCm <= container.widthCm * percent + 0.1;
    return true;
  }

  private animate() {
    this.frameId = requestAnimationFrame(() => this.animate());
    const time = performance.now() / 1000;
    this.pulseMaterials.forEach((material: any) => {
      material.opacity = 0.09 + Math.sin(time * 4) * 0.035 + 0.05;
      material.needsUpdate = true;
    });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private disposeChildren(group: THREE.Group) {
    group.traverse((object: any) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((material: any) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    });
  }
}

function createTextSprite(text: string, position: THREE.Vector3, color = "#0f172a", fontSize = 32) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = `700 ${fontSize}px Microsoft YaHei, Segoe UI, sans-serif`;
  const metrics = context.measureText(text);
  canvas.width = Math.ceil(metrics.width + 36);
  canvas.height = Math.ceil(fontSize + 24);
  context.font = `700 ${fontSize}px Microsoft YaHei, Segoe UI, sans-serif`;
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  roundRect(context, 0, 0, canvas.width, canvas.height, 10);
  context.fill();
  context.strokeStyle = "rgba(22, 93, 255, 0.22)";
  context.stroke();
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, 18, canvas.height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.copy(position);
  sprite.scale.set(canvas.width / 8, canvas.height / 8, 1);
  sprite.renderOrder = 100;
  return sprite;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function resolveZoneBoxes(container: any, zones: string[]) {
  const boxes: Array<{ x: number; z: number; length: number; width: number }> = [];
  const push = (x: number, z: number, length: number, width: number) => boxes.push({ x, z, length, width });
  if (zones.includes("front")) push(-container.lengthCm / 4, 0, container.lengthCm / 2, container.widthCm);
  if (zones.includes("rear")) push(container.lengthCm / 4, 0, container.lengthCm / 2, container.widthCm);
  if (zones.includes("left")) push(0, -container.widthCm / 4, container.lengthCm, container.widthCm / 2);
  if (zones.includes("right")) push(0, container.widthCm / 4, container.lengthCm, container.widthCm / 2);
  if (zones.includes("frontLeft")) push(-container.lengthCm / 4, -container.widthCm / 4, container.lengthCm / 2, container.widthCm / 2);
  if (zones.includes("frontRight")) push(-container.lengthCm / 4, container.widthCm / 4, container.lengthCm / 2, container.widthCm / 2);
  if (zones.includes("rearLeft")) push(container.lengthCm / 4, -container.widthCm / 4, container.lengthCm / 2, container.widthCm / 2);
  if (zones.includes("rearRight")) push(container.lengthCm / 4, container.widthCm / 4, container.lengthCm / 2, container.widthCm / 2);
  return boxes.slice(0, 4);
}

function buildRemainingSpaces(container: any, cargos: SceneCargo[]) {
  const xs = uniqueAxis([0, container.lengthCm, ...cargos.flatMap((item) => [item.xCm, item.xCm + item.lengthCm])], container.lengthCm);
  const ys = uniqueAxis([0, container.widthCm, ...cargos.flatMap((item) => [item.yCm, item.yCm + item.widthCm])], container.widthCm);
  const spaces: Array<{ xCm: number; yCm: number; zCm: number; lengthCm: number; widthCm: number; heightCm: number }> = [];
  const minHeight = Math.max(4, container.heightCm * 0.02);
  for (let yi = 0; yi < ys.length - 1; yi += 1) {
    const y1 = ys[yi];
    const y2 = ys[yi + 1];
    let run: any = null;
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      const x1 = xs[xi];
      const x2 = xs[xi + 1];
      const top = occupiedTopAtCell(x1, x2, y1, y2, cargos);
      const height = container.heightCm - top;
      const cell = height > minHeight ? { xCm: x1, yCm: y1, zCm: top, lengthCm: x2 - x1, widthCm: y2 - y1, heightCm: height } : null;
      if (cell && run && Math.abs(run.zCm - cell.zCm) < 0.1 && Math.abs(run.heightCm - cell.heightCm) < 0.1) {
        run.lengthCm += cell.lengthCm;
      } else {
        if (run) spaces.push(run);
        run = cell;
      }
    }
    if (run) spaces.push(run);
  }
  const minVolume = container.lengthCm * container.widthCm * container.heightCm * 0.0008;
  return spaces
    .filter((space) => space.lengthCm * space.widthCm * space.heightCm >= minVolume)
    .sort((a, b) => (b.lengthCm * b.widthCm * b.heightCm) - (a.lengthCm * a.widthCm * a.heightCm))
    .slice(0, 140);
}

function occupiedTopAtCell(x1: number, x2: number, y1: number, y2: number, cargos: SceneCargo[]) {
  return cargos.reduce((top, item) => {
    const ix1 = item.xCm;
    const ix2 = ix1 + item.lengthCm;
    const iy1 = item.yCm;
    const iy2 = iy1 + item.widthCm;
    const overlaps = ix1 < x2 - 0.001 && ix2 > x1 + 0.001 && iy1 < y2 - 0.001 && iy2 > y1 + 0.001;
    return overlaps ? Math.max(top, item.zCm + item.heightCm) : top;
  }, 0);
}

function uniqueAxis(values: number[], max: number) {
  return [...new Set(values
    .map((value) => Math.min(max, Math.max(0, Math.round(Number(value || 0) * 10) / 10)))
    .filter((value) => Number.isFinite(value)))]
    .sort((a, b) => a - b)
    .filter((value, index, all) => index === 0 || value - all[index - 1] > 0.1);
}
