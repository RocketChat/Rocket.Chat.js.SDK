module.exports = function (wallaby) {
  return {
    name: 'Rocket.Chat.js.SDK',
    files: [
      "src/**/*.ts",
      { pattern: "src/**/*.spec.ts", ignore: true },
      { pattern: "src/**/*.d.ts", ignore: true },
    ],
    tests: ["src/**/*.spec.ts"],
    testFramework: 'mocha',
    env: {
      type: 'node'
    },
    compilers: {
      '**/*.ts?(x)': wallaby.compilers.typeScript({ module: 'commonjs' })
    },
    debug: true,
    slowTestThreshold: 200,
    delays: {
      run: 1000
    }
  }
}