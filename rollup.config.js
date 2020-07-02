import babel from 'rollup-plugin-babel'
import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'
import autoExternal from 'rollup-plugin-auto-external'
import run from 'rollup-plugin-run'
import { eslint } from 'rollup-plugin-eslint'

const dev = process.env.ROLLUP_WATCH === 'true'

export default {
  input: './src/index.ts',
  output: {
    dir: './dist',
    format: 'cjs',
  },
  plugins: [
    autoExternal(),
    // eslint({
    //   fix: true
    // }),
    typescript({
      include: [
        './src/**/*.ts'
      ]
    }),
    resolve({
      extensions: ['.mjs', '.js', '.jsx', '.json', '.gql'],
    }),
    commonjs(),
    babel({
      exclude: 'node_modules/**',
    }),
    dev && run()
  ]
}
