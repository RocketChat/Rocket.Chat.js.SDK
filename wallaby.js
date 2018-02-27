module.exports = function (wallaby) {
  return {
    name: 'Rokcet.Chat Bot Driver',
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
    slowTestThreshold: 200
  }
}