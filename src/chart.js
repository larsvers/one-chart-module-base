import Flourish from '@flourish/live-api';
import cloneDeep from 'lodash.clonedeep';
import set from 'lodash.set';
// For potential data wrangles:
// import { convertToArrayOfArrays, convertToArrayOfObjects } from './utils.js';

let visual;

function buildAPIChart({ base, data, bindings, state, userSettings }) {
  // Amend settings changed by user.
  const clonedState = cloneDeep(state);

  if (userSettings.length) {
    userSettings.forEach(d => {
      set(clonedState.state, d.setting, d.value);
    });
  }

  // Compose and build visual
  const apiOptions = { ...base, ...data, ...bindings, ...clonedState };

  if (!visual) {
    visual = new Flourish.Live(apiOptions);
  } else {
    visual.update(apiOptions);
  }
}

export { buildAPIChart };
