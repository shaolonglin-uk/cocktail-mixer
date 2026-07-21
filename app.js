/* ===== 调酒笔记 — 主应用逻辑 v0.3 ===== */

// ===== Firebase 配置 =====
if (typeof firebase === 'undefined') {
  // Firebase SDK failed to load (likely blocked by GFW)
  document.addEventListener('DOMContentLoaded', function() {
    var el = $('viewOnboarding');
    if (el) {
      el.innerHTML = '\
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:40px 20px;background:#FBF7F2">\
          <div style="font-size:56px">🌐</div>\
          <div style="font-size:20px;font-weight:700;color:#3D2C2C;font-family:-apple-system,\'SF Pro\',\'PingFang SC\',sans-serif">需要连接网络服务</div>\
          <div style="font-size:14px;color:#8B7E74;text-align:center;line-height:1.8;font-family:-apple-system,\'SF Pro\',\'PingFang SC\',sans-serif">\
            调酒笔记需要连接到 Firebase 云端服务<br>\
            请确保你的网络可以访问国际互联网<br>\
            开启 VPN 或代理后刷新页面即可\
          </div>\
          <button class="btn-primary" style="margin-top:16px" onclick="location.reload()">刷新页面</button>\
        </div>';
    }
  });
} else {
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();

  // ===== 全局状态 =====
  let currentUser = null;
  let recipesSeeded = false;
  let userInventory = {};
  let userBrewCounts = {};
  let userFavorites = {};
  let userShopping = {};
  let userPrefs = {};
  let allRecipes = [];
  let recipeCacheReady = false;

  // 筛选状态
  let filterBaseSpirit = [];
  let filterFlavor = [];
  let searchQuery = '';

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

// ===== 初始化 =====
function init() {
  try {
    db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
      if (err.code !== 'failed-precondition') console.error('Persistence error:', err);
    });
  } catch(e) {
    console.error('Firebase init error:', e);
    showFirebaseError();
    return;
  }

  // Tab bar 事件
  document.querySelectorAll('#tabBar button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var view = btn.dataset.view;
      if (view === 'viewInventory') loadInventory();
      if (view === 'viewShopping') loadShopping();
      if (view === 'viewRecipes') loadRecipeList();
      if (view === 'viewRandom') renderRandom();
      if (view === 'viewTutorials') renderTutorials();
      showView(view);
    });
  });

  auth.onAuthStateChanged(function(user) {
    currentUser = user;
    if (user) {
      loadUserData();
    } else {
      auth.signInAnonymously().catch(function(e) {
        console.error('Auth error:', e);
        showFirebaseError();
      });
    }
  });
}

function showFirebaseError() {
  var el = $('viewOnboarding');
  if (el) {
    el.innerHTML = '\
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:40px 20px">\
        <div style="font-size:48px">😅</div>\
        <div style="font-size:18px;font-weight:600">网络好像不太给力</div>\
        <div style="font-size:14px;color:var(--text3);text-align:center">请检查网络连接后刷新页面<br>或者稍后再试</div>\
        <button class="btn-primary" style="margin-top:16px" onclick="location.reload()">刷新页面</button>\
      </div>';
  }
}

// ===== 加载用户数据 =====
function loadUserData() {
  var uid = currentUser.uid;
  var ref = db.collection('users').doc(uid);
  ref.get().then(function(doc) {
    if (doc.exists) {
      var d = doc.data();
      userPrefs = d.prefs || {};
      userInventory = d.inventory || {};
      userBrewCounts = d.brewCounts || {};
      userFavorites = d.favorites || {};
      userShopping = d.shopping || {};
    }
    return ref.collection('meta').doc('recipesSeeded').get();
  }).then(function(seedDoc) {
    recipesSeeded = seedDoc.exists;
    if (!recipesSeeded) {
      return seedRecipes();
    }
    return loadRecipesFromFirestore();
  }).then(function() {
    if (userPrefs.onboardingDone) {
      showView('viewRecipes');
      loadRecipeList();
    } else {
      renderOnboarding();
      showView('viewOnboarding');
    }
  }).catch(function(err) {
    console.error('loadUserData error:', err);
    showFirebaseError();
  });
}

// ===== 导入配方数据到 Firestore =====
function seedRecipes() {
  return new Promise(function(resolve, reject) {
    if (typeof RECIPES_DATA === 'undefined') {
      console.warn('RECIPES_DATA not loaded');
      resolve();
      return;
    }
    var batch = db.batch();
    var recipesRef = db.collection('recipes');
    var count = 0;
    RECIPES_DATA.forEach(function(r) {
      var docRef = recipesRef.doc(r.id);
      batch.set(docRef, r);
      count++;
      if (count % 500 === 0) {
        batch.commit().then(function() {
          console.log('Committed ' + count + ' recipes');
        }).catch(reject);
        batch = db.batch();
      }
    });
    batch.commit().then(function() {
      console.log('All ' + count + ' recipes seeded');
      // Mark as seeded
      return db.collection('users').doc(currentUser.uid).collection('meta').doc('recipesSeeded').set({ timestamp: Date.now() });
    }).then(function() {
      recipesSeeded = true;
      allRecipes = RECIPES_DATA;
      recipeCacheReady = true;
      resolve();
    }).catch(reject);
  });
}

function loadRecipesFromFirestore() {
  return new Promise(function(resolve) {
    db.collection('recipes').get().then(function(snap) {
      allRecipes = [];
      snap.forEach(function(doc) {
        allRecipes.push(doc.data());
      });
      allRecipes.sort(function(a, b) { return a.name.localeCompare(b.name); });
      recipeCacheReady = true;
      resolve();
    }).catch(function(e) {
      console.error('loadRecipes error:', e);
      allRecipes = typeof RECIPES_DATA !== 'undefined' ? RECIPES_DATA : [];
      recipeCacheReady = true;
      resolve();
    });
  });
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
  // 收集口味偏好
  var flavors = [];
  document.querySelectorAll('.flavor-opt.on').forEach(function(el) {
    flavors.push(el.dataset.flavor);
  });
  userPrefs.flavorPrefs = flavors;
  userPrefs.onboardingDone = true;

  if (doInventory) {
    // 跳转到酒柜页录入库存
    savePrefs().then(function() {
      showView('viewInventory');
      renderInventory();
    });
  } else {
    userPrefs.skippedOnboarding = true;
    savePrefs().then(function() {
      showView('viewRecipes');
      loadRecipeList();
    });
  }
}

function savePrefs() {
  if (!currentUser) return Promise.resolve();
  return db.collection('users').doc(currentUser.uid).set(
    { prefs: userPrefs }, { merge: true }
  );
}

// ===== 配方列表 =====
function loadRecipeList() {
  renderFilterBar();
  filterAndRenderRecipes();
}

function renderFilterBar() {
  var spirits = ['伏特加', '金酒', '朗姆', '龙舌兰', '威士忌', '白兰地', '利口酒'];
  var flavors = ['甜', '酸', '苦', '辣', '清爽'];

  var spiritHtml = spirits.map(function(s) {
    var checked = filterBaseSpirit.indexOf(s) >= 0 ? ' checked' : '';
    return '<label class="filter-chip' + checked + '" onclick="toggleFilterSpirit(\'' + s + '\', this)">' + s + '</label>';
  }).join('');

  var flavorHtml = flavors.map(function(f) {
    var checked = filterFlavor.indexOf(f) >= 0 ? ' checked' : '';
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
    // Search
    if (q && r.name.toLowerCase().indexOf(q) < 0) return false;
    // Base spirit filter (OR within category, AND between categories)
    if (filterBaseSpirit.length > 0) {
      var spiritMatch = r.baseSpirit.some(function(s) {
        return filterBaseSpirit.some(function(f) { return s.toLowerCase().indexOf(f.toLowerCase()) >= 0; });
      });
      if (!spiritMatch) return false;
    }
    // Flavor filter (AND)
    if (filterFlavor.length > 0) {
      var flavorMatch = filterFlavor.every(function(f) {
        return r.flavor.some(function(rf) { return rf.toLowerCase() === f.toLowerCase(); });
      });
      if (!flavorMatch) return false;
    }
    return true;
  });

  // Sort: by brewCount desc, then by name
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
    var isFav = userFavorites[r.id];
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

  // Check what user has in inventory
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

  // Tags
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

  // Ingredients
  h += '<div class="card">\
    <div class="card-title">材料</div>\
    ' + materials + '\
  </div>';

  // Missing materials
  if (missing.length > 0) {
    h += '<div class="card" style="background:#FFF5F5;border:1px solid #FFD0D0">\
      <div class="card-title" style="color:var(--red)">⚠️ 缺少的材料</div>\
      ' + missing.map(function(m) { return '<div style="font-size:14px;color:var(--red);padding:2px 0">' + m + '</div>'; }).join('') + '\
    </div>';
  }

  // Steps
  if (r.steps && r.steps.length) {
    h += '<div class="card">\
      <div class="card-title">步骤</div>\
      ' + r.steps.map(function(s, i) {
        return '<div class="step-item"><div class="step-num">' + (i + 1) + '</div><div class="step-text">' + s + '</div></div>';
      }).join('') + '\
    </div>';
  }

  // Substitutes
  if (r.substitutes && r.substitutes.length) {
    h += '<div class="card" style="background:var(--surface2)">\
      <div class="card-title">💡 替换建议</div>\
      ' + r.substitutes.map(function(sub) {
        return '<div style="font-size:14px;padding:4px 0">' + sub.original + ' → ' + sub.substitute + '</div>';
      }).join('') + '\
    </div>';
  }

  // Actions
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
  } else {
    userFavorites[recipeId] = true;
  }
  saveUserData().then(function() { openRecipe(recipeId); });
}

function incrementBrew(recipeId) {
  userBrewCounts[recipeId] = (userBrewCounts[recipeId] || 0) + 1;
  saveUserData().then(function() { openRecipe(recipeId); });
}

function brewRecipe(recipeId) {
  var r = allRecipes.find(function(x) { return x.id === recipeId; });
  if (!r) return;

  // Auto deduct inventory
  var updated = false;
  (r.ingredients || []).forEach(function(ing) {
    var inv = userInventory[ing.name];
    if (inv && inv.amount > 0) {
      inv.amount = Math.max(0, inv.amount - 1);
      updated = true;
    }
  });

  // Increment brew count
  userBrewCounts[recipeId] = (userBrewCounts[recipeId] || 0) + 1;

  var savePromise = updated ? saveUserData() : saveBrewCounts();

  savePromise.then(function() {
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
      if (!userShopping[ing.name]) {
        userShopping[ing.name] = {
          name: ing.name,
          amount: 1,
          unit: ing.unit || '',
          purchased: false
        };
      } else {
        userShopping[ing.name].amount += 1;
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

function loadInventory() {
  // renderInventory is called via tab click
}

function adjustInventory(key, delta) {
  if (userInventory[key]) {
    userInventory[key].amount = Math.max(0, (userInventory[key].amount || 0) + delta);
    saveUserData().then(function() { renderInventory(); });
  }
}

function setInventoryAmount(key, value) {
  if (userInventory[key]) {
    userInventory[key].amount = Math.max(0, parseInt(value) || 0);
    saveUserData().then(function() { renderInventory(); });
  }
}

function setExpiry(key) {
  var current = userInventory[key].expiryDate || '';
  var newDate = prompt('设置保质期 (YYYY-MM-DD):', current);
  if (newDate !== null) {
    userInventory[key].expiryDate = newDate;
    saveUserData().then(function() { renderInventory(); });
  }
}

function deleteInventoryItem(key) {
  if (confirm('删除 ' + userInventory[key].name + '？')) {
    delete userInventory[key];
    saveUserData().then(function() { renderInventory(); });
  }
}

function addInventoryItem() {
  var name = prompt('材料名称：');
  if (!name) return;
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
  saveUserData().then(function() { renderInventory(); toast('✅ 已添加 ' + name); });
}

function saveUserData() {
  if (!currentUser) return Promise.resolve();
  return db.collection('users').doc(currentUser.uid).set({
    inventory: userInventory,
    brewCounts: userBrewCounts,
    favorites: userFavorites,
    prefs: userPrefs
  }, { merge: true });
}

function saveShopping() {
  if (!currentUser) return Promise.resolve();
  return db.collection('users').doc(currentUser.uid).set({ shopping: userShopping }, { merge: true });
}

function saveBrewCounts() {
  if (!currentUser) return Promise.resolve();
  return db.collection('users').doc(currentUser.uid).set({ brewCounts: userBrewCounts }, { merge: true });
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

  // Parse quantity
  var match = qty.match(/(\d+)/);
  var buyAmount = match ? parseInt(match[1]) : item.amount;

  // Add to inventory
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

  // Remove from shopping
  delete userShopping[key];

  saveUserData().then(function() { saveShopping().then(function() { renderShopping(); toast('✅ 已补库存'); }); });
}

function addShoppingItem() {
  var name = prompt('物品名称：');
  if (!name) return;
  var amount = parseInt(prompt('数量：', '1')) || 1;
  var unit = prompt('单位（ml/g/个/片）：', 'ml') || 'ml';

  if (userShopping[name]) {
    userShopping[name].amount += amount;
  } else {
    userShopping[name] = { name: name, amount: amount, unit: unit, purchased: false };
  }
  saveShopping().then(function() { renderShopping(); toast('✅ 已添加'); });
}

function addManualShopping() {
  addShoppingItem();
}

// ===== 随机推荐 =====
function renderRandom() {
  var el = $('viewRandom');
  el.innerHTML = '\
    <div class="header"><h1>随便来一杯</h1></div>\
    <div class="card" style="text-align:center;padding:24px">\
      <div style="font-size:48px;margin-bottom:12px">🎲</div>\
      <button class="btn-primary" onclick="generateAI()" style="margin-bottom:12px">用我的材料随机生成一杯</button>\
      <div style="font-size:13px;color:var(--text3)">看看用现有材料能调出什么新东西</div>\
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
    <div style="padding:0 16px;margin-bottom:8px"><button class="btn-secondary" onclick="recommendClassic()">🎯 从经典配方中推荐</button></div>\
    <div id="randomResult"></div>';
}

function recommendClassic() {
  var pool = allRecipes.filter(function(r) {
    return r.ingredients && r.ingredients.length > 0;
  });

  // Filter by flavor if selected
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

  // Show top 3
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

function generateAI() {
  $('randomResult').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">🎲 正在为你调一杯...</div>';

  // Collect inventory
  var inv = Object.keys(userInventory).map(function(k) {
    return userInventory[k].name + ' (' + userInventory[k].amount + ' ' + userInventory[k].unit + ')';
  }).join(', ');

  if (!inv) {
    $('randomResult').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">你的酒柜还是空的，先去录入一些材料吧！</div>';
    return;
  }

  var flavors = userPrefs.flavorPrefs || [];
  var flavorText = flavors.length ? '偏好风味：' + flavors.join('、') : '无特殊偏好';

  // Call Cloudflare Worker proxy
  var apiUrl = 'https://cocktail-api-proxy.workers.dev/generate';
  fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inventory: inv,
      flavorPrefs: flavorText
    })
  }).then(function(r) { return r.json(); })
  .then(function(data) {
    renderAICocktail(data);
  })
  .catch(function(err) {
    console.error('AI generate error:', err);
    $('randomResult').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">AI 调酒师暂时不在家 😅<br>试试「从经典配方中推荐」吧</div>';
  });
}

function renderAICocktail(data) {
  var materials = (data.ingredients || []).map(function(ing) {
    var invItem = userInventory[ing.name];
    var hasIt = invItem && invItem.amount > 0;
    return '<div class="ing-item"><span class="ing-name">' + ing.name + '</span><span class="ing-amount" style="color:' + (hasIt ? 'var(--green)' : 'var(--red)') + '">' + (hasIt ? '✅' : '❌') + ' ' + ing.amount + '</span></div>';
  }).join('');

  var steps = (data.steps || []).map(function(s, i) {
    return '<div class="step-item"><div class="step-num">' + (i + 1) + '</div><div class="step-text">' + s + '</div></div>';
  }).join('');

  var h = '\
    <div class="card" style="margin:0 16px 12px">\
      <div style="font-size:20px;font-weight:700;margin-bottom:4px">🍸 ' + (data.name || '神秘特饮') + '</div>\
      <div style="font-size:14px;color:var(--text2);margin-bottom:12px">' + (data.description || '') + '</div>\
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px">✨ AI 为你量身定制</div>\
      <div class="card-title">材料</div>' + materials + '\
    </div>\
    <div class="card" style="margin:0 16px 12px">\
      <div class="card-title">步骤</div>' + steps + '\
    </div>\
    <div style="display:flex;gap:8px;padding:0 16px 24px">\
      <button class="btn-primary" style="flex:1" onclick="saveAICocktail()">💾 保存到我的配方</button>\
      <button class="btn-secondary" style="flex:1" onclick="generateAI()">🔄 再生成一杯</button>\
    </div>';

  $('randomResult').innerHTML = h;
  // Store for save
  window._lastAICocktail = data;
}

function saveAICocktail() {
  var data = window._lastAICocktail;
  if (!data) return;
  var name = prompt('给这杯酒起个名字：', data.name || '');
  if (!name) return;

  var recipe = {
    id: 'custom_' + Date.now(),
    name: name,
    baseSpirit: data.baseSpirit || [],
    flavor: data.flavor || [],
    difficulty: 2,
    description: data.description || '',
    image: '',
    glass: data.glass || '',
    garnish: data.garnish || '',
    ingredients: data.ingredients || [],
    steps: data.steps || [],
    brewCount: 0,
    substitutes: [],
    createdBy: currentUser.uid,
    createdAt: Date.now()
  };

  db.collection('users').doc(currentUser.uid).collection('customRecipes').doc(recipe.id).set(recipe)
    .then(function() {
      toast('💾 已保存到你的配方');
    });
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
    </div>';
}

function saveThreshold() {
  userPrefs.lowStockThreshold = parseInt($('thresholdInput').value) || 100;
  savePrefs().then(function() { toast('✅ 阈值已保存'); });
}

function saveExpiryWarning() {
  userPrefs.expiryWarningDays = parseInt($('expiryWarningInput').value) || 3;
  savePrefs().then(function() { toast('✅ 已保存'); });
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

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', init);

} // end else (firebase loaded)
