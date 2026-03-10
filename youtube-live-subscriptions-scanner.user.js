// ==UserScript==
// @name         YouTube Live Subscriptions Scanner v7.2
// @namespace    https://yourname.github.io
// @version      7.2
// @description  Scan your YouTube subscriptions for live streams in real-time. Draggable and collapsible panel with live viewer counts.
// @author       Your Name
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      youtube.com
// @run-at       document-end
// @icon         https://www.google.com/s2/favicons?sz=64&domain=YouTube.com
// @homepageURL  https://yourname.github.io/youtube-live-scanner
// @supportURL   https://github.com/yourname/youtube-live-scanner/issues
// @downloadURL https://update.greasyfork.org/scripts/569042/YouTube%20Live%20Subscriptions%20Scanner%20v72.user.js
// @updateURL https://update.greasyfork.org/scripts/569042/YouTube%20Live%20Subscriptions%20Scanner%20v72.meta.js
// ==/UserScript==

(function(){

"use strict";

if(location.pathname !== "/") return;

const MAX_CONCURRENT = 12;
const RETRY_COUNT = 1;

let scanned = 0;
let foundLives = 0;
const displayed = new Set();
let panelCollapsed = false;

function createPanel(){

if(document.getElementById("ytLivePanel")) return;

const panel=document.createElement("div");

panel.id="ytLivePanel";

panel.style.position="fixed";
panel.style.top="120px";
panel.style.right="20px";
panel.style.width="380px";
panel.style.maxHeight="600px";
panel.style.overflow="auto";
panel.style.background="#181818";
panel.style.color="white";
panel.style.padding="10px";
panel.style.zIndex="99999";
panel.style.borderRadius="8px";

panel.innerHTML=`
<div id="ytLiveHeader" style="font-weight:bold;margin-bottom:5px;display:flex;justify-content:space-between;align-items:center;cursor:move;">
<span>Live Subscriptions</span>
<button id="ytToggleBtn" style="background:#3ea6ff;color:white;border:none;border-radius:3px;padding:1px 6px;cursor:pointer;">−</button>
</div>

<div id="ytLiveContent">

<div id="ytScanStatus" style="font-size:12px;margin-bottom:5px;">Scanning...</div>

<div style="background:#333;height:6px;width:100%;border-radius:3px;margin-bottom:8px;">
<div id="ytScanProgress" style="background:#3ea6ff;height:100%;width:0%;border-radius:3px;"></div>
</div>

<ul id="ytLiveList"></ul>

</div>
`;

document.body.appendChild(panel);

const toggleBtn=document.getElementById("ytToggleBtn");
const contentDiv=document.getElementById("ytLiveContent");

toggleBtn.addEventListener("click",()=>{
panelCollapsed=!panelCollapsed;
contentDiv.style.display=panelCollapsed?"none":"block";
toggleBtn.textContent=panelCollapsed?"+":"−";
});

let offsetX=0,offsetY=0,dragging=false;
const header=document.getElementById("ytLiveHeader");

header.addEventListener("mousedown",e=>{
dragging=true;
offsetX=e.clientX-panel.offsetLeft;
offsetY=e.clientY-panel.offsetTop;
document.body.style.userSelect="none";
});

document.addEventListener("mousemove",e=>{
if(dragging){
panel.style.left=(e.clientX-offsetX)+"px";
panel.style.top=(e.clientY-offsetY)+"px";
panel.style.right="auto";
}
});

document.addEventListener("mouseup",()=>{
dragging=false;
document.body.style.userSelect="auto";
});

}

async function getSubscribedChannels(){

const res=await fetch("https://www.youtube.com/feed/channels");

const text=await res.text();

const matches=[...text.matchAll(/"url":"(\/@[^"]+)"/g)];

const channels=matches.map(m=>"https://www.youtube.com"+m[1]);

return [...new Set(channels)];

}

function requestLivePage(url){

return new Promise(resolve=>{

GM_xmlhttpRequest({

method:"GET",

url:url,

onload:r=>resolve(r.responseText),

onerror:()=>resolve(null)

});

});

}

async function fetchLiveData(channel){

let html=null;

for(let i=0;i<=RETRY_COUNT;i++){

html=await requestLivePage(channel+"/live");

if(html) break;

}

if(!html) return null;

try{

const match=html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/);

if(!match) return null;

const data=JSON.parse(match[1]);

const details=data.videoDetails;

const status=data.playabilityStatus?.status;

if(!details) return null;

if(details.isLiveContent!==true) return null;

if(status!=="OK") return null;

const title=details.title||"Live";

const channelName=details.author||"";

let viewers=0;

viewers=parseInt(
data.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.concurrentViewers
);

if(!viewers){
viewers=parseInt(details.viewCount);
}

if(!viewers){
const m=html.match(/"viewCount":"(\d+)"/);
if(m) viewers=parseInt(m[1]);
}

if(!viewers) viewers=0;

return{

url:channel+"/live",
title:title,
viewers:viewers,
channel:channelName

};

}catch(e){

return null;

}

}

function appendLive(live){

if(displayed.has(live.url)) return;

displayed.add(live.url);

const list=document.getElementById("ytLiveList");

const li=document.createElement("li");

li.style.marginBottom="8px";

li.dataset.viewers=live.viewers;

const a=document.createElement("a");

a.href=live.url;
a.target="_blank";
a.style.color="#3ea6ff";

a.textContent="🔴 "+live.channel;

const div=document.createElement("div");

div.style.fontSize="12px";

div.textContent=`${live.title} (${live.viewers.toLocaleString()} watching)`;

li.appendChild(a);
li.appendChild(div);

list.appendChild(li);

}

async function parallelScan(channels){

let i=0;

const total=channels.length;

const progress=document.getElementById("ytScanProgress");
const status=document.getElementById("ytScanStatus");

async function worker(){

while(i<channels.length){

const idx=i++;

const live=await fetchLiveData(channels[idx]);

scanned++;

if(live){

foundLives++;

appendLive(live);

}

progress.style.width=((scanned/total)*100)+"%";

status.textContent=`Scanning ${scanned}/${total}  Live:${foundLives}`;

}

}

const workers=[];

for(let w=0;w<MAX_CONCURRENT;w++) workers.push(worker());

await Promise.all(workers);

const list=document.getElementById("ytLiveList");

const items=Array.from(list.children);

items.sort((a,b)=>b.dataset.viewers-a.dataset.viewers);

items.forEach(i=>list.appendChild(i));

status.textContent=`Scan complete — Live channels: ${foundLives}`;

}

async function scan(){

const channels=await getSubscribedChannels();

parallelScan(channels);

}

function init(){

createPanel();

scan();

}

window.addEventListener("load",()=>setTimeout(init,2500));

})();
