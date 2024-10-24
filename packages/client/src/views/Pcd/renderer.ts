import { PerspectiveCamera, Points, Scene, WebGLRenderer } from "three";
import { createPointsByChunkData } from "./PCDChunkLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js";

type PointsType = ReturnType<PCDLoader["parse"]>;

class Renderer {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;

  el?: HTMLElement;
  ob?: ResizeObserver;
  stats?: Stats;

  pointCloud?: PointsType;
  memoryTimer?: number;
  pointCloudFolder?: GUI;
  pointCloudParams?: { count: number; progress: string };
  pointsList: PointsType[] = [];
  worker?: Worker;

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

    this.renderer.setAnimationLoop(() => this.render());
  }

  init(el: HTMLElement) {
    this.el = el;
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.camera.updateProjectionMatrix();
    el.appendChild(this.renderer.domElement);

    this.stats = new Stats();
    this.stats.dom.style.position = "absolute";
    el.appendChild(this.stats.dom);

    this.addGUI();

    this.ob = new ResizeObserver(() => this.resize());
    this.ob.observe(el);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.stats?.update();
  }

  resize() {
    if (!this.el) return;
    const { clientWidth, clientHeight } = this.el;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  resetPointCloud() {
    if (this.pointCloud) this.scene.remove(this.pointCloud);
    this.scene.remove(...this.pointsList);
    this.pointsList = [];
    this.updatePointCloudFolder({
      count: 0,
      progress: "0",
    });
  }

  loadPCD(urls: string[]) {
    this.resetPointCloud();
    if (!urls.length) return;

    const pcdLoader = new PCDLoader();
    const total = urls.length; // 总文件数
    const progressArray = new Array(total).fill(0); // 进度数组，保存每个文件的进度
    const prom = urls.map((url, index) => {
      return new Promise((resolve) => {
        pcdLoader.load(
          url,
          (points) => {
            this.scene.add(points);
            this.pointsList.push(points);
            resolve(null);
          },
          (ev) => {
            // 当前文件进度
            const currentProgress = ev.loaded / ev.total;
            // 更新当前文件的进度到进度数组
            progressArray[index] = currentProgress;
            // 计算整体进度
            const overallProgress =
              progressArray.reduce((acc, val) => acc + val, 0) / total;
            this.updatePointCloudFolder({
              count: this.pointsList.reduce(
                (acc, p) => acc + p.geometry.attributes.position.count,
                0,
              ),
              progress: (overallProgress * 100).toFixed(2),
            });
          },
        );
      });
    });
    Promise.all(prom).then(() => {
      const mergeGeometries = BufferGeometryUtils.mergeGeometries(
        this.pointsList.map((p) => p.geometry),
      );
      const points = new Points(mergeGeometries, this.pointsList[0].material);
      this.scene.remove(...this.pointsList);
      this.pointsList.length = 0;
      this.scene.add(points);
      this.pointCloud = points;
      this.updatePointCloudFolder({
        count: points.geometry.attributes.position.count,
        progress: "100",
      });
    });
  }

  loadPCDByChunk(urls: string[]) {
    if (this.worker) this.worker.terminate();
    this.resetPointCloud();
    if (!urls.length) return;

    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (ev) => {
      const { type, data } = ev.data;
      if (type === "progress") {
        const points = createPointsByChunkData(data);
        this.scene.add(points);
        this.pointsList.push(points);
        this.updatePointCloudFolder({
          count: this.pointsList.reduce(
            (acc, p) => acc + p.geometry.attributes.position.count,
            0,
          ),
          progress: ((data.loaded / data.total) * 100).toFixed(2),
        });
      } else if (type === "complete") {
        this.worker?.terminate();
        const mergeGeometries = BufferGeometryUtils.mergeGeometries(
          this.pointsList.map((p) => p.geometry),
        );
        const points = new Points(mergeGeometries, this.pointsList[0].material);
        this.scene.remove(...this.pointsList);
        this.pointsList.length = 0;
        this.scene.add(points);
        this.pointCloud = points;
        this.updatePointCloudFolder({
          count: points.geometry.attributes.position.count,
          progress: "100",
        });
      }
    };
    this.worker.postMessage({ urls: [...urls] });
  }

  addGUI() {
    const gui = new GUI();
    gui.domElement.style.position = "absolute";
    this.el?.appendChild(gui.domElement);

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

    this.pointCloudParams = {
      count: 0,
      progress: "0",
    };
    this.pointCloudFolder = gui.addFolder("点云统计");
    this.pointCloudFolder
      .add(this.pointCloudParams, "count")
      .name("点数")
      .disable();
    this.pointCloudFolder
      .add(this.pointCloudParams, "progress")
      .name("进度 (%)")
      .disable();
    this.pointCloudFolder.open();
  }

  updatePointCloudFolder(params: NonNullable<typeof this.pointCloudParams>) {
    if (!this.pointCloudParams) return;
    Object.assign(this.pointCloudParams, params);
    this.pointCloudFolder?.controllers.forEach((controller) =>
      controller.updateDisplay(),
    );
  }

  dispose() {
    clearInterval(this.memoryTimer);
    this.renderer.dispose();
    this.controls.dispose();
    this.ob?.disconnect();
  }
}

export default Renderer;
