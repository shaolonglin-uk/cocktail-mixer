/* ===== 调酒笔记 — 主应用逻辑 v1.0 ===== */
/* 纯本地 IndexedDB，无云端依赖，国内可用 */

// ===== 全局状态 =====
let currentUser = { uid: 'local-' + Date.now() };
let allRecipes = [];
let recipeCacheReady = false;
let userInventory = {};
let userBrewCounts = {};
let userFavorites = {};
let userShopping = {};
let userPrefs = {};

// 筛选状态
let filterBaseSpirit = [];
let filterFlavor = [];
let searchQuery = '';

// ===== IndexedDB =====
var DB_NAME = 'CocktailNotes';
var DB_VERSION = 1;
var db = null;

function openDB() {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = function() { reject(request.error); };
    request.onsuccess = function() { db = request.result; resolve(db); };
    request.onupgradeneeded = function(e) {
      var database = e.target.result;
      if (!database.objectStoreNames.contains('inventory')) {
        database.createObjectStore('inventory', { keyPath: 'name' });
      }
      if (!database.objectStoreNames.contains('brewCounts')) {
        database.createObjectStore('brewCounts', { keyPath: 'recipeId' });
      }
      if (!database.objectStoreNames.contains('favorites')) {
        database.createObjectStore('favorites', { keyPath: 'recipeId' });
      }
      if (!database.objectStoreNames.contains('shopping')) {
        database.createObjectStore('shopping', { keyPath: 'name' });
      }
      if (!database.objectStoreNames.contains('prefs')) {
        database.createObjectStore('prefs', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('customRecipes')) {
        var store = database.createObjectStore('customRecipes', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
      }
    };
  });
}

function dbGetAll(storeName) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readonly');
    var store = tx.objectStore(storeName);
    var req = store.getAll();
    req.onsuccess = function() { resolve(req.result || []); };
    req.onerror = function() { reject(req.error); };
  });
}

function dbPut(storeName, data) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readwrite');
    var store = tx.objectStore(storeName);
    var req = store.put(data);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

function dbDelete(storeName, key) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readwrite');
    var store = tx.objectStore(storeName);
    var req = store.delete(key);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

function dbClear(storeName) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readwrite');
    var store = tx.objectStore(storeName);
    var req = store.clear();
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

// ===== 工具函数 =====
function $(id) { return document.getElementById(id); }
function showView(id) {
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('on'); });
  var el = $(id);
  if (el) { el.classList.add('on'); el.scrollTop = 0; }
}
function updateTabBar() {
  var tabMap = { viewRecipes: 0, viewRandom: 1, viewInventory: 2, viewShopping: 3, viewTutorials: 4 };
  var idx = tabMap[currentView];
  document.querySelectorAll('#tabBar button').forEach(function(btn, i) {
    btn.classList.toggle('on', i === idx);
  });
}
var toastTimer = null;
function toast(msg) {
  var el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.className = 'toast'; }, 2000);
}

// ===== 数据持久化 =====
function saveAllData() {
  var promises = [];
  Object.keys(userInventory).forEach(function(k) {
    promises.push(dbPut('inventory', userInventory[k]));
  });
  Object.keys(userBrewCounts).forEach(function(k) {
    promises.push(dbPut('brewCounts', { recipeId: k, count: userBrewCounts[k] }));
  });
  Object.keys(userFavorites).forEach(function(k) {
    promises.push(dbPut('favorites', { recipeId: k }));
  });
  Object.keys(userShopping).forEach(function(k) {
    promises.push(dbPut('shopping', userShopping[k]));
  });
  return Promise.all(promises);
}

function saveInventory() {
  var promises = [];
  Object.keys(userInventory).forEach(function(k) {
    promises.push(dbPut('inventory', userInventory[k]));
  });
  return Promise.all(promises);
}

function saveShopping() {
  var promises = [];
  Object.keys(userShopping).forEach(function(k) {
    promises.push(dbPut('shopping', userShopping[k]));
  });
  return Promise.all(promises);
}

function saveBrewCounts() {
  var promises = [];
  Object.keys(userBrewCounts).forEach(function(k) {
    promises.push(dbPut('brewCounts', { recipeId: k, count: userBrewCounts[k] }));
  });
  return Promise.all(promises);
}

function savePrefs() {
  var promises = [];
  Object.keys(userPrefs).forEach(function(k) {
    promises.push(dbPut('prefs', { key: k, value: userPrefs[k] }));
  });
  return Promise.all(promises);
}

function loadAllData() {
  return Promise.all([
    dbGetAll('inventory'),
    dbGetAll('brewCounts'),
    dbGetAll('favorites'),
    dbGetAll('shopping'),
    dbGetAll('prefs')
  ]).then(function(results) {
    var inv = results[0];
    var brewCounts = results[1];
    var favs = results[2];
    var shopping = results[3];
    var prefs = results[4];

    inv.forEach(function(item) { userInventory[item.name] = item; });
    brewCounts.forEach(function(item) { userBrewCounts[item.recipeId] = item.count; });
    favs.forEach(function(item) { userFavorites[item.recipeId] = true; });
    shopping.forEach(function(item) { userShopping[item.name] = item; });
    prefs.forEach(function(item) { userPrefs[item.key] = item.value; });
  });
}

// ===== 初始化 =====
function init() {
  openDB().then(function() {
    return loadAllData();
  }).then(function() {
    // Tab bar 事件
    document.querySelectorAll('#tabBar button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var view = btn.dataset.view;
        if (view === 'viewInventory') renderInventory();
        if (view === 'viewShopping') renderShopping();
        if (view === 'viewRecipes') loadRecipeList();
        if (view === 'viewRandom') renderRandom();
        if (view === 'viewTutorials') renderTutorials();
        showView(view);
      });
    });

    // Load recipes
    allRecipes = typeof RECIPES_DATA !== 'undefined' ? RECIPES_DATA : [];
    recipeCacheReady = true;

    // Check onboarding
    if (userPrefs.onboardingDone) {
      showView('viewRecipes');
      loadRecipeList();
    } else {
      renderOnboarding();
      showView('viewOnboarding');
    }
  }).catch(function(err) {
    console.error('Init error:', err);
    showError('初始化失败：' + err.message);
  });
}

function showError(msg) {
  var el = $('viewOnboarding');
  if (el) {
    el.innerHTML = '\
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:40px 20px;background:#FBF7F2">\
        <div style="font-size:56px">😅</div>\
        <div style="font-size:20px;font-weight:700;color:#3D2C2C;font-family:-apple-system,\'SF Pro\',\'PingFang SC\',sans-serif">出错了</div>\
        <div style="font-size:14px;color:#8B7E74;text-align:center;font-family:-apple-system,\'SF Pro\',\'PingFang SC\',sans-serif">' + msg + '</div>\
        <button class="btn-primary" style="margin-top:16px" onclick="location.reload()">刷新页面</button>\
      </div>';
  }
}

// ===== 新手引导 =====
function renderOnboarding() {
  var el = $('viewOnboarding');
  el.innerHTML = '\
    <div class="onboard-page on">\
      <div class="onboard-icon">🍸</div>\
      <div class="onboard-title">欢迎来到调酒笔记</div>\
      <div class="onboard-desc">根据你家里的材料<br>推荐最适合你的酒！</div>\
      <div class="onboard-desc" style="font-size:13px;color:var(--text3)">录入库存后，我们会告诉你<br>用现有材料能调出什么</div>\
      <div style="width:100%;max-width:320px">\
        <div style="font-size:15px;font-weight:600;margin-bottom:12px;text-align:left">你偏好什么风味？（可多选）</div>\
        <div class="flavor-grid">\
          <div class="flavor-opt" data-flavor="甜" onclick="toggleFlavor(this)">🍬 甜</div>\
          <div class="flavor-opt" data-flavor="酸" onclick="toggleFlavor(this)">🍋 酸</div>\
          <div class="flavor-opt" data-flavor="苦" onclick="toggleFlavor(this)">☕ 苦</div>\
          <div class="flavor-opt" data-flavor="辣" onclick="toggleFlavor(this)">🌶️ 辣</div>\
        </div>\
        <button class="btn-primary" onclick="completeOnboarding(true)" style="margin-bottom:10px">开始录入库存</button>\
        <button class="btn-secondary" onclick="completeOnboarding(false)">暂时跳过</button>\
      </div>\
    </div>';
}

function toggleFlavor(el) {
  el.classList.toggle('on');
}

function completeOnboarding(doInventory) {
  var flavors = [];
  document.querySelectorAll('.flavor-opt.on').forEach(function(el) {
    flavors.push(el.dataset.flavor);
  });
  userPrefs.flavorPrefs = flavors;
  userPrefs.onboardingDone = true;

  if (doInventory) {
    savePrefs().then(function() {
      showView('viewInventory');
      renderInventory();
    });
  } else {
    savePrefs().then(function() {
      showView('viewRecipes');
      loadRecipeList();
    });
  }
}

// ===== 配方列表 =====
function loadRecipeList() {
  renderFilterBar();
  filterAndRenderRecipes();
}

function renderFilterBar() {
  var spirits = ['伏特加', '金酒', '朗姆', '龙舌兰', '威士忌', '白兰地', '利口酒'];
  var flavors = ['甜', '酸', '苦', '辣', '清爽', '果味'];

  var spiritHtml = spirits.map(function(s) {
    var checked = filterBaseSpirit.indexOf(s) >= 0 ? ' on' : '';
    return '<label class="filter-chip' + checked + '" onclick="toggleFilterSpirit(\'' + s + '\', this)">' + s + '</label>';
  }).join('');

  var flavorHtml = flavors.map(function(f) {
    var checked = filterFlavor.indexOf(f) >= 0 ? ' on' : '';
    return '<label class="filter-chip' + checked + '" onclick="toggleFilterFlavor(\'' + f + '\', this)">' + f + '</label>';
  }).join('');

  $('filterBar').innerHTML = '\
    <div class="search-bar"><input class="s-input" placeholder="🔍 搜索配方..." oninput="searchQuery=this.value;filterAndRenderRecipes()"></div>\
    <div class="filter-row"><span style="font-size:12px;color:var(--text2);margin-right:6px">基酒</span>' + spiritHtml + '</div>\
    <div class="filter-row"><span style="font-size:12px;color:var(--text2);margin-right:6px">风味</span>' + flavorHtml + '</div>';
}

function toggleFilterSpirit(spirit, el) {
  var idx = filterBaseSpirit.indexOf(spirit);
  if (idx >= 0) { filterBaseSpirit.splice(idx, 1); el.classList.remove('on'); }
  else { filterBaseSpirit.push(spirit); el.classList.add('on'); }
  filterAndRenderRecipes();
}

function toggleFilterFlavor(flavor, el) {
  var idx = filterFlavor.indexOf(flavor);
  if (idx >= 0) { filterFlavor.splice(idx, 1); el.classList.remove('on'); }
  else { filterFlavor.push(flavor); el.classList.add('on'); }
  filterAndRenderRecipes();
}

function filterAndRenderRecipes() {
  if (!recipeCacheReady) return;

  var q = searchQuery.toLowerCase();
  var filtered = allRecipes.filter(function(r) {
    if (q && r.name.toLowerCase().indexOf(q) < 0) return false;
    if (filterBaseSpirit.length > 0) {
      var spiritMatch = r.baseSpirit.some(function(s) {
        return filterBaseSpirit.some(function(f) { return s.toLowerCase().indexOf(f.toLowerCase()) >= 0; });
      });
      if (!spiritMatch) return false;
    }
    if (filterFlavor.length > 0) {
      var flavorMatch = filterFlavor.every(function(f) {
        return r.flavor.some(function(rf) { return rf === f; });
      });
      if (!flavorMatch) return false;
    }
    return true;
  });

  filtered.sort(function(a, b) {
    var ca = userBrewCounts[a.id] || 0;
    var cb = userBrewCounts[b.id] || 0;
    if (cb !== ca) return cb - ca;
    return a.name.localeCompare(b.name);
  });

  renderRecipeCards(filtered);
}

function renderRecipeCards(recipes) {
  var el = $('recipeList');
  if (!recipes.length) {
    el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px;margin-bottom:12px">🍸</div><div>没有找到匹配的配方</div></div>';
    return;
  }

  el.innerHTML = recipes.map(function(r) {
    var count = userBrewCounts[r.id] || 0;
    var isFav = !!userFavorites[r.id];
    var imgSrc = r.image || '';
    var ingredients = (r.ingredients || []).slice(0, 3).map(function(i) { return i.name; }).join(' · ');
    var spirit = (r.baseSpirit || []).join(' · ');
    var flavor = (r.flavor || []).join(' · ');

    return '<div class="recipe-card" onclick="openRecipe(\'' + r.id + '\')">\
      <div style="display:flex">\
        <div style="width:100px;height:100px;background:var(--surface2);border-radius:var(--radius-sm) 0 0 var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">\
          ' + (imgSrc ? '<img src="' + imgSrc + '" style="width:100%;height:100%;object-fit:cover">' : '<span style="font-size:40px">🍸</span>') + '\
        </div>\
        <div class="recipe-card-body" style="flex:1;min-width:0">\
          <div class="recipe-card-name">' + r.name + (isFav ? ' ⭐' : '') + '</div>\
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px">' + (spirit || '') + (flavor ? ' · ' + flavor : '') + '</div>\
          <div style="font-size:13px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ingredients + '</div>\
          <div style="font-size:12px;color:var(--text3);margin-top:4px">' + (count > 0 ? '⭐ 已调 ' + count + ' 次' : '') + '</div>\
        </div>\
      </div>\
    </div>';
  }).join('');
}

function openRecipe(recipeId) {
  var r = allRecipes.find(function(x) { return x.id === recipeId; });
  if (!r) return;

  var count = userBrewCounts[r.id] || 0;
  var isFav = !!userFavorites[r.id];
  var imgSrc = r.image || '';

  var canMake = true;
  var missing = [];
  var materials = (r.ingredients || []).map(function(ing) {
    var invItem = userInventory[ing.name];
    if (invItem && invItem.amount > 0) {
      return '<div class="ing-item"><span class="ing-name">' + ing.name + '</span><span class="ing-amount" style="color:var(--green)">✅ ' + (ing.amount || ing.amountText || '') + '</span></div>';
    } else {
      canMake = false;
      missing.push(ing.name + ' ' + (ing.amount || ing.amountText || ''));
      return '<div class="ing-item"><span class="ing-name">' + ing.name + '</span><span class="ing-amount" style="color:var(--red)">❌ ' + (ing.amount || ing.amountText || '') + '</span></div>';
    }
  }).join('');

  var h = '\
    <div class="header">\
      <div class="back" onclick="showView(\'viewRecipes\');loadRecipeList()">←</div>\
      <div style="display:flex;gap:16px;align-items:center">\
        <span class="action" onclick="toggleFavorite(\'' + r.id + '\')">' + (isFav ? '⭐' : '🤍') + '</span>\
        <span class="action" onclick="incrementBrew(\'' + r.id + '\')">🍹</span>\
      </div>\
    </div>';

  if (imgSrc) {
    h += '<img src="' + imgSrc + '" style="width:100%;height:180px;object-fit:cover;border-radius:var(--radius);margin-bottom:12px">';
  }

  h += '<div class="card">\
    <div style="font-size:20px;font-weight:700;margin-bottom:4px">' + r.name + '</div>';

  if (r.description) {
    h += '<div style="font-size:14px;color:var(--text2);margin-bottom:10px">' + r.description + '</div>';
  }

  var tags = [];
  if (r.baseSpirit && r.baseSpirit.length) tags = tags.concat(r.baseSpirit.slice(0, 2));
  if (r.flavor && r.flavor.length) tags = tags.concat(r.flavor);
  if (tags.length) {
    h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">' + tags.map(function(t) {
      return '<span class="tag tag-accent">' + t + '</span>';
    }).join('') + '</div>';
  }

  h += '<div style="font-size:13px;color:var(--text2);margin-bottom:4px">🥃 ' + (r.glass || '') + '</div>';
  if (r.garnish) {
    h += '<div style="font-size:13px;color:var(--text2);margin-bottom:4px">🍋 ' + r.garnish + '</div>';
  }
  if (count > 0) {
    h += '<div style="font-size:13px;color:var(--gold);margin-top:8px">⭐ 已调 ' + count + ' 次</div>';
  }
  h += '</div>';

  h += '<div class="card">\
    <div class="card-title">材料</div>\
    ' + materials + '\
  </div>';

  if (missing.length > 0) {
    h += '<div class="card" style="background:#FFF5F5;border:1px solid #FFD0D0">\
      <div class="card-title" style="color:var(--red)">⚠️ 缺少的材料</div>\
      ' + missing.map(function(m) { return '<div style="font-size:14px;color:var(--red);padding:2px 0">' + m + '</div>'; }).join('') + '\
    </div>';
  }

  if (r.steps && r.steps.length) {
    h += '<div class="card">\
      <div class="card-title">步骤</div>\
      ' + r.steps.map(function(s, i) {
        return '<div class="step-item"><div class="step-num">' + (i + 1) + '</div><div class="step-text">' + s + '</div></div>';
      }).join('') + '\
    </div>';
  }

  if (r.substitutes && r.substitutes.length) {
    h += '<div class="card" style="background:var(--surface2)">\
      <div class="card-title">💡 替换建议</div>\
      ' + r.substitutes.map(function(sub) {
        return '<div style="font-size:14px;padding:4px 0">' + sub.original + ' → ' + sub.substitute + '</div>';
      }).join('') + '\
    </div>';
  }

  h += '<div style="padding:8px 0 24px">';
  if (canMake) {
    h += '<button class="btn-primary" onclick="brewRecipe(\'' + r.id + '\')">🍹 开始调这杯</button>';
  } else {
    h += '<button class="btn-primary" onclick="addMissingToShopping(\'' + r.id + '\')">🛒 缺料加入购物清单</button>';
  }
  h += '</div>';

  $('viewRecipeDetail').innerHTML = h;
  showView('viewRecipeDetail');
}

function toggleFavorite(recipeId) {
  if (userFavorites[recipeId]) {
    delete userFavorites[recipeId];
    dbDelete('favorites', recipeId);
  } else {
    userFavorites[recipeId] = true;
    dbPut('favorites', { recipeId: recipeId });
  }
  openRecipe(recipeId);
}

function incrementBrew(recipeId) {
  userBrewCounts[recipeId] = (userBrewCounts[recipeId] || 0) + 1;
  dbPut('brewCounts', { recipeId: recipeId, count: userBrewCounts[recipeId] });
  openRecipe(recipeId);
}

function brewRecipe(recipeId) {
  var r = allRecipes.find(function(x) { return x.id === recipeId; });
  if (!r) return;

  var updated = false;
  (r.ingredients || []).forEach(function(ing) {
    var inv = userInventory[ing.name];
    if (inv && inv.amount > 0) {
      inv.amount = Math.max(0, inv.amount - 1);
      updated = true;
    }
  });

  userBrewCounts[recipeId] = (userBrewCounts[recipeId] || 0) + 1;

  var p = updated ? saveInventory() : Promise.resolve();
  p.then(function() { return saveBrewCounts(); })
    .then(function() {
      toast('🍹 干杯！库存已更新');
      openRecipe(recipeId);
    });
}

function addMissingToShopping(recipeId) {
  var r = allRecipes.find(function(x) { return x.id === recipeId; });
  if (!r) return;

  (r.ingredients || []).forEach(function(ing) {
    var inv = userInventory[ing.name];
    if (!inv || inv.amount <= 0) {
      if (userShopping[ing.name]) {
        userShopping[ing.name].amount += 1;
      } else {
        userShopping[ing.name] = {
          name: ing.name,
          amount: 1,
          unit: ing.unit || '',
          purchased: false
        };
      }
    }
  });

  saveShopping().then(function() {
    toast('🛒 已加入购物清单');
  });
}

// ===== 酒柜（库存） =====
function renderInventory() {
  var categories = [
    { value: 'all', label: '全部' },
    { value: 'base_spirit', label: '基酒' },
    { value: 'juice', label: '果汁' },
    { value: 'syrup', label: '糖浆' },
    { value: 'garnish', label: '装饰' },
    { value: 'other', label: '其他' }
  ];

  var catHtml = categories.map(function(c) {
    return '<label class="filter-chip" data-cat="' + c.value + '" onclick="filterInvCategory(this)">' + c.label + '</label>';
  }).join('');

  $('viewInventory').innerHTML = '\
    <div class="header">\
      <h1>我的酒柜</h1>\
      <div class="action" onclick="showView(\'viewSettings\');renderSettings()">⚙️</div>\
    </div>\
    <div class="cat-row" style="padding:0 16px 8px">' + catHtml + '</div>\
    <div id="inventoryList" style="padding:0 16px"></div>\
    <div style="padding:16px">\
      <button class="btn-secondary" onclick="addInventoryItem()">+ 新增材料</button>\
    </div>';

  filterInvCategory(document.querySelector('[data-cat="all"]'));
}

function filterInvCategory(el) {
  document.querySelectorAll('#viewInventory .filter-chip').forEach(function(c) { c.classList.remove('on'); });
  el.classList.add('on');
  renderInventoryItems(el.dataset.cat);
}

function renderInventoryItems(category) {
  var items = Object.keys(userInventory);
  if (category !== 'all') {
    items = items.filter(function(k) { return userInventory[k].category === category; });
  }

  if (!items.length) {
    $('inventoryList').innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text3)"><div style="font-size:40px;margin-bottom:12px">🍾</div><div>这个分类下还没有材料</div></div>';
    return;
  }

  $('inventoryList').innerHTML = items.map(function(key) {
    var item = userInventory[key];
    var isLow = item.amount <= (item.lowStockThreshold || 100);
    var statusIcon = isLow ? '🟡' : '🟢';
    var expiry = item.expiryDate ? '<div style="font-size:12px;color:var(--text3)">📅 ' + item.expiryDate + '</div>' : '';

    return '<div class="card" style="padding:12px 14px;margin-bottom:10px">\
      <div style="display:flex;align-items:center;justify-content:space-between">\
        <div style="flex:1;min-width:0">\
          <div style="font-size:15px;font-weight:500">' + item.name + ' ' + statusIcon + '</div>\
          <div style="font-size:13px;color:var(--text2);margin-top:2px">' + item.amount + ' ' + item.unit + '</div>\
          ' + expiry + '\
        </div>\
        <div style="display:flex;align-items:center;gap:4px">\
          <div class="inv-btn" onclick="adjustInventory(\'' + key + '\', -10)" style="font-size:14px;width:28px;height:28px">-10</div>\
          <div class="inv-btn" onclick="adjustInventory(\'' + key + '\', -1)" style="font-size:16px;width:28px;height:28px">-</div>\
          <input type="number" class="s-input" style="width:56px;text-align:center;padding:6px;font-size:15px" value="' + item.amount + '" onchange="setInventoryAmount(\'' + key + '\', this.value)">\
          <div class="inv-btn" onclick="adjustInventory(\'' + key + '\', 1)" style="font-size:16px;width:28px;height:28px">+</div>\
          <div class="inv-btn" onclick="adjustInventory(\'' + key + '\', 10)" style="font-size:14px;width:28px;height:28px">+10</div>\
        </div>\
      </div>\
      <div style="display:flex;gap:8px;margin-top:8px">\
        <div style="font-size:12px;color:var(--text3);cursor:pointer" onclick="setExpiry(\'' + key + '\')">' + (item.expiryDate ? '📅 改保质期' : '📅 设保质期') + '</div>\
        <div style="font-size:12px;color:var(--red);cursor:pointer;margin-left:auto" onclick="deleteInventoryItem(\'' + key + '\')">🗑️</div>\
      </div>\
    </div>';
  }).join('');
}

function adjustInventory(key, delta) {
  if (userInventory[key]) {
    userInventory[key].amount = Math.max(0, (userInventory[key].amount || 0) + delta);
    dbPut('inventory', userInventory[key]).then(function() { renderInventoryItems(document.querySelector('#viewInventory .filter-chip.on').dataset.cat); });
  }
}

function setInventoryAmount(key, value) {
  if (userInventory[key]) {
    userInventory[key].amount = Math.max(0, parseInt(value) || 0);
    dbPut('inventory', userInventory[key]).then(function() { renderInventoryItems(document.querySelector('#viewInventory .filter-chip.on').dataset.cat); });
  }
}

function setExpiry(key) {
  var current = userInventory[key].expiryDate || '';
  var newDate = prompt('设置保质期 (YYYY-MM-DD):', current);
  if (newDate !== null) {
    userInventory[key].expiryDate = newDate;
    dbPut('inventory', userInventory[key]).then(function() { renderInventoryItems(document.querySelector('#viewInventory .filter-chip.on').dataset.cat); });
  }
}

function deleteInventoryItem(key) {
  if (confirm('删除 ' + userInventory[key].name + '？')) {
    delete userInventory[key];
    dbDelete('inventory', key).then(function() { renderInventoryItems(document.querySelector('#viewInventory .filter-chip.on').dataset.cat); });
  }
}

function addInventoryItem() {
  var name = prompt('材料名称：');
  if (!name) return;
  if (userInventory[name]) {
    toast('⚠️ ' + name + ' 已存在');
    return;
  }
  var amount = parseInt(prompt('初始数量：', '0')) || 0;
  var unit = prompt('单位（ml/g/个/片/根）：', 'ml') || 'ml';
  var category = prompt('分类（base_spirit/juice/syrup/garnish/other）：', 'other') || 'other';

  userInventory[name] = {
    name: name,
    amount: Math.max(0, amount),
    unit: unit,
    category: category,
    lowStockThreshold: userPrefs.lowStockThreshold || 100,
    lowStockNotified: false
  };
  dbPut('inventory', userInventory[name]).then(function() {
    renderInventoryItems(document.querySelector('#viewInventory .filter-chip.on').dataset.cat);
    toast('✅ 已添加 ' + name);
  });
}

// ===== 购物清单 =====
function renderShopping() {
  var items = Object.keys(userShopping);
  var purchased = items.filter(function(k) { return userShopping[k].purchased; });
  var unpurchased = items.filter(function(k) { return !userShopping[k].purchased; });

  var html = '';

  if (unpurchased.length) {
    html += '<div style="font-size:14px;color:var(--text2);margin-bottom:12px;font-family:serif">── 待购买 ──</div>';
    html += unpurchased.map(function(key) {
      var item = userShopping[key];
      return '<div class="card" style="padding:14px">\
        <div style="display:flex;align-items:center;justify-content:space-between">\
          <div style="flex:1">\
            <div style="font-size:17px;font-family:serif">' + item.name + '</div>\
            <div style="font-size:14px;color:var(--text2)">── ' + item.amount + ' ' + item.unit + '</div>\
          </div>\
          <div style="display:flex;gap:8px">\
            <button class="btn-secondary" style="width:auto;padding:8px 16px;font-size:14px" onclick="markPurchased(\'' + key + '\')">✓ 已买</button>\
          </div>\
        </div>\
      </div>';
    }).join('');
  }

  if (purchased.length) {
    html += '<div style="font-size:14px;color:var(--text2);margin:16px 0 12px;font-family:serif">── 已购买 ──</div>';
    html += purchased.map(function(key) {
      var item = userShopping[key];
      return '<div class="card" style="padding:14px;opacity:0.6">\
        <div style="display:flex;align-items:center;justify-content:space-between">\
          <div>\
            <div style="font-size:17px;font-family:serif;text-decoration:line-through">' + item.name + '</div>\
            <div style="font-size:14px;color:var(--text2)">── ' + item.amount + ' ' + item.unit + '</div>\
          </div>\
          <div style="font-size:12px;color:var(--text3)">✓</div>\
        </div>\
      </div>';
    }).join('');
  }

  if (!items.length) {
    html = '<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px;margin-bottom:12px">🛒</div><div>购物清单是空的</div><div style="font-size:13px;margin-top:8px">从配方或缺料中添加吧</div></div>';
  }

  html += '<div style="padding:16px"><button class="btn-secondary" onclick="addManualShopping()">+ 手动添加</button></div>';

  $('shoppingList').innerHTML = html;
}

function loadShopping() {
  renderShopping();
}

function markPurchased(key) {
  var item = userShopping[key];
  var qty = prompt(item.name + ' — 购买数量？', item.amount + ' ' + item.unit);
  if (qty === null) return;

  var match = qty.match(/(\d+)/);
  var buyAmount = match ? parseInt(match[1]) : item.amount;

  if (!userInventory[key]) {
    userInventory[key] = {
      name: item.name,
      amount: 0,
      unit: item.unit || 'ml',
      category: 'other',
      lowStockThreshold: userPrefs.lowStockThreshold || 100,
      lowStockNotified: false
    };
  }
  userInventory[key].amount = (userInventory[key].amount || 0) + buyAmount;

  delete userShopping[key];

  Promise.all([
    dbPut('inventory', userInventory[key]),
    dbDelete('shopping', key)
  ]).then(function() {
    renderShopping();
    toast('✅ 已补库存');
  });
}

function addManualShopping() {
  var name = prompt('物品名称：');
  if (!name) return;
  var amount = parseInt(prompt('数量：', '1')) || 1;
  var unit = prompt('单位（ml/g/个/片）：', 'ml') || 'ml';

  if (userShopping[name]) {
    userShopping[name].amount += amount;
  } else {
    userShopping[name] = { name: name, amount: amount, unit: unit, purchased: false };
  }
  saveShopping().then(function() {
    renderShopping();
    toast('✅ 已添加');
  });
}

// ===== 随便来一杯 =====
function renderRandom() {
  var el = $('viewRandom');
  el.innerHTML = '\
    <div class="header"><h1>随便来一杯</h1></div>\
    <div class="card" style="text-align:center;padding:24px">\
      <div style="font-size:48px;margin-bottom:12px">🎲</div>\
      <button class="btn-primary" onclick="recommendClassic()" style="margin-bottom:12px">🎯 从经典配方中推荐</button>\
      <div style="font-size:13px;color:var(--text3)">优先推荐你用现有材料就能调的酒</div>\
    </div>\
    <div style="font-size:13px;color:var(--text2);margin-bottom:8px;padding:0 16px">口味偏好</div>\
    <div class="card" style="padding:14px">\
      <div style="display:flex;flex-wrap:wrap;gap:8px">\
        <label class="filter-chip on" onclick="this.classList.toggle(\'on\')">不限</label>\
        <label class="filter-chip" onclick="this.classList.toggle(\'on\')">🍬 甜</label>\
        <label class="filter-chip" onclick="this.classList.toggle(\'on\')">🍋 酸</label>\
        <label class="filter-chip" onclick="this.classList.toggle(\'on\')">☕ 苦</label>\
        <label class="filter-chip" onclick="this.classList.toggle(\'on\')">🌶️ 辣</label>\
      </div>\
    </div>\
    <div id="randomResult"></div>';
}

function recommendClassic() {
  var pool = allRecipes.filter(function(r) {
    return r.ingredients && r.ingredients.length > 0;
  });

  var selected = document.querySelectorAll('#viewRandom .filter-chip.on');
  var flavors = [];
  selected.forEach(function(el) {
    var text = el.textContent.trim();
    if (text !== '不限') flavors.push(text.replace(/[🍬🍋☕🌶️\s]/g, ''));
  });

  if (flavors.length > 0) {
    pool = pool.filter(function(r) {
      return flavors.some(function(f) { return r.flavor.some(function(rf) { return rf === f; }); });
    });
  }

  if (!pool.length) {
    $('randomResult').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">没有找到匹配的配方，换个条件试试</div>';
    return;
  }

  // Sort: how many ingredients user has
  pool.sort(function(a, b) {
    var scoreA = scoreRecipe(a);
    var scoreB = scoreRecipe(b);
    return scoreB - scoreA;
  });

  var top = pool.slice(0, 3);
  $('randomResult').innerHTML = top.map(function(r, i) {
    var score = scoreRecipe(r);
    var matchText = score === (r.ingredients || []).length ? '✨ 材料齐全！' : '⚠️ 缺 ' + ((r.ingredients || []).length - score) + ' 种材料';
    return '<div class="card" style="padding:16px;margin:0 16px 12px">\
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">' + (i === 0 ? '🏆 ' : '') + r.name + '</div>\
      <div style="font-size:13px;color:var(--text2);margin-bottom:8px">' + (r.baseSpirit || []).join(' · ') + ' ' + (r.flavor || []).join(' · ') + '</div>\
      <div style="font-size:13px;color:var(--text3);margin-bottom:8px">' + matchText + '</div>\
      <button class="btn-secondary" style="width:auto;padding:8px 20px;font-size:14px" onclick="openRecipe(\'' + r.id + '\')">看配方</button>\
    </div>';
  }).join('');
}

function scoreRecipe(r) {
  if (!r.ingredients) return 0;
  return r.ingredients.filter(function(ing) {
    return userInventory[ing.name] && userInventory[ing.name].amount > 0;
  }).length;
}

// ===== 教程 =====
var TUTORIALS = [
  {
    id: 'shaking',
    icon: '🍸',
    title: '摇酒的正确姿势',
    desc: '摇酒壶加冰到八分满，用力摇晃 10-15 秒，听到冰声变小即可。',
    content: '摇酒是鸡尾酒制作中最常用的手法之一。正确的摇酒姿势能让你的鸡尾酒充分冰镇并适度稀释，口感更加顺滑。\n\n1. 将摇酒壶加冰到八分满\n2. 加入所有液体材料\n3. 盖上壶盖，用食指抵住\n4. 用力摇晃 10-15 秒\n5. 听到冰块碰撞声变小时即可\n6. 用滤网过滤倒入酒杯'
  },
  {
    id: 'ice',
    icon: '🧊',
    title: '如何制作完美的大冰球',
    desc: '大冰球融化慢，适合需要长时间冰镇的鸡尾酒，不会过快稀释。',
    content: '大冰球是威士忌等烈酒的最佳拍档。\n\n1. 用大冰球模具装满水\n2. 放入冰箱冷冻 4-6 小时\n3. 取出后等待 1-2 分钟让它稍微融化\n4. 直接放入酒杯即可'
  },
  {
    id: 'garnish',
    icon: '✂️',
    title: '修边与装饰技巧',
    desc: '一杯好看的鸡尾酒从杯边开始。学会修边让你的鸡尾酒从"能喝"到"好看"。',
    content: '装饰是鸡尾酒的灵魂之一。\n\n1. 将杯边擦湿（用青柠片擦拭）\n2. 在 saucer 上倒一圈糖或盐\n3. 将杯口倒扣进去旋转\n4. 用薄荷叶、青柠片装饰\n5. 装饰物不要太拥挤，留白很重要'
  },
  {
    id: 'spirits',
    icon: '🥃',
    title: '六大基酒入门',
    desc: '伏特加、金酒、朗姆酒、龙舌兰、威士忌、白兰地——了解它们的性格和经典搭配。',
    content: '六大基酒是鸡尾酒的基础：\n\n🥃 伏特加：中性口感，适合调制清爽型鸡尾酒\n🥃 金酒：杜松子香气，适合 Martini、Gin Tonic\n🥃 朗姆酒：甜美热带风情，Mojito、Pina Colada\n🥃 龙舌兰：墨西哥灵魂，Margarita、Tequila Sunrise\n🥃 威士忌：醇厚复杂，Old Fashioned、Whiskey Sour\n🥃 白兰地：优雅细腻，Sidecar、Brandy Alexander'
  },
  {
    id: 'tools',
    icon: '🔧',
    title: '家庭吧台必备器具',
    desc: '不需要专业吧台，这些基础器具就能让你在家调出专业级的鸡尾酒。',
    content: '入门吧台清单：\n\n1. 摇酒壶（Boston Shaker）\n2. 量酒器（Jigger）— 30ml/15ml\n3. 吧勺（Bar Spoon）\n4. 滤冰器（Strainer）\n5. 捣棒（Muddler）\n6. 冰球模具（Ice Sphere Mold）\n7. 调酒壶（搅拌杯）\n8. 杯具：马提尼杯、古典杯、高球杯'
  }
];

function renderTutorials() {
  var html = '<div class="header"><h1>新手教程</h1></div>';
  html += TUTORIALS.map(function(t) {
    return '<div class="tutorial-card">\
      <div class="tutorial-thumb">' + t.icon + '</div>\
      <div class="tutorial-body">\
        <div class="tutorial-title">' + t.title + '</div>\
        <div class="tutorial-desc">' + t.desc + '</div>\
        <div style="margin-top:10px;color:var(--accent);font-size:14px;cursor:pointer" onclick="openTutorial(\'' + t.id + '\')">阅读教程 →</div>\
      </div>\
    </div>';
  }).join('');
  $('viewTutorials').innerHTML = html;
}

function openTutorial(id) {
  var t = TUTORIALS.find(function(x) { return x.id === id; });
  if (!t) return;
  var content = t.content.replace(/\n/g, '<br>');
  $('viewTutorialDetail').innerHTML = '\
    <div class="header"><div class="back" onclick="showView(\'viewTutorials\')">←</div></div>\
    <div class="card">\
      <div style="font-size:36px;text-align:center;margin-bottom:12px">' + t.icon + '</div>\
      <div style="font-size:20px;font-weight:700;margin-bottom:12px">' + t.title + '</div>\
      <div style="font-size:15px;color:var(--text2);line-height:1.8">' + content + '</div>\
    </div>';
  showView('viewTutorialDetail');
}

// ===== 设置 =====
function renderSettings() {
  $('viewSettings').innerHTML = '\
    <div class="header"><h1>设置</h1></div>\
    <div class="card">\
      <div class="card-title">低库存阈值</div>\
      <div style="font-size:14px;color:var(--text2);margin-bottom:8px">当库存低于此值时提醒</div>\
      <input type="number" class="s-input" id="thresholdInput" value="' + (userPrefs.lowStockThreshold || 100) + '" style="width:120px">\
      <button class="btn-primary" style="margin-top:12px;width:auto;padding:10px 24px" onclick="saveThreshold()">保存</button>\
    </div>\
    <div class="card">\
      <div class="card-title">过期预警</div>\
      <div style="font-size:14px;color:var(--text2);margin-bottom:8px">提前几天提醒</div>\
      <input type="number" class="s-input" id="expiryWarningInput" value="' + (userPrefs.expiryWarningDays || 3) + '" style="width:120px">\
      <button class="btn-primary" style="margin-top:12px;width:auto;padding:10px 24px" onclick="saveExpiryWarning()">保存</button>\
    </div>\
    <div class="card">\
      <div class="card-title">数据管理</div>\
      <button class="btn-secondary" style="margin-top:8px" onclick="checkLowStock()">⚠️ 查看低库存清单</button>\
      <button class="btn-secondary" style="margin-top:8px;margin-left:8px;color:var(--red);border-color:var(--red)" onclick="clearAllData()">🗑️ 清除所有数据</button>\
    </div>';
}

function saveThreshold() {
  userPrefs.lowStockThreshold = parseInt($('thresholdInput').value) || 100;
  dbPut('prefs', { key: 'lowStockThreshold', value: userPrefs.lowStockThreshold }).then(function() { toast('✅ 阈值已保存'); });
}

function saveExpiryWarning() {
  userPrefs.expiryWarningDays = parseInt($('expiryWarningInput').value) || 3;
  dbPut('prefs', { key: 'expiryWarningDays', value: userPrefs.expiryWarningDays }).then(function() { toast('✅ 已保存'); });
}

function checkLowStock() {
  var items = Object.keys(userInventory).filter(function(k) {
    var item = userInventory[k];
    return item.amount <= (item.lowStockThreshold || 100);
  });

  if (!items.length) {
    toast('✅ 库存充足');
    return;
  }

  var list = items.map(function(k) {
    return userInventory[k].name + ': ' + userInventory[k].amount + ' ' + userInventory[k].unit;
  }).join('\n');

  alert('低库存清单：\n\n' + list);
}

function clearAllData() {
  if (!confirm('确定清除所有数据？此操作不可恢复！')) return;
  if (!confirm('真的确定？库存、收藏、调酒记录都会被清空！')) return;

  userInventory = {};
  userBrewCounts = {};
  userFavorites = {};
  userShopping = {};
  userPrefs = {};

  Promise.all([
    dbClear('inventory'),
    dbClear('brewCounts'),
    dbClear('favorites'),
    dbClear('shopping'),
    dbClear('prefs')
  ]).then(function() {
    toast('🗑️ 数据已清除');
    renderSettings();
  });
}

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', init);
