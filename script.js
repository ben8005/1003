// =============================================
// 台股戰情室 - 主程式
// 所有數字都是「模擬」出來的，用來練習畫面
// =============================================

// ----- 1. 自選股資料（basePrice 是昨天收盤價） -----
const stocks = [
  { code: "2330", name: "台積電", basePrice: 1450 },
  { code: "2317", name: "鴻海",   basePrice: 230 },
  { code: "2454", name: "聯發科", basePrice: 1400 },
  { code: "2382", name: "廣達",   basePrice: 290 },
  { code: "2308", name: "台達電", basePrice: 900 },
  { code: "2881", name: "富邦金", basePrice: 90 },
  { code: "2412", name: "中華電", basePrice: 130 },
  { code: "2603", name: "長榮",   basePrice: 200 }
];

// 一開始，現價 = 昨收
stocks.forEach(function (s) {
  s.price = s.basePrice;
  s.alerted = false; // 記錄是否已經發過「大漲/大跌」提醒
});

// ----- 2. 加權指數資料 -----
const index = {
  basePrice: 27000,  // 昨收
  price: 27000,      // 現價
  history: [27000]   // 走勢紀錄，用來畫圖
};

// 排序設定：目前用哪個欄位排、是不是由大到小
let sortKey = "code";
let sortDesc = false;

// ----- 小工具：產生 -range ~ +range 之間的隨機數 -----
function randomBetween(range) {
  return (Math.random() * 2 - 1) * range;
}

// ----- 小工具：依漲跌回傳 CSS 類別名稱 -----
function colorClass(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

// ----- 小工具：正數前面加 "+" -----
function withSign(value, digits) {
  const text = value.toFixed(digits);
  return value > 0 ? "+" + text : text;
}

// =============================================
// 3. 時鐘與開盤狀態
// =============================================
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString("zh-TW", { hour12: false });

  // 台股交易時間：週一到週五 09:00 ~ 13:30
  const day = now.getDay();                           // 0 是星期日，6 是星期六
  const minutes = now.getHours() * 60 + now.getMinutes(); // 換算成「當天第幾分鐘」
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && minutes >= 9 * 60 && minutes <= 13 * 60 + 30;

  const status = document.getElementById("market-status");
  status.textContent = isOpen ? "盤中" : "收盤";
  status.classList.toggle("open", isOpen);
}

// =============================================
// 4. 模擬價格跳動
// =============================================
function simulateTick() {
  // 每檔股票隨機漲跌一點點（最多約 0.6%）
  stocks.forEach(function (s) {
    s.price = s.price + s.price * randomBetween(0.006);

    // 台股漲跌幅限制 10%，超過就卡住
    const max = s.basePrice * 1.1;
    const min = s.basePrice * 0.9;
    s.price = Math.min(max, Math.max(min, s.price));
  });

  // 指數也隨機跳動
  index.price = index.price + randomBetween(40);
  index.history.push(index.price);

  // 只保留最近 120 筆，避免陣列越來越大
  if (index.history.length > 120) {
    index.history.shift();
  }
}

// =============================================
// 5. 畫面更新：加權指數
// =============================================
function renderIndex() {
  const change = index.price - index.basePrice;
  const percent = (change / index.basePrice) * 100;
  const cls = colorClass(change);

  const priceEl = document.getElementById("index-price");
  priceEl.textContent = index.price.toFixed(2);
  priceEl.className = "big-number " + cls;

  const changeEl = document.getElementById("index-change");
  changeEl.textContent = withSign(change, 2) + "（" + withSign(percent, 2) + "%）";
  changeEl.className = "change " + cls;

  drawChart();
}

// 用 canvas 畫指數走勢線
function drawChart() {
  const canvas = document.getElementById("index-chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const data = index.history;

  ctx.clearRect(0, 0, w, h);

  // 找出最高、最低，決定上下範圍（也把昨收算進去）
  const max = Math.max(...data, index.basePrice) + 10;
  const min = Math.min(...data, index.basePrice) - 10;

  // 把「數值」換算成「畫布上的 y 座標」（數值越大，y 越小 = 越上面）
  function toY(value) {
    return h - ((value - min) / (max - min)) * h;
  }

  // 畫一條昨收的虛線當參考
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "#8b949e";
  ctx.beginPath();
  ctx.moveTo(0, toY(index.basePrice));
  ctx.lineTo(w, toY(index.basePrice));
  ctx.stroke();
  ctx.setLineDash([]);

  // 畫走勢線：在昨收之上用紅色，之下用綠色
  ctx.strokeStyle = index.price >= index.basePrice ? "#ff4d4f" : "#2ecc71";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach(function (value, i) {
    const x = (i / 119) * w; // 120 筆資料平均分布在寬度上
    const y = toY(value);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

// =============================================
// 6. 畫面更新：自選股表格
// =============================================
function renderStocks() {
  // 先算好每檔的漲跌與漲跌幅
  stocks.forEach(function (s) {
    s.change = s.price - s.basePrice;
    s.percent = (s.change / s.basePrice) * 100;
  });

  // 複製一份再排序，不改動原本的順序
  const sorted = stocks.slice().sort(function (a, b) {
    let result = a[sortKey] > b[sortKey] ? 1 : -1;
    if (a[sortKey] === b[sortKey]) result = 0;
    return sortDesc ? -result : result;
  });

  // 組出每一列的 HTML
  let html = "";
  sorted.forEach(function (s) {
    const cls = colorClass(s.change);
    html +=
      "<tr class='flash'>" +
      "<td>" + s.code + "</td>" +
      "<td>" + s.name + "</td>" +
      "<td class='" + cls + "'>" + s.price.toFixed(2) + "</td>" +
      "<td class='" + cls + "'>" + withSign(s.change, 2) + "</td>" +
      "<td class='" + cls + "'>" + withSign(s.percent, 2) + "%</td>" +
      "</tr>";
  });

  document.getElementById("stock-list").innerHTML = html;
}

// =============================================
// 7. 畫面更新：市場統計（模擬數字）
// =============================================
function renderStats() {
  // 指數漲越多，上漲家數就越多（簡單的模擬邏輯）
  const percent = (index.price - index.basePrice) / index.basePrice;
  const up = Math.round(500 + percent * 20000 + randomBetween(20));
  const flat = Math.round(80 + randomBetween(10));
  const down = 1000 - up - flat; // 假設上市總共 1000 家

  document.getElementById("up-count").textContent = up;
  document.getElementById("down-count").textContent = down;
  document.getElementById("flat-count").textContent = flat;

  // 成交量每次增加一點點
  const volumeEl = document.getElementById("volume");
  const oldVolume = Number(volumeEl.textContent) || 0;
  volumeEl.textContent = (oldVolume + Math.random() * 15).toFixed(0);
}

// =============================================
// 8. 盤中提醒：漲跌幅超過 3% 時通知一次
// =============================================
function checkAlerts() {
  stocks.forEach(function (s) {
    const percent = ((s.price - s.basePrice) / s.basePrice) * 100;

    if (!s.alerted && Math.abs(percent) >= 3) {
      const word = percent > 0 ? "大漲" : "大跌";
      addAlert(s.name + "（" + s.code + "）" + word + " " + withSign(percent, 2) + "%", colorClass(percent));
      s.alerted = true; // 同一檔只提醒一次
    }
  });
}

function addAlert(message, cls) {
  const list = document.getElementById("alert-list");

  // 第一次加提醒時，先把「目前沒有提醒」拿掉
  const empty = list.querySelector(".muted");
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  const li = document.createElement("li");
  li.className = cls;
  li.textContent = time + "　" + message;
  list.prepend(li); // 新的放最上面
}

// =============================================
// 9. 點表頭排序
// =============================================
document.querySelectorAll("th").forEach(function (th) {
  th.addEventListener("click", function () {
    const key = th.dataset.key;
    if (sortKey === key) {
      sortDesc = !sortDesc; // 同一欄再點一次 → 反向
    } else {
      sortKey = key;
      sortDesc = true;      // 換欄位時先由大到小
    }
    renderStocks();
  });
});

// =============================================
// 10. 啟動！
// =============================================
function update() {
  simulateTick();
  renderIndex();
  renderStocks();
  renderStats();
  checkAlerts();
}

updateClock();
update();
setInterval(updateClock, 1000); // 每 1 秒更新時鐘
setInterval(update, 3000);      // 每 3 秒更新一次行情
