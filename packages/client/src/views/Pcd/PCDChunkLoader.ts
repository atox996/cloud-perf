import {
  BufferGeometry,
  Color,
  FileLoader,
  Float32BufferAttribute,
  Int32BufferAttribute,
  LoadingManager,
  Points,
  PointsMaterial,
} from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

type PCDField =
  | "x"
  | "y"
  | "z"
  | "rgb"
  | "normal_x"
  | "normal_y"
  | "normal_z"
  | "intensity"
  | "label"
  | (string & {});

interface PCDHeader {
  count: number[];
  data: "ascii" | "binary_compressed" | "binary" | (string & {});
  fields: PCDField[];
  headerLen: number;
  height: number;
  offset: Record<PCDField, number>;
  points: number;
  rowSize: number;
  size: number[];
  str: string;
  type: string[];
  version: number | null;
  viewpoint: string;
  width: number;
}

interface ChunkData {
  position: number[];
  normal: number[];
  color: number[];
  intensity: number[];
  label: number[];
}

interface ParseProgress extends ChunkData {
  loaded: number;
  total: number;
}

type ParseReturnType = ReturnType<PCDLoader["parse"]>;

/**
 * 解压缩LZF
 * @param inData
 * @param outLength
 * @returns
 */
function decompressLZF(inData: Uint8Array, outLength: number) {
  const inLength = inData.length;
  const outData = new Uint8Array(outLength);
  let inPtr = 0;
  let outPtr = 0;
  let ctrl;
  let len;
  let ref;
  do {
    ctrl = inData[inPtr++];
    if (ctrl < 1 << 5) {
      ctrl++;
      if (outPtr + ctrl > outLength)
        throw new Error("Output buffer is not large enough");
      if (inPtr + ctrl > inLength) throw new Error("Invalid compressed data");
      do {
        outData[outPtr++] = inData[inPtr++];
      } while (--ctrl);
    } else {
      len = ctrl >> 5;
      ref = outPtr - ((ctrl & 0x1f) << 8) - 1;
      if (inPtr >= inLength) throw new Error("Invalid compressed data");
      if (len === 7) {
        len += inData[inPtr++];
        if (inPtr >= inLength) throw new Error("Invalid compressed data");
      }

      ref -= inData[inPtr++];
      if (outPtr + len + 2 > outLength)
        throw new Error("Output buffer is not large enough");
      if (ref < 0) throw new Error("Invalid compressed data");
      if (ref >= outPtr) throw new Error("Invalid compressed data");
      do {
        outData[outPtr++] = outData[ref++];
      } while (--len + 2);
    }
  } while (inPtr < inLength);

  return outData;
}

/**
 * 通过TextDecoder分块读取数据
 * @param param 参数
 * @param param.data 原始数据
 * @param param.onChunk 分块数据回调函数
 * @param param.chunkSize 分块大小
 */
function chunkByTextDecoder({
  data,
  onChunk,
  chunkSize = 1024 * 1024,
}: {
  data: ArrayBuffer;
  onChunk: (chunk: string, currentSize: number) => void;
  chunkSize?: number;
}) {
  let offset = 0;

  const totalSize = data.byteLength;

  const decoder = new TextDecoder();

  while (offset < totalSize) {
    // 计算当前块的大小
    const bufferEnd = Math.min(offset + chunkSize, totalSize);
    const buffer = data.slice(offset, bufferEnd);
    try {
      const chunk = decoder.decode(buffer);
      onChunk(chunk, bufferEnd);
      // 更新偏移量，并在必要时读取下一个块
      offset = bufferEnd;
    } catch (error) {
      console.error("Error reading data:", error);
      break;
    }
  }
}

/**
 * 通过DataView分块读取数据
 * @param param 参数
 * @param param.data 原始数据
 * @param param.onChunk 分块数据回调函数
 * @param param.chunkSize 分块大小
 */
function chunkByDataView({
  data,
  onChunk,
  chunkSize = 1024 * 1024,
}: {
  data: ArrayBuffer;
  onChunk: (chunk: DataView, currentSize: number) => void;
  chunkSize?: number;
}) {
  let offset = 0;
  const totalSize = data.byteLength;

  while (offset < totalSize) {
    // 计算当前块的大小
    const bufferEnd = Math.min(offset + chunkSize, totalSize);
    const chunk = new DataView(data.slice(offset, bufferEnd));

    onChunk(chunk, bufferEnd);

    offset = bufferEnd; // 更新偏移量
  }
}

/**
 * 通过分块数据创建点云
 * @param param 参数
 * @param position 位置数据
 * @param normal 法线数据
 * @param color 颜色数据
 * @param intensity 强度数据
 * @param label 标签数据
 * @returns Points 点云物体
 */
export function createPointsByChunkData({
  position,
  normal,
  color,
  intensity,
  label,
}: ChunkData) {
  const geometry = new BufferGeometry();
  if (position.length > 0)
    geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  if (normal.length > 0)
    geometry.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  if (color.length > 0)
    geometry.setAttribute("color", new Float32BufferAttribute(color, 3));
  if (intensity.length > 0)
    geometry.setAttribute(
      "intensity",
      new Float32BufferAttribute(intensity, 1),
    );
  if (label.length > 0)
    geometry.setAttribute("label", new Int32BufferAttribute(label, 1));

  geometry.computeBoundingSphere();

  const material = new PointsMaterial({ size: 0.005 });

  if (color.length > 0) {
    material.vertexColors = true;
  }
  return new Points(geometry, material);
}

/**
 * PCD分块加载器
 * @extends PCDLoader
 * @description 通过分块加载PCD文件
 */
export class PCDChunkLoader extends PCDLoader {
  chunkSize: number;
  littleEndian: boolean;

  /**
   * 实例化PCD分块加载器
   * @param chunkSize 分块大小 默认2MB
   * @param manager 加载管理器
   * @description chunkSize根据实际情况调整, 影响页面渲染性能
   */
  constructor(chunkSize = 1024 * 1024 * 2, manager?: LoadingManager) {
    super(manager);

    this.littleEndian = true;

    this.chunkSize = chunkSize;
  }

  load(
    url: string,
    onLoad: (data: Points<BufferGeometry, PointsMaterial>) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: unknown) => void,
    onParseProgress?: (data: ParseProgress) => void,
  ) {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(
      url,
      (data) => {
        try {
          onLoad(this.parse(data, onParseProgress)!);
        } catch (e) {
          if (onError) {
            onError(e);
          } else {
            console.error(e);
          }

          this.manager.itemError(url);
        }
      },
      onProgress,
      onError,
    );
  }

  loadAsync(
    url: string,
    onProgress?: (event: ProgressEvent) => void,
    onParseProgress?: (data: ParseProgress) => void,
  ) {
    return new Promise<Points<BufferGeometry, PointsMaterial>>(
      (resolve, reject) => {
        this.load(
          url,
          (data) => resolve(data),
          onProgress,
          reject,
          onParseProgress,
        );
      },
    );
  }

  /**
   * 解析PCD数据
   * @param data 原始数据
   * @param onProgress 解析进度回调
   * @returns Points 点云物体
   */
  parse(
    data: ArrayBuffer | string,
    onProgress?: (data: ParseProgress) => void,
  ) {
    if (typeof data === "string") return super.parse(data);
    const PCDHeader = this.parseHeader(data);
    if (!PCDHeader) throw new Error("Invalid PCD data");

    const points: ParseReturnType[] = [];

    if (PCDHeader.data === "ascii") {
      this.parseASCII({
        data,
        PCDHeader,
        onProgress: (data) => {
          onProgress?.(data);
          points.push(createPointsByChunkData(data));
        },
      });
    } else if (PCDHeader.data === "binary_compressed") {
      this.parseBinaryCompressed({
        data,
        PCDHeader,
        onProgress: (data) => {
          onProgress?.(data);
          points.push(createPointsByChunkData(data));
        },
      });
    } else if (PCDHeader.data === "binary") {
      this.parseBinary({
        data,
        PCDHeader,
        onProgress: (data) => {
          onProgress?.(data);
          points.push(createPointsByChunkData(data));
        },
      });
    }

    const mergeGeometries = BufferGeometryUtils.mergeGeometries(
      points.map((p) => p.geometry),
    );
    return new Points(mergeGeometries, points[0].material);
  }

  /**
   * 通过分块读取PCD文件头部信息
   * @param data 原始数据
   * @param chunkSize 分块大小
   * @returns PCD文件头部信息
   */
  parseHeader(data: ArrayBuffer, chunkSize = 200) {
    const PCDHeader = {} as PCDHeader;

    const decoder = new TextDecoder();
    let prevChunkText = "";
    let offset = 0;
    while (offset < data.byteLength) {
      const buffer = data.slice(offset, offset + chunkSize);
      const textData = decoder.decode(buffer);
      const totalText = prevChunkText + textData;
      const headerResult = totalText.search(/[\r\n]DATA\s(\S*)\s/i);
      if (headerResult > -1) {
        const result1 = totalText.search(/[\r\n]DATA\s(\S*)\s/i);
        const result2 = /[\r\n]DATA\s(\S*)\s/i.exec(
          totalText.slice(result1 - 1),
        );
        PCDHeader.data = result2![1];
        PCDHeader.headerLen = result2![0].length + result1;
        PCDHeader.str = totalText.slice(0, PCDHeader.headerLen);

        // remove comments

        PCDHeader.str = PCDHeader.str.replace(/#.*/gi, "");

        // parse

        const version = /^VERSION (.*)/im.exec(PCDHeader.str);
        const fields = /^FIELDS (.*)/im.exec(PCDHeader.str);
        const size = /^SIZE (.*)/im.exec(PCDHeader.str);
        const type = /^TYPE (.*)/im.exec(PCDHeader.str);
        const count = /^COUNT (.*)/im.exec(PCDHeader.str);
        const width = /^WIDTH (.*)/im.exec(PCDHeader.str);
        const height = /^HEIGHT (.*)/im.exec(PCDHeader.str);
        const viewpoint = /^VIEWPOINT (.*)/im.exec(PCDHeader.str);
        const points = /^POINTS (.*)/im.exec(PCDHeader.str);

        // evaluate

        if (version !== null) PCDHeader.version = parseFloat(version[1]);

        PCDHeader.fields = fields !== null ? fields[1].split(" ") : [];

        if (type !== null) PCDHeader.type = type[1].split(" ");

        if (width !== null) PCDHeader.width = parseInt(width[1]);

        if (height !== null) PCDHeader.height = parseInt(height[1]);

        if (viewpoint !== null) PCDHeader.viewpoint = viewpoint[1];

        if (points !== null) PCDHeader.points = parseInt(points[1], 10);

        if (PCDHeader.points === null)
          PCDHeader.points = PCDHeader.width * PCDHeader.height;

        if (size !== null) {
          PCDHeader.size = size[1].split(" ").map(function (x) {
            return parseInt(x, 10);
          });
        }

        if (count !== null) {
          PCDHeader.count = count[1].split(" ").map(function (x) {
            return parseInt(x, 10);
          });
        } else {
          PCDHeader.count = [];

          for (let i = 0, l = PCDHeader.fields.length; i < l; i++) {
            PCDHeader.count.push(1);
          }
        }

        PCDHeader.offset = {} as Record<PCDField, number>;

        let sizeSum = 0;

        for (let i = 0, l = PCDHeader.fields.length; i < l; i++) {
          if (PCDHeader.data === "ascii") {
            PCDHeader.offset[PCDHeader.fields[i]] = i;
          } else {
            PCDHeader.offset[PCDHeader.fields[i]] = sizeSum;
            sizeSum += PCDHeader.size[i] * PCDHeader.count[i];
          }
        }

        // for binary only

        PCDHeader.rowSize = sizeSum;

        return PCDHeader;
      }
      prevChunkText = totalText;
      offset += chunkSize;
    }
  }

  /**
   * 解析ASCII格式数据
   * @param param 参数
   * @param param.data 原始数据
   * @param param.PCDHeader PCD头信息
   * @param param.onLoad 解析完成回调
   * @param param.onProgress 解析进度回调
   * @param param.onError 解析错误回调
   */
  parseASCII({
    data,
    PCDHeader,
    onLoad,
    onProgress,
    onError,
  }: {
    data: ArrayBuffer;
    PCDHeader: PCDHeader;
    onLoad?: () => void;
    onProgress?: (data: ParseProgress) => void;
    onError?: (event: unknown) => void;
  }) {
    try {
      const position: number[] = [];
      const normal: number[] = [];
      const color: number[] = [];
      const intensity: number[] = [];
      const label: number[] = [];

      const c = new Color();
      const offset = PCDHeader.offset;
      let prevChunk = "";

      const parseRGB = (value: string, type: string) => {
        let rgb = parseFloat(value);
        if (type === "F") {
          const farr = new Float32Array(1);
          farr[0] = rgb;
          rgb = new Int32Array(farr.buffer)[0];
        }
        const r = ((rgb >> 16) & 0xff) / 255;
        const g = ((rgb >> 8) & 0xff) / 255;
        const b = (rgb & 0xff) / 255;
        c.set(r, g, b).convertSRGBToLinear();
        return [c.r, c.g, c.b];
      };

      const onChunk = (chunk: string, currentSize: number) => {
        const rows = (prevChunk + chunk).split("\n");
        prevChunk = rows.pop() || "";

        rows.forEach((row) => {
          if (!row.trim()) return;
          const line = row.split(" ");

          if (offset.x !== undefined) {
            position.push(parseFloat(line[offset.x]));
            position.push(parseFloat(line[offset.y]));
            position.push(parseFloat(line[offset.z]));
          }

          if (offset.rgb !== undefined) {
            const rgb_field_index = PCDHeader.fields.indexOf("rgb");
            const rgb_type = PCDHeader.type[rgb_field_index];
            const [r, g, b] = parseRGB(line[offset.rgb], rgb_type);
            color.push(r, g, b);
          }

          if (offset.normal_x !== undefined) {
            normal.push(parseFloat(line[offset.normal_x]));
            normal.push(parseFloat(line[offset.normal_y]));
            normal.push(parseFloat(line[offset.normal_z]));
          }

          if (offset.intensity !== undefined) {
            intensity.push(parseFloat(line[offset.intensity]));
          }

          if (offset.label !== undefined) {
            label.push(parseInt(line[offset.label]));
          }
        });
        onProgress?.({
          position: [...position],
          normal: [...normal],
          color: [...color],
          intensity: [...intensity],
          label: [...label],
          loaded: currentSize + PCDHeader.headerLen,
          total: data.byteLength,
        });
        position.length = 0;
        normal.length = 0;
        color.length = 0;
        intensity.length = 0;
        label.length = 0;
      };
      chunkByTextDecoder({
        data: data.slice(PCDHeader.headerLen),
        chunkSize: this.chunkSize,
        onChunk,
      });
      if (prevChunk) {
        onChunk(prevChunk, data.byteLength - PCDHeader.headerLen);
      }
      onLoad?.();
    } catch (error) {
      onError?.(error);
    }
  }

  /**
   * 解析Binary格式数据
   * @param param 参数
   * @param param.data 原始数据
   * @param param.PCDHeader PCD头信息
   * @param param.onLoad 解析完成回调
   * @param param.onProgress 解析进度回调
   * @param param.onError 解析错误回调
   */
  parseBinary({
    data,
    PCDHeader,
    onLoad,
    onProgress,
    onError,
  }: {
    data: ArrayBuffer;
    PCDHeader: PCDHeader;
    onLoad?: () => void;
    onProgress?: (data: ParseProgress) => void;
    onError?: (event: unknown) => void;
  }) {
    try {
      const position: number[] = [];
      const normal: number[] = [];
      const color: number[] = [];
      const intensity: number[] = [];
      const label: number[] = [];

      const c = new Color();

      const offset = PCDHeader.offset;

      const emitProgress = (loaded: number) => {
        if (
          position.length ||
          normal.length ||
          color.length ||
          intensity.length ||
          label.length
        ) {
          onProgress?.({
            position: [...position],
            normal: [...normal],
            color: [...color],
            intensity: [...intensity],
            label: [...label],
            loaded,
            total: data.byteLength,
          });
        }
      };

      let prevChunk: DataView | null = null;

      const onChunk = (chunk: DataView, currentSize: number) => {
        if (prevChunk) {
          // Combine prevChunk and current chunk
          const combinedBuffer = new Uint8Array(
            prevChunk.byteLength + chunk.byteLength,
          );
          combinedBuffer.set(new Uint8Array(prevChunk.buffer), 0);
          combinedBuffer.set(
            new Uint8Array(chunk.buffer),
            prevChunk.byteLength,
          );
          chunk = new DataView(combinedBuffer.buffer); // Use the combined buffer
          prevChunk = null;
        }
        const rowSize = PCDHeader.rowSize;
        const len = Math.floor(chunk.byteLength / rowSize);
        const completeBytes = len * rowSize;
        const remainderLength = chunk.byteLength - completeBytes;

        if (remainderLength > 0) {
          // Save remaining data for the next chunk
          const prevBuffer = new Uint8Array(remainderLength);
          prevBuffer.set(
            new Uint8Array(chunk.buffer, completeBytes, remainderLength),
          );
          prevChunk = new DataView(prevBuffer.buffer);
        }
        for (let row = 0; row < len; row++) {
          const baseOffset = row * rowSize;

          if (offset.x !== undefined) {
            position.push(
              chunk.getFloat32(baseOffset + offset.x, this.littleEndian),
            );
            position.push(
              chunk.getFloat32(baseOffset + offset.y, this.littleEndian),
            );
            position.push(
              chunk.getFloat32(baseOffset + offset.z, this.littleEndian),
            );
          }

          if (offset.rgb !== undefined) {
            const r = chunk.getUint8(baseOffset + offset.rgb + 2) / 255.0;
            const g = chunk.getUint8(baseOffset + offset.rgb + 1) / 255.0;
            const b = chunk.getUint8(baseOffset + offset.rgb) / 255.0;
            c.set(r, g, b).convertSRGBToLinear();
            color.push(c.r, c.g, c.b);
          }

          if (offset.normal_x !== undefined) {
            normal.push(
              chunk.getFloat32(baseOffset + offset.normal_x, this.littleEndian),
            );
            normal.push(
              chunk.getFloat32(baseOffset + offset.normal_y, this.littleEndian),
            );
            normal.push(
              chunk.getFloat32(baseOffset + offset.normal_z, this.littleEndian),
            );
          }

          if (offset.intensity !== undefined) {
            intensity.push(
              chunk.getFloat32(
                baseOffset + offset.intensity,
                this.littleEndian,
              ),
            );
          }

          if (offset.label !== undefined) {
            label.push(
              chunk.getInt32(baseOffset + offset.label, this.littleEndian),
            );
          }
        }

        emitProgress(currentSize + PCDHeader.headerLen);
        position.length = 0;
        normal.length = 0;
        color.length = 0;
        intensity.length = 0;
        label.length = 0;
      };

      chunkByDataView({
        data: data.slice(PCDHeader.headerLen),
        chunkSize: this.chunkSize,
        onChunk,
      });
      if (prevChunk) {
        onChunk(prevChunk, data.byteLength - PCDHeader.headerLen);
      }
      onLoad?.();
    } catch (error) {
      onError?.(error);
    }
  }

  /**
   * 解析BinaryCompressed格式数据
   * @param param 参数
   * @param param.data 原始数据
   * @param param.PCDHeader PCD头信息
   * @param param.onLoad 解析完成回调
   * @param param.onProgress 解析进度回调
   * @param param.onError 解析错误回调
   */
  parseBinaryCompressed({
    data,
    PCDHeader,
    onLoad,
    onProgress,
    onError,
  }: {
    data: ArrayBuffer;
    PCDHeader: PCDHeader;
    onLoad?: (data: ChunkData) => void;
    onProgress?: (data: ParseProgress) => void;
    onError?: (event: unknown) => void;
  }) {
    try {
      const position: number[] = [];
      const normal: number[] = [];
      const color: number[] = [];
      const intensity: number[] = [];
      const label: number[] = [];

      const c = new Color();

      const sizes = new Uint32Array(
        data.slice(PCDHeader.headerLen, PCDHeader.headerLen + 8),
      );
      const compressedSize = sizes[0];
      const decompressedSize = sizes[1];
      const decompressed = decompressLZF(
        new Uint8Array(data, PCDHeader.headerLen + 8, compressedSize),
        decompressedSize,
      );
      const dataview = new DataView(decompressed.buffer);

      const offset = PCDHeader.offset;

      // TODO: 将dataview分块
      for (let i = 0; i < PCDHeader.points; i++) {
        if (offset.x !== undefined) {
          const xIndex = PCDHeader.fields.indexOf("x");
          const yIndex = PCDHeader.fields.indexOf("y");
          const zIndex = PCDHeader.fields.indexOf("z");
          position.push(
            dataview.getFloat32(
              PCDHeader.points * offset.x + PCDHeader.size[xIndex] * i,
              this.littleEndian,
            ),
          );
          position.push(
            dataview.getFloat32(
              PCDHeader.points * offset.y + PCDHeader.size[yIndex] * i,
              this.littleEndian,
            ),
          );
          position.push(
            dataview.getFloat32(
              PCDHeader.points * offset.z + PCDHeader.size[zIndex] * i,
              this.littleEndian,
            ),
          );
        }

        if (offset.rgb !== undefined) {
          const rgbIndex = PCDHeader.fields.indexOf("rgb");

          const r =
            dataview.getUint8(
              PCDHeader.points * offset.rgb + PCDHeader.size[rgbIndex] * i + 2,
            ) / 255.0;
          const g =
            dataview.getUint8(
              PCDHeader.points * offset.rgb + PCDHeader.size[rgbIndex] * i + 1,
            ) / 255.0;
          const b =
            dataview.getUint8(
              PCDHeader.points * offset.rgb + PCDHeader.size[rgbIndex] * i + 0,
            ) / 255.0;

          c.set(r, g, b).convertSRGBToLinear();

          color.push(c.r, c.g, c.b);
        }

        if (offset.normal_x !== undefined) {
          const xIndex = PCDHeader.fields.indexOf("normal_x");
          const yIndex = PCDHeader.fields.indexOf("normal_y");
          const zIndex = PCDHeader.fields.indexOf("normal_z");
          normal.push(
            dataview.getFloat32(
              PCDHeader.points * offset.normal_x + PCDHeader.size[xIndex] * i,
              this.littleEndian,
            ),
          );
          normal.push(
            dataview.getFloat32(
              PCDHeader.points * offset.normal_y + PCDHeader.size[yIndex] * i,
              this.littleEndian,
            ),
          );
          normal.push(
            dataview.getFloat32(
              PCDHeader.points * offset.normal_z + PCDHeader.size[zIndex] * i,
              this.littleEndian,
            ),
          );
        }

        if (offset.intensity !== undefined) {
          const intensityIndex = PCDHeader.fields.indexOf("intensity");
          intensity.push(
            dataview.getFloat32(
              PCDHeader.points * offset.intensity +
                PCDHeader.size[intensityIndex] * i,
              this.littleEndian,
            ),
          );
        }

        if (offset.label !== undefined) {
          const labelIndex = PCDHeader.fields.indexOf("label");
          label.push(
            dataview.getInt32(
              PCDHeader.points * offset.label + PCDHeader.size[labelIndex] * i,
              this.littleEndian,
            ),
          );
        }
      }
      onProgress?.({
        position: [...position],
        normal: [...normal],
        color: [...color],
        intensity: [...intensity],
        label: [...label],
        loaded: 1,
        total: 1,
      });
      onLoad?.({
        position: [...position],
        normal: [...normal],
        color: [...color],
        intensity: [...intensity],
        label: [...label],
      });
    } catch (error) {
      onError?.(error);
    }
  }
}
