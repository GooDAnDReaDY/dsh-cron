import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, RECIPE_CATEGORIES, listRecipes, recipesByCategory, recipeRecommendations, findDestructiveRecipe } from '../lib/recipes.js';
import { validateTaskType } from '../lib/task-transfer.js';

test('#48: every recipe is a valid, non-destructive task preset', () => {
  assert.ok(RECIPES.length >= 8, 'the hub ships a real catalog');
  assert.equal(findDestructiveRecipe(), null, 'no recipe contains a destructive command');

  for (const recipe of RECIPES) {
    assert.ok(recipe.id && recipe.title && recipe.description, `${recipe.id} is described`);
    assert.ok(recipe.schedule, `${recipe.id} has a schedule`);
    assert.ok(recipe.prompt, `${recipe.id} has a command`);
    assert.equal(validateTaskType(recipe.type, recipe), null, `${recipe.id} passes the runtime validation`);
    assert.ok(recipe.channels.length > 0, `${recipe.id} suggests a channel`);
  }
});

test('#48: the catalog covers the advertised categories', () => {
  const byCategory = recipesByCategory();
  assert.equal(byCategory.length, RECIPE_CATEGORIES.length);
  for (const category of byCategory) {
    assert.ok(category.recipes.length > 0, `category ${category.id} is not empty`);
  }
  const ids = byCategory.reduce((acc, c) => acc.concat(c.recipes.map((r) => r.id)), []);
  assert.equal(new Set(ids).size, ids.length, 'recipe ids are unique');
});

test('#48: the panel suggestions come from the catalog', () => {
  const recs = recipeRecommendations(4);
  assert.equal(recs.length, 4);
  assert.ok(recs.every((r) => RECIPES.some((recipe) => recipe.id === r.id)), 'every suggestion is a real recipe');
  assert.ok(recs.every((r) => r.type && r.category), 'suggestions carry the runtime and category');
});

test('#48: recipe copies are detached from the catalog', () => {
  const copy = listRecipes();
  copy[0].channels.push('ntfy');
  copy[0].title = 'mutated';
  assert.notEqual(RECIPES[0].title, 'mutated');
  assert.ok(!RECIPES[0].channels.includes('ntfy'));
});

test('#48: the destructive-command guard actually detects something', () => {
  assert.ok(findDestructiveRecipe([{ id: 'bad', prompt: 'rm -rf /var/log/*' }]));
  assert.ok(findDestructiveRecipe([{ id: 'bad', prompt: 'systemctl restart nginx' }]));
  assert.ok(findDestructiveRecipe([{ id: 'bad', prompt: 'docker system prune -f' }]));
  assert.equal(findDestructiveRecipe([{ id: 'ok', prompt: 'df -h' }]), null);
});
