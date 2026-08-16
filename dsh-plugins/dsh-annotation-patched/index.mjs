// dsh-annotation 的 Node half：浏览器端插件，Node 侧为空实现。
// 真实功能在 client.js（浏览器 bundle），经 dshClient 声明接入 dsh web。
export default {
  // [fix 2026-08-17] name 与独立 fork 包名对齐（@dsh-external/dsh-annotation-patched），与 client bundle exports.name 一致
  name: '@dsh-external/dsh-annotation-patched',
  apply() {},
}
