/* eslint-disable no-restricted-syntax */
import { group } from 'd3-array';
import { csv, json } from 'd3-fetch';
import { select, selectAll } from 'd3-selection';
import cloneDeep from 'lodash.clonedeep';
import { apiKey, dispatch } from './state.js';

// Globals.
let visJsonOptions;

// Helpers.
function show(selector) {
  selectAll('.ui').style('display', 'none');
  select(selector).style('display', 'flex');
  select('#data-url').style('display', 'flex');
}

async function sendMetadataRequest(templateId, version) {
  // Left out `&auto=1`
  const endpoint = `https://flourish-api.com/api/v1/live/metadata?api_key=${apiKey}&template=${encodeURIComponent(
    templateId
  )}&version=${version}`;
  const result = await json(endpoint);
  return result;
}

async function sendVisJsonRequest(visId) {
  const endpoint = `https://public.flourish.studio/visualisation/${visId}/visualisation.json`;
  const result = await json(endpoint);
  return result;
}

// Convert binding names to indeces and vice versa.
function getBindingNames(bindings, data) {
  // The column names in an array.
  const colNames = data[0];
  const bindingNameObject = {};

  // This will map the column name indeces to the column names.
  for (const key in bindings) {
    // Probably already an object name
    if (typeof bindings[key] === 'string') {
      break;
    }
    // Replace numeric index.
    else if (!isNaN(bindings[key])) {
      bindingNameObject[key] = colNames[bindings[key]];
    }
    // Replace array of numeric indeces.
    else {
      bindingNameObject[key] = bindings[key].map(d => colNames[d]);
    }
  }
  return bindingNameObject;
}

function getBindingIndeces(bindings, data) {
  // The column names in an array.
  const colNames = data[0];
  const bindingIndecesObject = {};

  // This will map the column name indeces to the column names.
  for (const key in bindings) {
    // Probably already an array index
    if (!isNaN(bindings[key])) {
      break;
    }
    // Replace numeric index.
    if (typeof bindings[key] === 'string') {
      bindingIndecesObject[key] = colNames.indexOf(bindings[key]);
    }
    // Replace array of numeric indeces.
    else {
      bindingIndecesObject[key] = bindings[key].map(d => colNames.indexOf(d));
    }
  }
  return bindingIndecesObject;
}

function getObjectBindings(bindingObject, dataArray, direction) {
  // There can be multiple datasets per template (ie. Projection Map has three)
  // First we loop through each dataset here and then get each dataset's bindings.

  // `direction` decides if we move index to name ('to_name') or from name to index ('to_index').

  const objectBindings = {};

  if (direction === 'to_name') {
    for (const bindingKey in bindingObject) {
      objectBindings[bindingKey] = getBindingNames(
        bindingObject[bindingKey],
        dataArray[bindingKey]
      );
    }
  } else if (direction === 'to_index') {
    for (const bindingKey in bindingObject) {
      objectBindings[bindingKey] = getBindingIndeces(
        bindingObject[bindingKey],
        dataArray[bindingKey]
      );
    }
  } else throw Error(`direction argument ${direction} unknown`);

  return objectBindings;
}

// Takes an array of objects and returns an object nested by a specific key
function groupArrayToObjectByKey(array, key) {
  const object = {};
  for (let i = 0; i < array.length; i++) {
    if (i === 0 || array[i][key] !== array[i - 1][key]) {
      object[array[i][key]] = {};
    }
    object[array[i][key]] = { ...object[array[i][key]], ...array[i] };
    delete object[array[i][key]][key];
  }
  return object;
}

// Build.
function buildBindingsUi(bindings, bindingsGiven) {
  const bindingsClean = bindings.filter(d => typeof d !== 'string');
  const bindingsMap = group(bindingsClean, d => d.dataset);

  // Build dataset wrapper div's.
  const datasets = select('#binding-selections')
    .selectAll('.dataset')
    .data(bindingsMap)
    .join('div')
    .attr('class', 'dataset')
    .attr('id', d => d[0])
    .html(d => d[0][0].toUpperCase() + d[0].substring(1));

  // Build an input wrapper for each binding.
  const bindingElements = datasets
    .selectAll('.binding')
    .data(d => d[1])
    .join('div')
    .attr('class', 'binding');

  // Build labels and inputs for each binding.
  bindingElements
    .append('input')
    .attr('type', 'text')
    .attr('id', d => `${d.dataset}-${d.key}`)
    // Fill values if they're given in the original dataset.
    .attr('value', d => bindingsGiven[d.dataset][d.key]);

  bindingElements
    .append('label')
    .attr('for', d => `${d.dataset}-${d.key}`)
    .html(
      d =>
        `${d.name} (${d.type === 'columns' ? 'multi' : 'single'}${d.optional ? ' | optional' : ''})`
    );
}

function buildTemplatePickUI() {
  // This will be a static JSON unless I can find an endpoint for it.
  const templateList = [
    { id: '@flourish/line-bar-pie', versions: [20, 21, 22, 23, 24] },
    { id: '@flourish/projection-map', versions: [10, 11] },
    { id: '@flourish/scatter', versions: [13, 14, 15] },
  ];

  // DOM el's
  const templateSelection = select('#template-id');
  const versionSelection = select('#template-version');

  // Build
  let selectedTemplateId;

  function setVersionSelect(versions) {
    versionSelection
      .selectAll('option')
      .data(versions)
      .join('option')
      .attr('value', d => d)
      .html(d => d);
  }

  templateSelection
    .selectAll('option')
    .data(templateList)
    .join('option')
    .attr('value', d => d.id)
    .html(d => d.id);

  // Handlers
  templateSelection.on('change', function () {
    selectedTemplateId = this.value;
    const { versions } = templateList.filter(d => d.id === selectedTemplateId)[0];
    setVersionSelect(versions);
  });

  versionSelection.on('change', async function () {
    const selectedVersion = this.value;
    const response = await sendMetadataRequest(selectedTemplateId, selectedVersion);
    buildBindingsUi(response.data_bindings);
  });
}

// Submit.
function setColumnType(type, value, keys) {
  if (type === 'column') {
    const idx = keys.indexOf(value);
    return idx < 0 ? '' : idx;
  }
  if (type === 'columns') {
    return value.split(',').map(d => {
      const idx = keys.indexOf(d);
      return idx < 0 ? '' : idx;
    });
  }

  throw Error(`Column type ${type} unknown`);
}

function convertToArrayOfArrays(array) {
  const keys = Object.keys(array[0]);
  const arrayOfArrays = array.map(Object.values);
  arrayOfArrays.unshift(keys);
  return arrayOfArrays;
}

async function handleSubmit() {
  // Get base.
  const base = {
    template: visJsonOptions.template,
    version: visJsonOptions.version,
    api_key: apiKey,
    container: '#chart-container', // ultimately needs to come from WP module
  };

  // Get data
  const dataUrl = select('#data-url-input').node().value;
  let dataset;
  if (dataUrl) {
    // Data comes in as array of objects but we'll
    // convert it to array of arrays to be consistent
    const dataArrayOfObjects = await csv(dataUrl);
    const dataArrayOfArrays = convertToArrayOfArrays(dataArrayOfObjects);
    dataset = { data: dataArrayOfArrays };
  } else {
    dataset = visJsonOptions.data;
  }

  const datakeys = dataset.data[0];

  // Get bindings
  const userBindingsArray = [];
  selectAll('.binding input').each(function (d) {
    // Only push bindings with values.
    if (this.value) {
      userBindingsArray.push({
        dataset: d.dataset,
        [d.key]: setColumnType(d.type, this.value, datakeys),
      });
    }
  });

  const userBindings = groupArrayToObjectByKey(userBindingsArray, 'dataset');

  // Get settings
  const state = cloneDeep(visJsonOptions.state);

  dispatch.call('blurb', this, {
    base,
    // TODO the dataset has a specific name
    // Should be straight forward if hauled in through the vis.json
    // But would need to be user mapped to the right data set if uploaded.
    data: { data: dataset },
    bindings: { bindings: userBindings },
    state: { state },
  });
}

function collectAndSubmitData() {
  select('button#submit').style('display', 'block').on('click', handleSubmit);
}

// Paths.
function emptyChartPath() {
  show('#template-selections');
  buildTemplatePickUI();
}

function baseChartPath() {
  show('#vis-id');

  select('#vis-id input').on('change', async function () {
    const visJson = await sendVisJsonRequest(this.value);
    visJsonOptions = cloneDeep(visJson); // we'll need them later to update

    const metadata = await sendMetadataRequest(visJson.template, visJson.version);

    const bindingsGiven = getObjectBindings(visJson.bindings, visJson.data, 'to_name');
    buildBindingsUi(metadata.data_bindings, bindingsGiven);

    collectAndSubmitData();
  });
}

// Base.
function getPathChoice() {
  select('#option-path')
    .selectAll('button')
    .on('click', function () {
      this.dataset.option === 'base_chart' ? baseChartPath() : emptyChartPath();
    });
}

function buildSelectUI() {
  getPathChoice();
}

export { buildSelectUI };
