const fs = require("fs");
const path = require("path");
const { JSDOM } = require("C:/Users/13917/.workbuddy/binaries/node/workspace/node_modules/jsdom");

const ROOT = "E:/code/3_MY_Github/LittleText";
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const htmlNoScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");

const dom = new JSDOM(htmlNoScripts, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
});
const { window } = dom;

window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (!window.CSS) window.CSS = {};
if (!window.CSS.escape) window.CSS.escape = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
window.alert = () => {};
window.prompt = () => null;
window.confirm = () => true;

const files = [
  "js/tools/utils.js",
  "js/systems/jsonStorage.js",
  "js/systems/markdown.js",
  "js/service/globalData.js",
  "js/core/eventBus.js",
  "js/components/toast.js",
  "js/components/modal.js",
  "js/components/contextMenu.js",
  "js/components/NAV_LIST.js",
  "js/components/dialogAddPanel.js",
  "js/systems/cloudSync.js",
  "js/components/dialogGlobalSettingPanel.js",
  "js/components/componentTextareaContainer.js",
  "js/index.js",
];

for (const f of files) {
  const s = window.document.createElement("script");
  s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
  window.document.body.appendChild(s);
}

try { window.onload && window.onload(); } catch (e) { console.log("onload error:", e.message); }

// run everything in the window's global scope so lexical const globals are visible
function ev(expr) { return window.eval(expr); }

function navNames() {
  return ev(`[...document.querySelectorAll("#nav-content .nav-item")].map(n=>n.dataset.name)`);
}
function snapshot(tag) {
  console.log(`[${tag}] nav tabs:`, JSON.stringify(navNames()),
    "| isLockCurrent:", ev("GLOBAL_DATA.isLockCurrent"),
    "| currentPanel:", ev("GLOBAL_DATA.currentPanel"),
    "| panelList:", JSON.stringify(ev("JSON_STORAGE.get('panelList')")));
}
function doImport(jsonStr) {
  const r = ev(`JSON_STORAGE.importByJsonString(${JSON.stringify(jsonStr)})`);
  if (!r.ok) return { ok: false, error: r.error };
  ev("refreshAllFromStorage()");
  return { ok: true };
}
function resetOnlyDefault() {
  ev(`JSON_STORAGE.set('panelList',['default']);
      JSON_STORAGE.set('GLOBAL_DATA',{currentPanel:'default',lock:false,isLockCurrent:false});
      JSON_STORAGE.delete('panel:work'); JSON_STORAGE.delete('panel:study');
      refreshAllFromStorage();`);
}

console.log("=== initial ===");
snapshot("initial");

const normal = JSON.stringify({ app:"LittleText", schema:3, data:{
  panelList:["default","work","study"],
  "panel:default":{width:1,height:1,type:"SINGLE",createTime:1,cells:["d"]},
  "panel:work":{width:3,height:2,type:"CLASSICS",createTime:2,cells:["w1","","","","",""]},
  "panel:study":{width:2,height:2,type:"CLASSICS",createTime:3,cells:["s1","","",""]},
  GLOBAL_DATA:{currentPanel:"work",lock:false,isLockCurrent:false},
}});
console.log("\n=== Case 1: normal export (expect default,work,study) ===");
console.log("import:", JSON.stringify(doImport(normal)));
snapshot("after case1");

resetOnlyDefault();
const locked = JSON.stringify({ app:"LittleText", schema:3, data:{
  panelList:["default","work","study"],
  "panel:default":{width:1,height:1,type:"SINGLE",createTime:1,cells:["d"]},
  "panel:work":{width:3,height:2,type:"CLASSICS",createTime:2,cells:["w1","","","","",""]},
  "panel:study":{width:2,height:2,type:"CLASSICS",createTime:3,cells:["s1","","",""]},
  GLOBAL_DATA:{currentPanel:"work",lock:true,isLockCurrent:true},
}});
console.log("\n=== Case 2: import GLOBAL_DATA.isLockCurrent=true (expect bug -> only default) ===");
console.log("import:", JSON.stringify(doImport(locked)));
snapshot("after case2");

resetOnlyDefault();
const noList = JSON.stringify({ app:"LittleText", schema:3, data:{
  "panel:default":{width:1,height:1,type:"SINGLE",createTime:1,cells:["d"]},
  "panel:work":{width:3,height:2,type:"CLASSICS",createTime:2,cells:["w1","","","","",""]},
  "panel:study":{width:2,height:2,type:"CLASSICS",createTime:3,cells:["s1","","",""]},
  GLOBAL_DATA:{currentPanel:"default",lock:false,isLockCurrent:false},
}});
console.log("\n=== Case 3: import missing panelList (FIX: expect default,work,study) ===");
console.log("import:", JSON.stringify(doImport(noList)));
snapshot("after case3");

resetOnlyDefault();
// Case 4: panelList present but references a panel whose data is missing (dangling) + extra panel not listed
const partial = JSON.stringify({ app:"LittleText", schema:3, data:{
  panelList:["default","ghost"],
  "panel:default":{width:1,height:1,type:"SINGLE",createTime:1,cells:["d"]},
  "panel:work":{width:3,height:2,type:"CLASSICS",createTime:2,cells:["w1","","","","",""]},
  GLOBAL_DATA:{currentPanel:"default",lock:false,isLockCurrent:false},
}});
console.log("\n=== Case 4: dangling 'ghost' + unlisted 'work' (FIX: drop ghost, add work) ===");
console.log("import:", JSON.stringify(doImport(partial)));
snapshot("after case4");

resetOnlyDefault();
// Case 5: legacy format (no panel: keys, uses work-data / work-text-0) and no panelList
const legacy = JSON.stringify({ app:"LittleText", schema:2, data:{
  "work-data":{width:3,height:2,type:"CLASSICS",createTime:2},
  "work-text-0":"legacy w1",
  "work-text-1":"",
  "work-text-2":"",
  "work-text-3":"",
  "work-text-4":"",
  "work-text-5":"",
  GLOBAL_DATA:{currentPanel:"default",lock:false,isLockCurrent:false},
}});
console.log("\n=== Case 5: legacy -data format, no panelList (FIX: migrate + add work) ===");
console.log("import:", JSON.stringify(doImport(legacy)));
snapshot("after case5");
console.log("  panel:work migrated:", ev("JSON.stringify(JSON_STORAGE.getPanel('work'))"));
