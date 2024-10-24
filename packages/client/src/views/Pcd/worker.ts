import { PCDChunkLoader } from "./PCDChunkLoader";

interface MessageData {
  urls: string[];
}

onmessage = async (ev: MessageEvent<MessageData>) => {
  const { urls } = ev.data;
  if (!urls.length) return;

  const pcdLoader = new PCDChunkLoader();
  const total = urls.length; // 总文件数
  const progressArray = new Array(total).fill(0); // 进度数组，保存每个文件的进度

  // 统一处理单个文件和多个文件的进度
  const prom = urls.map((url, index) =>
    pcdLoader.loadAsync(url, undefined, (ev) => {
      // 当前文件进度
      const currentProgress = ev.loaded / ev.total;

      // 更新当前文件的进度到进度数组
      progressArray[index] = currentProgress;

      // 计算整体进度
      const overallProgress =
        progressArray.reduce((acc, val) => acc + val, 0) / total;

      postMessage({
        type: "progress",
        data: {
          ...ev,
          loaded: overallProgress * total, // 整体加载进度
          total: total, // 总文件数
        },
      });
    }),
  );

  // 等待所有文件加载完成
  await Promise.all(prom);

  postMessage({
    type: "complete",
  });
};
