/* ============================================================
 * 格间日记 Grid Diary v2.0
 * 源码分片，由 build.mjs 顺序拼接为单文件 main.js
 * 零运行时依赖：只需要 Obsidian 自带的 obsidian 模块
 * ============================================================ */
"use strict";
(function () {
/* 加载期冲突的轻量告警：只在视图类型撞名等异常时写一行，正常路径零开销 */
var __gdTrace = function (msg) { try { console.warn("[格间日记]", msg); } catch (e) { } };
const {
  Plugin, PluginSettingTab, ItemView, Modal, Setting, Notice, Platform,
  Menu, TFile, TFolder, MarkdownRenderer, normalizePath, setIcon
} = require("obsidian");
