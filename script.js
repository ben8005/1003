// ===== 設定區（想改監測主題，改這裡就好）=====

// 主題按鈕：
//   name    是按鈕上的字
//   query   是搜尋英文新聞（Hacker News）用的關鍵字
//   zhQuery 是搜尋中文新聞（Google 新聞）用的關鍵字，OR 代表「或」
const TOPICS = [
  { name: "全部 AI", query: "AI", zhQuery: "AI OR 人工智慧" },
  { name: "OpenAI", query: "OpenAI", zhQuery: "OpenAI OR ChatGPT" },
  { name: "Anthropic / Claude", query: "Anthropic", zhQuery: "Anthropic OR Claude" },
  { name: "Google Gemini", query: "Gemini", zhQuery: "Gemini" },
  { name: "大型語言模型", query: "LLM", zhQuery: "大型語言模型 OR LLM" },
  { name: "AI 晶片", query: "Nvidia", zhQuery: "輝達 OR AI晶片" }
];

// 新聞來源按鈕上的名字
const SOURCE_NAMES = {
  hn: "英文新聞",
  zh: "中文新聞"
};

// 每隔幾分鐘自動更新一次
const REFRESH_MINUTES = 5;

// 分數超過多少算「熱門」
const HOT_POINTS = 100;

// 收藏存在瀏覽器裡用的名字
const FAV_KEY = "ai-news-favorites";

// ===== 抓取網頁上的元素 =====
const topicsBox = document.getElementById("topics");
const newsList = document.getElementById("news-list");
const dot = document.getElementById("dot");
const statusText = document.getElementById("status-text");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const refreshBtn = document.getElementById("refresh-btn");
const translateBtn = document.getElementById("translate-btn");
const sourcesBox = document.getElementById("sources");

// ===== 狀態 =====
let currentSource = "hn";               // 目前的新聞來源：hn＝英文、zh＝中文
let currentQuery = TOPICS[0].query;     // 目前的英文關鍵字
let currentZhQuery = TOPICS[0].zhQuery; // 目前的中文關鍵字
let currentBtn = null;                  // 目前亮著的主題按鈕（自訂搜尋時是 null）
let seenIds = new Set();            // 記住已經看過的新聞編號，用來判斷哪些是「新的」
let firstLoad = true;               // 第一次載入時，不把全部都標成新的
let showChinese = true;             // 要不要顯示中文標題
const translations = {};            // 翻譯過的標題先存起來，下次就不用再翻一次
let favorites = loadFavorites();    // 收藏的新聞清單
let viewingFavs = false;            // 現在是不是正在看收藏

// ===== 產生主題按鈕 =====
TOPICS.forEach(function (topic, index) {
  const btn = document.createElement("button");
  btn.textContent = topic.name;
  if (index === 0) {
    btn.classList.add("active");
    currentBtn = btn;
  }

  btn.addEventListener("click", function () {
    // 把其他按鈕的 active 拿掉，只留目前這顆
    document.querySelectorAll(".topics button").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    currentBtn = btn;
    changeQuery(topic.query, topic.zhQuery);
  });

  topicsBox.appendChild(btn);
});

// ===== 產生「我的收藏」按鈕（放在主題按鈕最後面）=====
const favBtn = document.createElement("button");
favBtn.className = "fav-view-btn";
updateFavButton();

favBtn.addEventListener("click", function () {
  document.querySelectorAll(".topics button").forEach(function (b) {
    b.classList.remove("active");
  });
  favBtn.classList.add("active");
  viewingFavs = true;
  showFavorites();
});

topicsBox.appendChild(favBtn);

// ===== 新聞來源按鈕：切換英文／中文 =====
sourcesBox.querySelectorAll("button").forEach(function (btn) {
  btn.addEventListener("click", function () {
    sourcesBox.querySelectorAll("button").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    currentSource = btn.dataset.source; // 讀取 HTML 上的 data-source

    // 如果剛剛在看收藏，把主題按鈕的亮燈還原
    document.querySelectorAll(".topics button").forEach(function (b) {
      b.classList.remove("active");
    });
    if (currentBtn) currentBtn.classList.add("active");

    changeQuery(currentQuery, currentZhQuery);
  });
});

// ===== 切換關鍵字：清空紀錄後重新抓 =====
function changeQuery(query, zhQuery) {
  currentQuery = query;
  currentZhQuery = zhQuery;
  viewingFavs = false; // 離開收藏畫面
  seenIds = new Set();
  firstLoad = true;
  loadNews();
}

// ===== 主要功能：去抓新聞 =====
async function loadNews() {
  // 正在看收藏時，不去抓新聞，只重新顯示收藏
  if (viewingFavs) {
    showFavorites();
    return;
  }

  setStatus("loading", "讀取中…");

  // 記下這次要抓的來源，抓完時用來檢查使用者是不是已經切換了
  const source = currentSource;
  const query = source === "zh" ? currentZhQuery : currentQuery;

  try {
    // 依照來源，用不同的方法抓新聞（兩種抓回來的格式會整理成一樣）
    const items = source === "zh" ? await fetchChineseNews(query) : await fetchEnglishNews(query);

    // 等待期間如果使用者切到「我的收藏」或換了來源，就不要蓋掉畫面
    if (viewingFavs || source !== currentSource) return;
    showNews(items);

    const time = new Date().toLocaleTimeString("zh-TW");
    setStatus("ok", "監測中：" + SOURCE_NAMES[source] + "「" + query + "」・最後更新 " + time);
  } catch (error) {
    // 沒網路或來源掛掉時會跑到這裡
    setStatus("error", "讀取失敗，請檢查網路連線（" + error.message + "）");
  }
}

// ===== 抓英文新聞（Hacker News）=====
async function fetchEnglishNews(query) {
  // 只抓最近 3 天的新聞（時間用「秒」來算）
  const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;

  // 組合網址：依時間排序、只要文章（story）、最多 30 則
  const url =
    "https://hn.algolia.com/api/v1/search_by_date" +
    "?query=" + encodeURIComponent(query) +
    "&tags=story" +
    "&hitsPerPage=30" +
    "&numericFilters=created_at_i>" + threeDaysAgo;

  const response = await fetch(url);
  if (!response.ok) throw new Error("伺服器回應錯誤：" + response.status);

  const data = await response.json();
  return data.hits;
}

// ===== 抓中文新聞（Google 新聞）=====
async function fetchChineseNews(query) {
  // Google 新聞的 RSS 網址：when:3d 代表只要最近 3 天，後面是「台灣、繁體中文」
  const rssUrl =
    "https://news.google.com/rss/search" +
    "?q=" + encodeURIComponent(query + " when:3d") +
    "&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";

  // 瀏覽器不能直接讀 Google 新聞，所以透過 rss2json 這個免費服務轉成 JSON
  const url = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rssUrl);

  const response = await fetch(url);
  if (!response.ok) throw new Error("伺服器回應錯誤：" + response.status);

  const data = await response.json();
  if (data.status !== "ok") throw new Error(data.message || "中文新聞來源讀取失敗");

  // 把 Google 新聞的格式，整理成和英文新聞一樣的格式，畫面才能共用
  const items = data.items.map(function (item) {
    // 標題長這樣：「OpenAI 發表新模型 - 自由時報」，最後一個「 - 」後面是媒體名稱
    const cut = item.title.lastIndexOf(" - ");
    const title = cut > 0 ? item.title.slice(0, cut) : item.title;
    const source = cut > 0 ? item.title.slice(cut + 3) : "Google 新聞";

    // 時間長這樣：「2026-10-18 06:30:00」（世界標準時間），轉成「秒」
    const time = new Date(item.pubDate.replace(" ", "T") + "Z").getTime();

    return {
      objectID: item.link, // 用網址當作這則新聞的編號
      title: title,
      url: item.link,
      created_at_i: Math.floor(time / 1000),
      source: source,
      lang: "zh"           // 標記成中文新聞
    };
  });

  // 依時間排序，最新的在最上面，最多 30 則
  items.sort(function (a, b) {
    return b.created_at_i - a.created_at_i;
  });
  return items.slice(0, 30);
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
  const waitList = []; // 等一下要翻譯的標題清單

  items.forEach(function (item) {
    // 判斷是不是新的：不是第一次載入，而且以前沒看過
    const isNew = !firstLoad && !seenIds.has(item.objectID);
    const isHot = item.points >= HOT_POINTS;
    if (isNew) newCount++;
    if (isHot) hotCount++;
    seenIds.add(item.objectID);

    newsList.appendChild(createNewsItem(item, isNew, isHot, waitList));
  });

  // 有新新聞時，在分頁標題上提醒
  document.title = newCount > 0 ? "(" + newCount + ") AI 新聞監測站" : "AI 新聞監測站";

  updateStats(items.length, newCount, hotCount);
  firstLoad = false;

  // 新聞先顯示出來，再慢慢把標題翻成中文
  translateAll(waitList);
}

// ===== 建立「一則新聞」的畫面（一般列表和收藏列表都用這個）=====
function createNewsItem(item, isNew, isHot, waitList) {
  // 有些文章沒有外部連結，就改連到 Hacker News 討論頁
  const discussUrl = "https://news.ycombinator.com/item?id=" + item.objectID;
  const link = item.url || discussUrl;

  const li = document.createElement("li");
  li.className = "news-item" + (isNew ? " is-new" : "") + (item.lang === "zh" ? " is-zh" : "");

  // 收藏按鈕（星星）：收藏了是 ★，沒收藏是 ☆
  const star = document.createElement("button");
  star.className = "star-btn";
  setStar(star, isFavorite(item.objectID));
  star.addEventListener("click", function () {
    toggleFavorite(item);
    setStar(star, isFavorite(item.objectID));
  });

  // 標題連結：裡面放「中文標題」和「英文原文」兩行
  const a = document.createElement("a");
  a.href = link;
  a.target = "_blank";

  // 中文標題：先找記憶中翻好的，再找收藏時一起存下來的
  const zhText = translations[item.title] || item.zh || "";

  const zh = document.createElement("span");
  zh.className = "zh-title";
  zh.textContent = zhText;

  const en = document.createElement("span");
  en.className = "en-title";
  en.textContent = item.title; // 用 textContent 放文字，比較安全

  a.appendChild(zh);
  a.appendChild(en);

  // 還沒翻過的英文新聞，放進等待清單（中文新聞不用翻）
  if (zhText === "" && item.lang !== "zh") {
    waitList.push({ text: item.title, box: zh });
  }

  // 下方的小資訊
  const meta = document.createElement("div");
  meta.className = "meta";
  const tags =
    (isNew ? '<span class="tag new">新</span>' : "") +
    (isHot ? '<span class="tag hot">熱門</span>' : "");

  if (item.lang === "zh") {
    // 中文新聞：顯示媒體名稱和時間（Google 新聞沒有分數和留言）
    // 媒體名稱是外部來的文字，用 escapeHtml 處理比較安全
    meta.innerHTML =
      tags +
      "📰 " + escapeHtml(item.source) +
      "・⏱ " + timeAgo(item.created_at_i);
  } else {
    // 英文新聞：顯示網站、時間、分數、留言
    meta.innerHTML =
      tags +
      "🌐 " + getSite(item.url) +
      "・⏱ " + timeAgo(item.created_at_i) +
      "・👍 " + (item.points || 0) + " 分" +
      '・<a href="' + discussUrl + '" target="_blank">💬 ' + (item.num_comments || 0) + " 則留言</a>";
  }

  li.appendChild(star);
  li.appendChild(a);
  li.appendChild(meta);
  return li;
}

// ===== 收藏功能 =====

// 從瀏覽器讀出之前存的收藏（關掉網頁再打開也還在）
function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
  } catch (error) {
    return []; // 讀不到就當作沒有收藏
  }
}

// 把收藏存進瀏覽器
function saveFavorites() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  } catch (error) {
    // 有些瀏覽器（例如無痕模式）不讓存，就只在這次開著時有效
  }
}

// 檢查某則新聞有沒有被收藏
function isFavorite(id) {
  return favorites.some(function (fav) {
    return fav.objectID === id;
  });
}

// 收藏 ↔ 取消收藏
function toggleFavorite(item) {
  if (isFavorite(item.objectID)) {
    // 取消收藏：把這則從清單中拿掉
    favorites = favorites.filter(function (fav) {
      return fav.objectID !== item.objectID;
    });
  } else {
    // 加入收藏：只存需要的欄位，中文標題也一起存
    favorites.unshift({
      objectID: item.objectID,
      title: item.title,
      zh: translations[item.title] || item.zh || "",
      url: item.url,
      created_at_i: item.created_at_i,
      points: item.points,
      num_comments: item.num_comments,
      source: item.source,
      lang: item.lang
    });
  }

  saveFavorites();
  updateFavButton();

  // 正在看收藏時，取消收藏要馬上從畫面消失
  if (viewingFavs) showFavorites();
}

// 改變星星按鈕的樣子
function setStar(star, saved) {
  star.textContent = saved ? "★" : "☆";
  star.title = saved ? "取消收藏" : "加入收藏";
  star.classList.toggle("saved", saved);
}

// 更新「我的收藏」按鈕上的數字
function updateFavButton() {
  favBtn.textContent = "⭐ 我的收藏（" + favorites.length + "）";
}

// 顯示收藏列表
function showFavorites() {
  newsList.innerHTML = "";
  document.title = "AI 新聞監測站";
  setStatus("ok", "正在看我的收藏（不會自動更新）");

  if (favorites.length === 0) {
    newsList.innerHTML = '<li class="empty">還沒有收藏，按新聞右上角的 ☆ 就能收藏</li>';
    updateStats(0, 0, 0);
    return;
  }

  let hotCount = 0;
  const waitList = [];

  favorites.forEach(function (item) {
    const isHot = item.points >= HOT_POINTS;
    if (isHot) hotCount++;
    newsList.appendChild(createNewsItem(item, false, isHot, waitList));
  });

  updateStats(favorites.length, 0, hotCount);
  translateAll(waitList);
}

// ===== 翻譯功能 =====

// 一則一則翻譯，翻好一則就馬上顯示一則
async function translateAll(waitList) {
  if (!showChinese) return; // 關閉翻譯時就不翻

  for (const job of waitList) {
    const result = await translate(job.text);
    if (result) {
      translations[job.text] = result; // 存起來
      job.box.textContent = result;    // 填進畫面
    }
  }
}

// 把一段英文翻成繁體中文（使用 Google 翻譯的免費網址，不用金鑰）
async function translate(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx&sl=en&tl=zh-TW&dt=t" +
    "&q=" + encodeURIComponent(text);

  try {
    const response = await fetch(url);
    const data = await response.json();

    // 回傳的資料長得像 [[["中文","英文",...], ...], ...]
    // 一句話可能被切成好幾段，所以要把每一段的中文接起來
    return data[0].map(function (part) {
      return part[0];
    }).join("");
  } catch (error) {
    return ""; // 翻譯失敗就算了，至少還有英文原文
  }
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

// 把文字裡的 < > & 等符號換掉，避免被當成 HTML 執行
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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
  currentBtn = null;
  changeQuery(word, word); // 英文、中文都用同一個關鍵字
});

// 按下「立即更新」
refreshBtn.addEventListener("click", loadNews);

// 按下「中文標題：開／關」
translateBtn.addEventListener("click", function () {
  showChinese = !showChinese; // 開變關、關變開
  translateBtn.textContent = showChinese ? "🈶 中文標題：開" : "🔤 中文標題：關";
  document.body.classList.toggle("no-zh", !showChinese); // 用 CSS 藏起或顯示中文

  // 重新打開時，把還沒翻的補翻
  if (showChinese) {
    const waitList = [];
    // 只找英文新聞（中文新聞有 is-zh，不用翻）
    document.querySelectorAll(".news-item:not(.is-zh)").forEach(function (li) {
      const zh = li.querySelector(".zh-title");
      if (zh.textContent === "") {
        waitList.push({ text: li.querySelector(".en-title").textContent, box: zh });
      }
    });
    translateAll(waitList);
  }
});

// ===== 啟動 =====
loadNews();
setInterval(loadNews, REFRESH_MINUTES * 60 * 1000); // 定時自動更新
