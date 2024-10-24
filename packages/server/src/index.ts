import http from "http";
import url from "url";
import fs from "fs";
import path from "path";
import os from "os";

import mime from "mime";

interface FileInfo {
  path: string;
  name: string;
  size: number;
  lastModified: string;
}

interface DirectoryInfo {
  path: string;
  name: string;
  children: (FileInfo | DirectoryInfo)[];
}

type FileTree = FileInfo | DirectoryInfo;

const PORT = 3000;

const ASSETS_DIR_NAME = path.join(process.cwd(), "assets");

const interfaces = os.networkInterfaces();

const serverIp = Object.values(interfaces)
  .flat()
  .find((alias) => alias?.family === "IPv4" && !alias.internal)?.address;

const getFileTree = (rootPath: string): DirectoryInfo => {
  const files = fs.readdirSync(rootPath, { withFileTypes: true });
  const fileTree: FileTree = {
    path: transformPath(rootPath),
    name: path.basename(rootPath),
    children: files.map((file) => {
      const filePath = path.join(rootPath, file.name);
      const stats = fs.statSync(filePath);
      const isDirectory = stats.isDirectory();
      if (isDirectory) return getFileTree(filePath);
      return {
        path: transformPath(filePath),
        name: path.basename(filePath),
        size: stats.size,
        lastModified: stats.mtime.toLocaleString(),
      };
    }),
  };
  return fileTree;
};

// 路径转换函数，将文件路径中 assets 之前的部分替换为服务器 IP 地址和端口
const transformPath = (filePath: string) => {
  return url.format(
    filePath.replace(ASSETS_DIR_NAME, `http://${serverIp}:${PORT}`),
  );
};

const server = http.createServer((req, res) => {
  // 处理 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  if (!req.url) {
    res.setHeader("Content-Type", "application/json");
    res.writeHead(400);
    return res.end(
      JSON.stringify({
        code: 400,
        message: "url is empty",
      }),
    );
  }
  const params = url.parse(req.url, true);
  if (params.pathname === "/api/getAssets") {
    try {
      const data = getFileTree(
        path.join(ASSETS_DIR_NAME, (params.query.type as string) || ""),
      );
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      return res.end(
        JSON.stringify({
          code: 200,
          data,
        }),
      );
    } catch {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(400);
      return res.end(
        JSON.stringify({
          code: 400,
          message: "未知错误",
          data: [],
        }),
      );
    }
  }
  // 如果请求的是文件路径
  const filePath = path.join(ASSETS_DIR_NAME, params.pathname as string);

  // 检查文件是否存在
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 Not Found");
    }

    // 动态获取 MIME 类型
    const mimeType = mime.getType(filePath) || "application/octet-stream";
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // 处理 Range 请求
    const range = req.headers.range;
    if (range) {
      const [unit, rangeStr] = range.split("=");
      if (unit === "bytes" && rangeStr) {
        const [startStr, endStr] = rangeStr.split("-");
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
          return res.end();
        }

        const chunkSize = end - start + 1;

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": mimeType,
        });

        // 创建读取文件部分内容的流
        const fileStream = fs.createReadStream(filePath, { start, end });
        fileStream.pipe(res);
        fileStream.on("error", (streamErr) => {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`500 Server Error: ${streamErr.message}`);
        });
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request: Invalid Range");
      }
    } else {
      res.writeHead(200, {
        "Content-Type": mimeType,
        "Content-Length": fileSize,
      });
      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
      readStream.on("error", (streamErr) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`500 Server Error: ${streamErr.message}`);
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`服务器运行在 http://${serverIp}:${PORT}/`);
});
