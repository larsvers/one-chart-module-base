/* eslint-disable no-restricted-syntax */
import { group } from 'd3-array';
import { csv, json } from 'd3-fetch';
import { select, selectAll } from 'd3-selection';
import cloneDeep from 'lodash.clonedeep';
import set from 'lodash.set';
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
// TODO we don't really need the `to_index` version anymore...
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

  // Add a data URL input.
  const dataUrl = datasets.append('div').attr('class', 'data-url');

  dataUrl
    .append('input')
    .attr('name', d => `data-url-input-${d[0]}`)
    .attr('id', d => `data-url-input-${d[0]}`);

  dataUrl
    .append('label')
    .attr('for', d => `data-url-input-${d[0]}`)
    .html(`Data URL (optional | taken from visualisation if empty)`);

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
  // Expects the binding values as names and returns
  // them as column indeces based on the column `keys`.
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

  // Get data.
  const dataInputs = selectAll('.data-url input').nodes();
  const datasets = { data: {} };
  for (const input of dataInputs) {
    const dataset = select(input).datum()[0];
    const url = input.value;
    const data = url ? convertToArrayOfArrays(await csv(url)) : visJsonOptions.data[dataset];
    datasets.data[dataset] = data;
  }

  // Get bindings
  const userBindings = { bindings: {} };
  selectAll('.binding input').each(function (d) {
    // Columns of the respective dataset.
    const dataColumns = datasets.data[d.dataset][0];
    // Only push bindings with values.
    if (this.value) {
      // https://lodash.com/docs/4.17.15#set
      set(
        userBindings.bindings,
        [d.dataset, d.key],
        setColumnType(d.type, this.value, dataColumns)
      );
    }
  });

  // Get settings
  const state = cloneDeep(visJsonOptions.state);

  // Dispatch data
  dispatch.call('apidata', this, {
    base,
    data: { ...datasets },
    bindings: { ...userBindings },
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
    // Get the user given /visualisation.json
    const visJson = await sendVisJsonRequest(this.value);
    visJsonOptions = cloneDeep(visJson); // we'll need them later to update

    // Get the template's metadata.
    const metadata = await sendMetadataRequest(visJson.template, visJson.version);

    // Convert the bindings given by the visualisation.json as column indeces to names
    // and build out the data/bindings UI.
    const bindingsGiven = getObjectBindings(visJson.bindings, visJson.data, 'to_name');
    buildBindingsUi(metadata.data_bindings, bindingsGiven);

    // Collate the data/bindings info and send final api data off.
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
