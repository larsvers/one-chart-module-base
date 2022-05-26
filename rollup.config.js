import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
// import babel from '@rollup/plugin-babel';
// import { terser } from 'rollup-plugin-terser';

export default {
  input: 'src/index.js',
  output: {
    format: 'iife',
    file: 'bundle/app.js',
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    // babel({
    //   babelHelpers: 'bundled',
    //   exclude: ['node_modules/core-js/**'],
    //   presets: [
    //     [
    //       '@babel/preset-env',
    //       {
    //         targets: 'defaults', // change to https://github.com/browserslist/browserslist#queries
    //         useBuiltIns: 'usage',
    //         corejs: 3.22,
    //       },
    //     ],
    //   ],
    // }),
    // terser(),
  ],
  /* Cyclic dependencies are allowed in ES6, and such imports occur
     in many d3 components, so suppress those rollup warnings. */
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  },
};
