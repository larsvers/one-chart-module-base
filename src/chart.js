/* eslint-disable prefer-destructuring */
import Flourish from '@flourish/live-api';
import cloneDeep from 'lodash.clonedeep';
import set from 'lodash.set';
// For potential data wrangles:
// import { convertToArrayOfArrays, convertToArrayOfObjects } from './utils.js';

let visual;

// Update bindings.
function validateNewValue(value) {
  // If the value still has the marks, a respective URL param/has wasn't found.
  const valuePrefix = value.slice(0, 2);
  if (valuePrefix === '{{' || valuePrefix === '{{')
    throw Error(`The user defined URL parameter or hash "${value}" could not be found in the URL`);
}

function expandBinding(value) {
  // Test each value if it's supposed to be URL given.
  let paramType;
  const valuePrefix = value.slice(0, 2);
  if (valuePrefix === '{{') paramType = 'url';
  else if (valuePrefix === '##') paramType = 'hash';
  else return value;

  // Expand the value
  let newValue = value;

  if (paramType === 'url') {
    // Get the key the user assumes in the URL.
    const regexURL = /\{\{((?:[^}]|\}[^}])*)\}\}/g;
    const capturingGroup = regexURL.exec(value)[1];

    // Get the URL parameters.
    const paramsString = window.location.search;
    const params = new URLSearchParams(paramsString);

    // Check if the user given key is in fact in the URL.
    // If so, set the URL parameters value as the binding.
    for (const param of params) {
      if (param[0] === capturingGroup) newValue = param[1];
    }
  }

  if (paramType === 'hash') {
    // Get the key the user assumes in the URL.
    const regexHash = /##(.*?)##/g; // https://stackoverflow.com/a/49280662/3219033
    const capturingGroup = regexHash.exec(value)[1];

    // Get the URL hashes (collect them as URL parameters 💡).
    const paramsString = window.location.hash.replace('#', '?'); // https://stackoverflow.com/a/53100323/3219033
    const params = new URLSearchParams(paramsString);

    // As above.
    for (const param of params) {
      if (param[0] === capturingGroup) newValue = param[1];
    }
  }

  validateNewValue(newValue);

  return newValue;
}

function expandBindings(bindings) {
  const expandedBindings = {};
  // For each binding
  Object.entries(bindings).forEach(binding => {
    const key = binding[0];
    const value = binding[1];

    let expandedValue;
    if (typeof value === 'string') {
      expandedValue = expandBinding(value);
    }
    if (Array.isArray(value)) {
      expandedValue = value.map(expandBinding);
    }
    expandedBindings[key] = expandedValue;
  });
  return expandedBindings;
}

function indexBindings(bindings, columns) {
  const indexedBindings = {};

  // For each binding.
  Object.entries(bindings).forEach(binding => {
    const key = binding[0];
    const value = binding[1];

    if (typeof value === 'string') {
      indexedBindings[key] = columns.indexOf(value);
    }
    if (Array.isArray(value)) {
      indexedBindings[key] = value.map(d => columns.indexOf(d));
    }
  });

  return indexedBindings;
}

function setBindings(userBindings) {
  const cloned = cloneDeep(userBindings);

  const expanded = { bindings: {} };
  const indexed = { bindings: {} };

  // For each dataset
  Object.entries(cloned.bindings).forEach(datasetData => {
    const name = datasetData[0];
    const bindings = datasetData[1];
    expanded.bindings[name] = expandBindings(bindings);
    indexed.bindings[name] = indexBindings(expanded.bindings[name], cloned.columns[name]);
  });

  return indexed;
}

// Build.
function buildAPIChart({ base, data, state, userBindings, userSettings }) {
  // Update bindings (maybe expand, definitely index them).
  const updatedBindings = setBindings(userBindings);
  console.log(updatedBindings);

  // Amend settings changed by user.
  const clonedState = cloneDeep(state);

  if (userSettings.length) {
    userSettings.forEach(d => {
      set(clonedState.state, d.setting, d.value);
    });
  }

  // Compose and build visual
  const apiOptions = { ...base, ...data, ...updatedBindings, ...clonedState };

  if (!visual) {
    visual = new Flourish.Live(apiOptions);
  } else {
    visual.update(apiOptions);
  }
}

export { buildAPIChart };
