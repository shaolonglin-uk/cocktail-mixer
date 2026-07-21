/* ===== 调酒笔记 — 主应用逻辑 ===== */

// ===== Firebase 配置 =====
// TODO: 替换为实际 Firebase 项目配置
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ===== 状态管理 =====
// --- 状态画表 ---
// 全局状态：
//   currentUser  — Firebase Auth user (null = 未登录)
//   userPrefs    — 口味偏好 + onboarding 状态 → Firestore users/{uid}/prefs
//   inventory    — 库存列表 → Firestore users/{uid}/inventory
//   shoppingList — 购物清单 → Firestore users/{uid}/shopping
//   recipes      — 配方库（公开，内置+自定义）→ Firestore recipes + users/{uid}/customRecipes
//   brewCount    — 调酒次数 → Firestore users/{uid}/brewCounts
//   favorites    — 收藏 → Firestore users/{uid}/favorites
// 内存状态：
//   currentView  — 当前视图 ID
//   today        — 今天日期 YYYY-MM-DD
//   recipeCache  — 配方缓存（避免重复读取 Firestore）
//   unitCache    — 材料单位缓存

let currentUser = null;
let currentView = 'viewOnboarding';
let today = new Date().toISOString().slice(0, 10);
let recipeCache = null;
let unitCache = null;

// ===== 视图切换 =====
function showView(id) {
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('on'); });
  var el = document.getElementById(id);
  if (el) el.classList.add('on');
  currentView = id;
  updateTabBar();
  // 滚动到顶部
  if (el) el.scrollTop = 0;
}

function updateTabBar() {
  var tabMap = { viewRecipes: 0, viewRandom: 1, viewInventory: 2, viewShopping: 3, viewTutorials: 4 };
  var idx = tabMap[currentView];
  document.querySelectorAll('#tabBar button').forEach(function(btn, i) {
    btn.classList.toggle('on', i === idx);
  });
}

// ===== Toast =====
var toastTimer = null;
function toast(msg, cls) {
  var el = document.getElementById('toast') || createToast();
  el.textContent = msg;
  el.className = 'toast show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.className = 'toast'; }, 2000);
}
function createToast() {
  var el = document.createElement('div');
  el.id = 'toast';
  el.className = 'toast';
  document.body.appendChild(el);
  return el;
}

// ===== 初始化 =====
function init() {
  // 启用 Firebase 离线缓存
  db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
    if (err.code !== 'failed-precondition') console.error('Firebase persistence error:', err);
  });

  // 监听登录状态
  auth.onAuthStateChanged(function(user) {
    currentUser = user;
    if (user) {
      loadUserData();
    } else {
      showView('viewOnboarding');
      renderOnboarding();
    }
  });
}

// ===== 加载用户数据 =====
function loadUserData() {
  var uid = currentUser.uid;
  db.collection('users').doc(uid).get().then(function(doc) {
    if (doc.exists && doc.data().onboardingDone) {
      showView('viewRecipes');
      loadRecipes();
    } else {
      showView('viewOnboarding');
      renderOnboarding();
    }
  }).catch(function(err) {
    console.error('loadUserData error:', err);
    showView('viewOnboarding');
    renderOnboarding();
  });
}

// ===== 新手引导 =====
function renderOnboarding() {
  var el = document.getElementById('viewOnboarding');
  el.innerHTML = ''; // 将在后续实现
}

// ===== 配方加载 =====
function loadRecipes() {
  // 将在后续实现
  showView('viewRecipes');
  renderRecipesList();
}

function renderRecipesList() {
  var el = document.getElementById('viewRecipes');
  el.innerHTML = ''; // 将在后续实现
}

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', init);
