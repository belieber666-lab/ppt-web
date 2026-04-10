#!/usr/bin/env node
/**
 * 将 Next.js 开发工具弹窗改为中文
 * 在 npm install 后自动执行
 */
const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "../node_modules/next/dist/compiled/next-devtools/index.js"
);

if (!fs.existsSync(filePath)) {
  console.log("[patch-next-devtools-zh] 未找到 next-devtools，跳过");
  process.exit(0);
}

let content = fs.readFileSync(filePath, "utf8");
const replacements = [
  [/\blabel:"Route Info"/g, 'label:"路由信息"'],
  [/title:"Route Info"/g, 'title:"路由信息"'],
  [/\blabel:"Preferences"/g, 'label:"偏好设置"'],
  [/title:"Preferences"/g, 'title:"偏好设置"'],
  [/\blabel:"Route"/g, 'label:"路由"'],
  [/\blabel:"Bundler"/g, 'label:"打包器"'],
  [/\?"Static":"Dynamic"/g, '?"静态":"动态"'],
];

for (const [from, to] of replacements) {
  content = content.replace(from, to);
}
fs.writeFileSync(filePath, content);
console.log("[patch-next-devtools-zh] 已应用中文补丁");
