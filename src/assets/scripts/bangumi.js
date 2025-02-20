/*! BangumiTV v1.0.2 | GeeKaven (https://tawawa.moe) | https://bangumi-tv.vercel.app | MIT License */
const bangumiUrl=bgmConfig.apiUrl,quote=bgmConfig.quote,limit=12,load='<img style="margin: 0 auto;" src="/images/mona-loading.gif">';function getTab(){const t={want:"\u60F3\u770B",watching:"\u5728\u770B",watched:"\u770B\u8FC7"},c=`${bangumiUrl}/bangumi_total`;getJSON(c,function(e){for(const n in e)if(Object.hasOwnProperty.call(e,n)){const i=e[n];document.querySelector(".bgm-tabs").insertAdjacentHTML("beforeend",`<span class="bgm-tab" id="bgm-${n}" data-type=${n} onclick="tabClick(event)">${t[n]}(${i})</span>`)}document.getElementsByClassName("bgm-tab")[1].click()})}function getPage(t,c){const e=`${bangumiUrl}/bangumi?type=${c}&offset=${(t-1)*limit}&limit=${limit}`;getJSON(e,function(n){if(t==1?emptyEl(document.querySelector(".bgm-collection")):removeEl(document.querySelector(".bgm-navigator")),Array.prototype.forEach.call(n.data,function(i,s){let o=i.eps,r=c==="watched"?o:i.ep_status,a=r/o*100,l=i.images.large;const m=`
    <a class="bgm-item" href="${`https://bgm.tv/subject/${i.subject_id}`}" target="_blank">
        <div class="bgm-item-thumb" style="background-image:url(${l})" referrerpolicy="no-referrer"></div>
        <div class="bgm-item-info">
            <span class="bgm-item-title main">${i.name_cn||i.name}</span>
            <span class="bgm-item-title">${i.summary||i.name}</span>
            <div class="bgm-item-statusBar-container">
              <div class="bgm-item-statusBar" style="width:${a}%"></div>
              <span class="bgm-item-percentage">\u8FDB\u5EA6\uFF1A${r} / ${o}</span>
            </div>
        </div>
    </a>
    `;document.querySelector(".bgm-collection").insertAdjacentHTML("beforeend",m)}),t<Math.ceil(n.total/limit)){const i=`
    <div class="bgm-navigator">
        <a class="bgm-btn">\u52A0\u8F7D\u66F4\u591A</a>
        <script>
        
        <\/script>
    </div>
    `;document.querySelector(".bgm-container").insertAdjacentHTML("beforeend",i),document.querySelector(".bgm-btn").addEventListener("click",function(s){loadClick(s,t+1,c)},{once:!0})}})}function tabClick(t){emptyEl(document.querySelector(".bgm-collection")),removeEl(document.querySelector(".bgm-navigator")),document.querySelector(".bgm-collection").insertAdjacentHTML("beforeend",load);const c=t.target;c.classList.add("bgm-active"),document.querySelectorAll(".bgm-tab").forEach(function(n){n.id!==c.id&&n.classList.remove("bgm-active")});const e=c.dataset.type;getPage(1,e)}function loadClick(t,c,e){getPage(c,e);const n=t.target;n.textContent="\u52A0\u8F7D\u4E2D",n.style.backgroundColor="grey"}function emptyEl(t){for(;t.firstChild;)t.removeChild(t.firstChild)}function removeEl(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function getJSON(t,c){var e=new XMLHttpRequest;e.open("GET",t,!0),e.onload=function(){this.status>=200&&this.status<400&&c(JSON.parse(this.response))},e.onerror=function(){},e.send()}function init(){quote&&document.querySelector(".bgm-container").insertAdjacentHTML("beforeend",`<blockquote><p>${quote}</p></blockquote>`),document.querySelector(".bgm-container").insertAdjacentHTML("beforeend",'<div class="bgm-tabs"></div>'),document.querySelector(".bgm-container").insertAdjacentHTML("beforeend",`
  <div class="bgm-collection" id="bgm-collection">
    ${load}
  </div>`),getTab()}init();