// ===== 設定區（想改監測主題，改這裡就好）=====

// 主題按鈕：name 是按鈕上的字，query 是拿去搜尋的英文關鍵字
const TOPICS = [
  { name: "全部 AI", query: "AI" },
  { name: "OpenAI", query: "OpenAI" },
  { name: "Anthropic / Claude", query: "Anthropic" },
  { name: "Google Gemini", query: "Gemini" },
  { name: "大型語言模型", query: "LLM" },
  { name: "AI 晶片", query: "Nvidia" }
];

// 每隔幾分鐘自動更新一次
const REFRESH_MINUTES = 5;

// 分數超過多少算「熱門」
const HOT_POINTS = 100;

// ===== 抓取網頁上的元素 =====
const topicsBox = document.getElementById("topics");
const newsList = document.getElementById("news-list");
const dot = document.getElementById("dot");
const statusText = document.getElementById("status-text");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const refreshBtn = document.getElementById("refresh-btn");

// ===== 狀態 =====
let currentQuery = TOPICS[0].query; // 目前正在監測的關鍵字
let seenIds = new Set();            // 記住已經看過的新聞編號，用來判斷哪些是「新的」
let firstLoad = true;               // 第一次載入時，不把全部都標成新的

// ===== 產生主題按鈕 =====
TOPICS.forEach(function (topic, index) {
  const btn = document.createElement("button");
  btn.textContent = topic.name;
  if (index === 0) btn.classList.add("active");

  btn.addEventListener("click", function () {
    // 把其他按鈕的 active 拿掉，只留目前這顆
    document.querySelectorAll(".topics button").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    changeQuery(topic.query);
  });

  topicsBox.appendChild(btn);
});

// ===== 切換關鍵字：清空紀錄後重新抓 =====
function changeQuery(query) {
  currentQuery = query;
  seenIds = new Set();
  firstLoad = true;
  loadNews();
}

// ===== 主要功能：去抓新聞 =====
async function loadNews() {
  setStatus("loading", "讀取中…");

  // 只抓最近 3 天的新聞（時間用「秒」來算）
  const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;

  // 組合網址：依時間排序、只要文章（story）、最多 30 則
  const url =
    "https://hn.algolia.com/api/v1/search_by_date" +
    "?query=" + encodeURIComponent(currentQuery) +
    "&tags=story" +
    "&hitsPerPage=30" +
    "&numericFilters=created_at_i>" + threeDaysAgo;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("伺服器回應錯誤：" + response.status);

    const data = await response.json();
    showNews(data.hits);

    const time = new Date().toLocaleTimeString("zh-TW");
    setStatus("ok", "監測中：「" + currentQuery + "」・最後更新 " + time);
  } catch (error) {
    // 沒網路或來源掛掉時會跑到這裡
    setStatus("error", "讀取失敗，請檢查網路連線（" + error.message + "）");
  }
}

// ===== 把新聞畫到畫面上 =====
function showNews(items) {
  newsList.innerHTML = "";

  if (items.length === 0) {
    newsList.innerHTML = '<li class="empty">最近 3 天沒有相關新聞</li>';
    updateStats(0, 0, 0);
    return;
  }

  let newCount = 0;
  let hotCount = 0;

  items.forEach(function (item) {
    // 判斷是不是新的：不是第一次載入，而且以前沒看過
    const isNew = !firstLoad && !seenIds.has(item.objectID);
    const isHot = item.points >= HOT_POINTS;
    if (isNew) newCount++;
    if (isHot) hotCount++;
    seenIds.add(item.objectID);

    // 有些文章沒有外部連結，就改連到 Hacker News 討論頁
    const discussUrl = "https://news.ycombinator.com/item?id=" + item.objectID;
    const link = item.url || discussUrl;

    // 建立一則新聞
    const li = document.createElement("li");
    li.className = "news-item" + (isNew ? " is-new" : "");

    // 標題連結（用 textContent 放文字，比較安全）
    const a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.textContent = item.title;

    // 下方的小資訊
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML =
      (isNew ? '<span class="tag new">新</span>' : "") +
      (isHot ? '<span class="tag hot">熱門</span>' : "") +
      "🌐 " + getSite(item.url) +
      "・⏱ " + timeAgo(item.created_at_i) +
      "・👍 " + (item.points || 0) + " 分" +
      '・<a href="' + discussUrl + '" target="_blank">💬 ' + (item.num_comments || 0) + " 則留言</a>";

    li.appendChild(a);
    li.appendChild(meta);
    newsList.appendChild(li);
  });

  // 有新新聞時，在分頁標題上提醒
  document.title = newCount > 0 ? "(" + newCount + ") AI 新聞監測站" : "AI 新聞監測站";

  updateStats(items.length, newCount, hotCount);
  firstLoad = false;
}

// ===== 小工具們 =====

// 更新上方的統計數字
function updateStats(total, newCount, hotCount) {
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-new").textContent = newCount;
  document.getElementById("stat-hot").textContent = hotCount;
}

// 改變狀態圓點的顏色與文字
function setStatus(type, text) {
  dot.className = "dot " + type;
  statusText.textContent = text;
}

// 從網址取出網站名稱，例如 https://www.bbc.com/xxx → bbc.com
function getSite(url) {
  if (!url) return "news.ycombinator.com";
  return new URL(url).hostname.replace("www.", "");
}

// 把時間換成「幾分鐘前」這種好讀的說法
function timeAgo(seconds) {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "剛剛";
  if (diff < 3600) return Math.floor(diff / 60) + " 分鐘前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小時前";
  return Math.floor(diff / 86400) + " 天前";
}

// ===== 按鈕事件 =====

// 按下「搜尋」：用輸入的關鍵字監測
searchForm.addEventListener("submit", function (event) {
  event.preventDefault(); // 阻止表單重新整理網頁
  const word = searchInput.value.trim();
  if (word === "") return;

  // 自訂搜尋時，主題按鈕都不亮
  document.querySelectorAll(".topics button").forEach(function (b) {
    b.classList.remove("active");
  });
  changeQuery(word);
});

// 按下「立即更新」
refreshBtn.addEventListener("click", loadNews);

// ===== 啟動 =====
loadNews();
setInterval(loadNews, REFRESH_MINUTES * 60 * 1000); // 定時自動更新
