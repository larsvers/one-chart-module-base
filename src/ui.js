import { group } from 'd3-array';
import { json } from 'd3-fetch';
import { select, selectAll } from 'd3-selection';
import { apiKey } from './state.js';

// Helpers.
function show(selector) {
  selectAll('.ui').style('display', 'none');
  select(selector).style('display', 'flex');
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

function getObjectNamedBindings(bindingObject, dataArray) {
  // There can be multiple datasets per template (ie. Projection Map has three)
  // First we loop through each dataset here and then get each dataset's bindings.
  const objectBindings = {};
  for (const bindingKey in bindingObject) {
    objectBindings[bindingKey] = getBindingNames(bindingObject[bindingKey], dataArray[bindingKey]);
  }
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

  // Build a input wrapper for each binding.
  const bindingElements = datasets
    .selectAll('.binding')
    .data(d => d[1])
    .join('div')
    .attr('class', 'binding')
    .attr('id', d => `${d.dataset}-${d.key}`);

  console.log(bindingsGiven);

  // Build labels and inputs for each binding.
  bindingElements
    .append('input')
    .attr('type', 'text')
    // Fill values if they're given in the original dataset.
    .attr('value', d => bindingsGiven[d.dataset][d.key]);

  bindingElements
    .append('label')
    .attr('for', d => `input#${d.dataset}-${d.key}`)
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
    console.log(response);
    buildBindingsUi(response.data_bindings);
  });
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
    const metadata = await sendMetadataRequest(visJson.template, visJson.version);
    const bindingsGiven = getObjectNamedBindings(visJson.bindings, visJson.data);
    buildBindingsUi(metadata.data_bindings, bindingsGiven);
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
