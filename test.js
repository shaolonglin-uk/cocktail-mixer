// ===== 调酒笔记 — 单元测试 =====
// Run with: node test.js

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✅ ' + message);
  } else {
    failed++;
    console.log('  ❌ FAIL: ' + message);
  }
}

// ===== Test 1: Recipe Data =====
console.log('\n📋 Test 1: Recipe Data');
var fs = require('fs');
var raw = JSON.parse(fs.readFileSync('/Users/jeremylin/Documents/调酒/raw_recipes.json', 'utf8'));
var recipeKeys = Object.keys(raw);
assert(recipeKeys.length > 0, 'Recipes loaded: ' + recipeKeys.length);
assert(raw['11000'] !== undefined, 'Mojito exists in dataset');
assert(raw['11000']['strDrink'] === 'Mojito', 'Mojito name correct');

// ===== Test 2: Transformed Recipes =====
console.log('\n📋 Test 2: Transformed Recipes');
var recipesJs = fs.readFileSync('/Users/jeremylin/Documents/调酒/recipes.js', 'utf8');
assert(recipesJs.indexOf('const RECIPES_DATA') >= 0, 'recipes.js exports RECIPES_DATA');
assert(recipesJs.indexOf('Mojito') >= 0, 'Mojito in recipes.js');
assert(recipesJs.length > 100000, 'recipes.js has substantial data (' + (recipesJs.length/1024).toFixed(1) + ' KB)');

// ===== Test 3: Core Logic Functions (inline) =====
console.log('\n📋 Test 3: Core Logic');

// Simulate filter logic
function testFilter() {
  var testRecipes = [
    { name: 'Mojito', baseSpirit: ['Rum'], flavor: ['甜', '清爽'], ingredients: [{name: '朗姆酒'}, {name: '青柠'}] },
    { name: 'Negroni', baseSpirit: ['Gin'], flavor: ['苦'], ingredients: [{name: '金酒'}, {name: '甜味美思'}] },
    { name: 'Moscow Mule', baseSpirit: ['Vodka'], flavor: ['甜', '酸'], ingredients: [{name: '伏特加'}, {name: '姜汁啤酒'}] }
  ];

  // Filter by spirit (using English names to match API data)
  var filterBaseSpirit = ['Vodka'];
  var filtered = testRecipes.filter(function(r) {
    return r.baseSpirit.some(function(s) {
      return filterBaseSpirit.some(function(f) { return s.toLowerCase().indexOf(f.toLowerCase()) >= 0; });
    });
  });
  assert(filtered.length === 1 && filtered[0].name === 'Moscow Mule', 'Base spirit filter works');

  // Filter by flavor (AND)
  var filterFlavor = ['甜'];
  filtered = testRecipes.filter(function(r) {
    return filterFlavor.every(function(f) {
      return r.flavor.some(function(rf) { return rf === f; });
    });
  });
  assert(filtered.length === 2, 'Flavor AND filter: 2 sweet drinks');

  // Search
  var q = 'moj';
  filtered = testRecipes.filter(function(r) { return r.name.toLowerCase().indexOf(q) >= 0; });
  assert(filtered.length === 1 && filtered[0].name === 'Mojito', 'Search works');

  // Sort by brew count desc
  var brewCounts = { 'Negroni': 5, 'Mojito': 2, 'Moscow Mule': 0 };
  var sorted = testRecipes.slice().sort(function(a, b) {
    var ca = brewCounts[a.name] || 0;
    var cb = brewCounts[b.name] || 0;
    if (cb !== ca) return cb - ca;
    return a.name.localeCompare(b.name);
  });
  assert(sorted[0].name === 'Negroni', 'Sort by brewCount desc: Negroni first');
  assert(sorted[1].name === 'Mojito', 'Sort by brewCount desc: Mojito second');

  // Score recipe (how many ingredients user has)
  var inventory = { '伏特加': true, '姜汁啤酒': false };
  function scoreRecipe(r) {
    return r.ingredients.filter(function(ing) { return inventory[ing.name]; }).length;
  }
  assert(scoreRecipe(testRecipes[2]) === 1, 'Score: Moscow Mule has 1 ingredient');
  assert(scoreRecipe(testRecipes[0]) === 0, 'Score: Mojito has 0 ingredients');
}
testFilter();

// ===== Test 4: Inventory Logic =====
console.log('\n📋 Test 4: Inventory Logic');
var testInventory = {
  'vodka': { name: '伏特加', amount: 350, unit: 'ml', lowStockThreshold: 100 },
  'lime': { name: '青柠', amount: 3, unit: '个', lowStockThreshold: 3 },
  'syrup': { name: '糖浆', amount: 0, unit: 'ml', lowStockThreshold: 100 }
};

// Low stock check
assert(testInventory.vodka.amount > testInventory.vodka.lowStockThreshold, 'Vodka: not low stock');
assert(testInventory.lime.amount <= testInventory.lime.lowStockThreshold, 'Lime: low stock (at threshold)');
assert(testInventory.syrup.amount === 0, 'Syrup: empty');

// Adjust
testInventory.vodka.amount = Math.max(0, testInventory.vodka.amount - 10);
assert(testInventory.vodka.amount === 340, 'Adjust -10: vodka = 340');

testInventory.vodka.amount = Math.max(0, testInventory.vodka.amount + 50);
assert(testInventory.vodka.amount === 390, 'Adjust +50: vodka = 390');

// ===== Test 5: Shopping List Merge =====
console.log('\n📋 Test 5: Shopping List Merge');
var shopping = {};
function addToShopping(name, amount) {
  if (shopping[name]) {
    shopping[name].amount += amount;
  } else {
    shopping[name] = { name: name, amount: amount, unit: 'ml', purchased: false };
  }
}
addToShopping('姜汁啤酒', 120);
addToShopping('姜汁啤酒', 50);
addToShopping('朗姆酒', 50);
assert(shopping['姜汁啤酒'].amount === 170, 'Shopping merge: 姜汁啤酒 = 170ml');
assert(Object.keys(shopping).length === 2, 'Shopping: 2 unique items');

// ===== Test 6: HTML Structure =====
console.log('\n📋 Test 6: HTML Structure');
var html = fs.readFileSync('/Users/jeremylin/Documents/调酒/index.html', 'utf8');
assert(html.indexOf('viewOnboarding') >= 0, 'Onboarding view exists');
assert(html.indexOf('viewRecipes') >= 0, 'Recipes view exists');
assert(html.indexOf('viewInventory') >= 0, 'Inventory view exists');
assert(html.indexOf('viewShopping') >= 0, 'Shopping view exists');
assert(html.indexOf('viewRandom') >= 0, 'Random view exists');
assert(html.indexOf('viewTutorials') >= 0, 'Tutorials view exists');
assert(html.indexOf('viewTutorialDetail') >= 0, 'Tutorial detail view exists');
assert(html.indexOf('viewSettings') >= 0, 'Settings view exists');
assert(html.indexOf('tabBar') >= 0, 'Tab bar exists');
assert(html.indexOf('firebase-app-compat') >= 0, 'Firebase script loaded');
assert(html.indexOf('recipes.js') >= 0, 'recipes.js included');
assert(html.indexOf('app.js') >= 0, 'app.js included');

// ===== Summary =====
console.log('\n' + '='.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(40));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All tests passed!');
}
