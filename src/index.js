import { autoType } from 'd3-dsv';
import { csv } from 'd3-fetch';

import { dataUrl, info } from './state';
import { buildSelectUI } from './ui';
import { buildAPIChart } from './chart';

function ready(data) {
  buildSelectUI();
  buildAPIChart(info, data);
}

csv(`${dataUrl}?${Math.random()}`, autoType).then(ready);
