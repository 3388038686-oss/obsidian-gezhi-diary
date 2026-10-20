class TFile {}
const normalizePath = (p) => p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
class Notice { constructor() {} setMessage() { return this; } }
class App {}
class ItemView {}
module.exports = { moment: require("moment"), TFile, normalizePath, Notice, App, ItemView };
