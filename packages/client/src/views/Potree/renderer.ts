import {
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import Stats from "three/examples/jsm/libs/stats.module.js";

import {
  ClipMode,
  PointCloudOctree,
  PointColorType,
  PointSizeType,
  Potree,
  type IClipBox,
  type PotreeVersion,
} from "@pnext/three-loader";
import type { NodeLoader } from "@pnext/three-loader/build/declarations/loading2/octree-loader";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

class Renderer {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  potree?: Potree;

  el?: HTMLElement;
  #elBBox?: DOMRect;
  get elBBox() {
    return this.#elBBox ?? (this.#elBBox = this.el!.getBoundingClientRect());
  }
  set elBBox(elBBox: DOMRect) {
    this.#elBBox = elBBox;
  }
  ob?: ResizeObserver;
  stats?: Stats;

  memoryTimer?: number;

  labelGroup: Group;
  pointClouds: PointCloudOctree[] = [];
  pointCloudParams = {
    visibleCount: 0,
    total: 0,
    limit: 0,
    size: 1,
    pointColorType: PointColorType.ELEVATION,
    color: 0x0000ff,
    clipMode: ClipMode.HIGHLIGHT_INSIDE,
  };
  pointCloudFolder?: GUI;

  transformControls: TransformControls;
  raycaster: Raycaster;
  pointer = new Vector2();
  intersectObjects: Mesh<BoxGeometry, MeshBasicMaterial>[] = [];
  intersected?: Mesh<BoxGeometry, MeshBasicMaterial>;

  onPointerMove = (e: MouseEvent) => {
    const elBBox = this.elBBox;
    if (!elBBox) return;
    this.pointer.x = ((e.clientX - elBBox.left) / elBBox.width) * 2 - 1;
    this.pointer.y = -((e.clientY - elBBox.top) / elBBox.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects<
      Mesh<BoxGeometry, MeshBasicMaterial>
    >(this.intersectObjects, false);
    if (intersects.length > 0) {
      if (this.intersected !== intersects[0].object) {
        this.intersected = intersects[0].object;
        this.transformControls.attach(this.intersected.parent!);
      }
    }
  };

  constructor() {
    this.renderer = new WebGLRenderer({
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.camera = new PerspectiveCamera();
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0, 0, 100);
    this.scene = new Scene();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.transformControls = new TransformControls(
      this.camera,
      this.renderer.domElement,
    );
    this.transformControls.addEventListener("dragging-changed", (event) => {
      this.controls.enabled = !event.value;
      console.log("dragging-changed");
    });
    this.scene.add(this.transformControls);

    this.labelGroup = new Group();
    this.scene.add(this.labelGroup);

    this.raycaster = new Raycaster();
    this.raycaster.layers.set(1);

    this.renderer.setAnimationLoop(() => this.render());
  }

  init(el: HTMLElement) {
    this.el = el;
    this.elBBox = el.getBoundingClientRect();
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.camera.updateProjectionMatrix();
    el.appendChild(this.renderer.domElement);

    this.stats = new Stats();
    this.stats.dom.style.position = "absolute";
    el.appendChild(this.stats.dom);

    document.addEventListener("contextmenu", this.onPointerMove);

    this.addGUI();

    this.ob = new ResizeObserver(() => this.resize());
    this.ob.observe(el);
  }

  render() {
    if (this.potree) {
      const updateResult = this.potree.updatePointClouds(
        this.pointClouds,
        this.camera,
        this.renderer,
      );

      this.updatePointCloudFolder({
        visibleCount: updateResult.numVisiblePoints,
        total: this.pointClouds.reduce(
          (acc, pco) =>
            acc + (pco.pcoGeometry.loader as NodeLoader).metadata.points,
          0,
        ),
        limit: this.potree.pointBudget,
      });
    }
    for (const pointCloud of this.pointClouds) {
      const clipBoxes = this.labelGroup.children
        .filter((child) => child instanceof Mesh || child instanceof Line)
        .map<IClipBox>((child) => {
          const obj = child as
            | Mesh<BufferGeometry, MeshBasicMaterial>
            | Line<BufferGeometry, LineBasicMaterial>;
          obj.updateMatrixWorld(true);
          obj.geometry.computeBoundingBox();
          const box: IClipBox = {
            box: obj.geometry.boundingBox!,
            inverse: obj.matrixWorld.clone().invert(),
            matrix: obj.matrixWorld.clone(),
            position: obj.position.clone(),
            color: obj.material.color.clone(),
          };
          return box;
        });

      pointCloud.material.setClipBoxes(clipBoxes);
    }

    this.renderer.render(this.scene, this.camera);
    this.stats?.update();
  }

  resize() {
    if (!this.el) return;
    this.elBBox = this.el.getBoundingClientRect();
    const { clientWidth, clientHeight } = this.el;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  clear() {
    this.scene.remove(...this.pointClouds);
    this.labelGroup.clear();
    this.intersectObjects = [];
    this.transformControls.detach();
    this.pointClouds = [];
  }

  randomBox?: LineSegments;

  load(fileName: string, baseUrl: string, version: PotreeVersion) {
    this.clear();
    this.potree = new Potree(version);
    this.potree
      .loadPointCloud(fileName, (name) => `${baseUrl}${name}`)
      .then((pco) => {
        pco.material.size = this.pointCloudParams.size;
        pco.material.pointSizeType = PointSizeType.FIXED;
        pco.material.pointColorType = PointColorType.ELEVATION;
        pco.material.clipMode = ClipMode.HIGHLIGHT_INSIDE;
        pco.material.elevationRange = [-5, 10];
        pco.material.gradient = [
          [0, new Color(0x00b4ff)],
          [1, new Color(0x000082)],
        ];
        this.scene.add(pco);
        this.pointClouds.push(pco);
      });
  }

  addGUI() {
    const gui = new GUI();
    gui.domElement.style.position = "absolute";
    this.el?.appendChild(gui.domElement);

    this.addMemoryFolder(gui);
    this.addControlerFolder(gui);
    this.addPointCloudFolder(gui);
  }

  addMemoryFolder(gui: GUI) {
    // 内存统计
    const memoryParams = {
      used: "0",
      total: "0",
      limit: "0",
      percentage: "0",
    };
    const memoryFolder = gui.addFolder("内存统计");
    memoryFolder.add(memoryParams, "used").name("已使用内存 (MB)").disable();
    memoryFolder.add(memoryParams, "total").name("分配的总内存 (MB)").disable();
    memoryFolder.add(memoryParams, "limit").name("内存上限 (MB)").disable();
    memoryFolder.add(memoryParams, "percentage").name("内存占比 (%)").disable();
    memoryFolder.open();
    this.memoryTimer = window.setInterval(() => {
      const { memory } = window.performance;
      if (memory) {
        memoryParams.used = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
        memoryParams.total = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
        memoryParams.limit = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
        memoryParams.percentage = (
          (+memoryParams.used / +memoryParams.limit) *
          100
        ).toFixed(2);
        memoryFolder.controllers.forEach((controller) =>
          controller.updateDisplay(),
        );
      }
    }, 1000);
  }

  addControlerFolder(gui: GUI) {
    const controlerFolder = gui.addFolder("控制");
    const controlerParams = {
      addRandomBox: () => {
        const geometry = new BoxGeometry();
        const material = new MeshBasicMaterial({
          color: controlerParams.color,
          transparent: true,
          opacity: 0.5,
        });
        const mesh = new Mesh(geometry, material);
        const edges = new EdgesGeometry(geometry);
        const line = new LineSegments(
          edges,
          new LineBasicMaterial({ color: controlerParams.color }),
        );
        // 生成随机位置在 -50 - 50 之间（x 和 y），z 固定为 0
        const randomX = Math.random() * 100 - 50;
        const randomY = Math.random() * 100 - 50;
        line.position.set(randomX, randomY, 0);
        // 生成随机尺寸在 10 - 20 之间
        const randomSize = Math.random() * 10 + 10;
        line.scale.setScalar(randomSize);

        line.updateMatrixWorld();
        mesh.matrixWorld.copy(line.matrixWorld);
        mesh.layers.set(1);

        line.add(mesh);
        this.labelGroup.add(line);

        this.transformControls.attach(line);
        this.intersectObjects.push(mesh);
        this.intersected = mesh;
      },
      color: 0xffffff,
    };
    controlerFolder
      .add(this.transformControls, "mode", {
        移动: "translate",
        缩放: "scale",
        旋转: "rotate",
      })
      .name("控制模式");
    controlerFolder.add(controlerParams, "addRandomBox").name("添加随机盒子");
    controlerFolder
      .addColor(controlerParams, "color")
      .name("当前盒子颜色")
      .onChange(() => {
        if (this.intersected) {
          this.intersected.material.color.set(controlerParams.color);
          if (this.intersected.parent instanceof LineSegments) {
            this.intersected.parent.material.color.set(controlerParams.color);
          }
        }
      });

    controlerFolder.open();
  }

  addPointCloudFolder(gui: GUI) {
    this.pointCloudFolder = gui.addFolder("点云统计");
    this.pointCloudFolder
      .add(this.pointCloudParams, "total")
      .name("总点数")
      .disable();
    this.pointCloudFolder
      .add(this.pointCloudParams, "visibleCount")
      .name("可视点数")
      .disable();
    this.pointCloudFolder
      .add(this.pointCloudParams, "limit")
      .name("可视上限")
      .onChange((value) => {
        if (!this.potree) return;
        this.potree.pointBudget = value;
      });
    this.pointCloudFolder
      .add(this.pointCloudParams, "size", 1, 8, 1)
      .name("点云大小")
      .onChange((value) => {
        this.pointClouds.forEach((pco) => {
          pco.material.size = value;
        });
      });
    this.pointCloudFolder
      .add(this.pointCloudParams, "clipMode", {
        DISABLED: ClipMode.DISABLED,
        CLIP_OUTSIDE: ClipMode.CLIP_OUTSIDE,
        HIGHLIGHT_INSIDE: ClipMode.HIGHLIGHT_INSIDE,
      })
      .name("裁剪模式")
      .onChange((value) => {
        if (!this.potree) return;
        this.pointClouds.forEach((pco) => {
          pco.material.clipMode = value;
        });
      });
    this.pointCloudFolder.open();
  }

  updatePointCloudFolder(params: Partial<typeof this.pointCloudParams>) {
    Object.assign(this.pointCloudParams, params);
    this.pointCloudFolder?.controllers.forEach((controller) =>
      controller.updateDisplay(),
    );
  }

  dispose() {
    this.clear();
    document.removeEventListener("mousemove", this.onPointerMove);
    clearInterval(this.memoryTimer);
    this.renderer.dispose();
    this.controls.dispose();
    this.ob?.disconnect();
  }
}

export default Renderer;
