import { group } from 'd3-array';
import { json } from 'd3-fetch';
import { select } from 'd3-selection';
import { apiKey } from './state.js';

async function sendRequest(templateId, version) {
  // Left out `&auto=1`
  const endpoint = `https://flourish-api.com/api/v1/live/metadata?api_key=${apiKey}&template=${encodeURIComponent(
    templateId
  )}&version=${version}`;
  const result = await json(endpoint);
  return result;
}

function buildBindingsUi(bindings) {
  const bindingsClean = bindings.filter(d => typeof d !== 'string');
  const bindingsMap = group(bindingsClean, d => d.dataset);
  console.log(bindingsMap);

  const datasets = select('#binding-selections')
    .selectAll('.dataset')
    .data(bindingsMap)
    .join('div')
    .attr('class', 'dataset')
    .attr('id', d => d[0])
    .html(d => d[0][0].toUpperCase() + d[0].substring(1));

  const bindingElements = datasets
    .selectAll('.binding')
    .data(d => d[1])
    .join('div')
    .attr('class', 'binding')
    .attr('id', d => `${d.dataset}-${d.key}`);

  bindingElements.append('input').attr('type', 'text');
  bindingElements
    .append('label')
    .attr('for', d => `input#${d.dataset}-${d.key}`)
    .html(
      d =>
        `${d.name} (${d.type === 'columns' ? 'multi' : 'single'}${d.optional ? ' | optional' : ''})`
    );
}

function buildSelectUI() {
  // This will be a static JSON unless I can find an endpoint for it.
  const templates = [
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
    .data(templates)
    .join('option')
    .attr('value', d => d.id)
    .html(d => d.id);

  // Handlers
  templateSelection.on('change', function () {
    selectedTemplateId = this.value;
    const { versions } = templates.filter(d => d.id === selectedTemplateId)[0];
    setVersionSelect(versions);
  });

  versionSelection.on('change', async function () {
    const selectedVersion = this.value;
    const response = await sendRequest(selectedTemplateId, selectedVersion);
    console.log(response);
    buildBindingsUi(response.data_bindings);
  });
}

export { buildSelectUI };
